import type { PublicPlayer } from '@domino/shared';
import type { FinishedMatch } from './persistence';

/** Espera entre tentativas de gravar um resultado pendente (a última se repete). */
export const RESULT_RETRY_MS = [1_000, 2_000, 5_000, 15_000, 30_000, 60_000];

/** Depois de tantas falhas seguidas, o resultado deixa de segurar a fila (continua sendo tentado). */
export const SKIP_AFTER_FAILURES = 3;

export interface ResultQueueDeps {
  persist: (m: FinishedMatch) => Promise<PublicPlayer[]>;
  /** Resultado que estava pendente foi gravado (para a mesa mostrar o rating novo). */
  onSaved: (m: FinishedMatch, players: PublicPlayer[]) => void;
  log: (msg: string, err?: unknown) => void;
  retryMs?: readonly number[];
}

/** Partida terminada em JSON (datas viram texto) para ir junto no arquivo de estado. */
export type SavedResult = Omit<FinishedMatch, 'startedAt' | 'endedAt'> & { startedAt: string; endedAt: string };

/**
 * Grava resultados de partida sem perder nenhum quando o banco falha: tenta na hora e, se não der,
 * guarda na fila e tenta de novo com espera crescente até conseguir. A gravação é idempotente pelo id
 * da partida, então repetir é seguro.
 */
export class ResultQueue {
  private pending: FinishedMatch[] = [];
  private timer: NodeJS.Timeout | null = null;
  private attempt = 0;
  /** Falhas seguidas por partida. */
  private readonly failures = new Map<string, number>();
  private flushing = false;
  private stopped = false;

  constructor(private readonly deps: ResultQueueDeps) {}

  get size(): number {
    return this.pending.length;
  }

  /** Jogadores atualizados, ou null se o resultado ficou na fila para gravar depois. */
  async save(m: FinishedMatch): Promise<PublicPlayer[] | null> {
    // Com fila andando, entra no fim dela (o banco provavelmente ainda está fora).
    if (!this.pending.length) {
      try {
        return await this.deps.persist(m);
      } catch (err) {
        this.deps.log(`resultado da mesa ${m.roomCode} ficou pendente: banco falhou`, err);
      }
    }
    this.pending.push(m);
    this.arm();
    return null;
  }

  /**
   * Grava a fila em ordem e para no primeiro erro (banco fora: espera mais e tenta tudo de novo).
   * Um resultado que já falhou várias vezes seguidas é pulado e fica na fila, para um dado estragado
   * que nunca grava não segurar os outros.
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.timer = null;
    try {
      let failed = false;
      for (const m of [...this.pending]) {
        if (this.stopped) break;
        try {
          const players = await this.deps.persist(m);
          this.pending.splice(this.pending.indexOf(m), 1);
          this.failures.delete(m.id);
          this.deps.onSaved(m, players);
        } catch (err) {
          failed = true;
          const n = (this.failures.get(m.id) ?? 0) + 1;
          this.failures.set(m.id, n);
          this.deps.log(`resultado pendente da mesa ${m.roomCode} ainda não gravou (tentativa ${n})`, err);
          if (n < SKIP_AFTER_FAILURES) break;
        }
      }
      this.attempt = failed ? this.attempt + 1 : 0;
    } finally {
      this.flushing = false;
    }
    this.arm();
  }

  private arm(): void {
    if (this.timer || this.flushing || this.stopped || !this.pending.length) return;
    const steps = this.deps.retryMs ?? RESULT_RETRY_MS;
    const delay = steps[Math.min(this.attempt, steps.length - 1)]!;
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  toSaved(): SavedResult[] {
    return this.pending.map((m) => ({ ...m, startedAt: m.startedAt.toISOString(), endedAt: m.endedAt.toISOString() }));
  }

  restore(saved: readonly SavedResult[]): void {
    for (const s of saved) this.pending.push({ ...s, startedAt: new Date(s.startedAt), endedAt: new Date(s.endedAt) });
    this.arm();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
