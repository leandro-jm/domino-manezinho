import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { chooseMove, type MonstroOptions } from '@domino/bots';
import type { Move, PlayerView } from '@domino/engine';
import type { BotLevel } from '@domino/shared';

export interface BotRequest {
  id: number;
  view: PlayerView;
  level: BotLevel;
  monstro: MonstroOptions;
}

export type BotResponse = { id: number; move: Move } | { id: number; error: string };

/** Quem decide a jogada dos bots da mesa. */
export interface BotRunner {
  choose(view: PlayerView, level: BotLevel): Promise<Move>;
  close(): Promise<void>;
}

interface Slot {
  worker: Worker;
  busy: number;
}

interface Pending {
  resolve: (move: Move) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  slot: Slot;
}

/** Folga além do orçamento do Monstro antes de desistir do worker (máquina carregada, worker subindo). */
const TIMEOUT_SLACK_MS = 3_000;

// Rodando do TypeScript (dev, testes) o worker é o .ts e precisa do loader do tsx, que o processo nem
// sempre tem (vitest). Do bundle de produção é o .js ao lado, sem loader (o tsx nem está na imagem).
const fromSource = import.meta.url.endsWith('.ts');
const workerUrl = new URL(fromSource ? './bot.worker.ts' : './bot.worker.js', import.meta.url);
const workerArgv = (): string[] => (fromSource ? ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href] : []);

/**
 * Pool de worker_threads para o Monstro, que é CPU pura e travaria o event loop de todas as mesas.
 * O Amador é barato e roda direto. Os workers sobem no primeiro uso; com size 0 tudo roda direto.
 */
export class BotPool implements BotRunner {
  private readonly slots: Slot[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private closed = false;

  constructor(
    private readonly size: number,
    private readonly monstro: MonstroOptions,
    private readonly log: (msg: string, err?: unknown) => void,
  ) {}

  choose(view: PlayerView, level: BotLevel): Promise<Move> {
    if (level === 'amador' || this.size <= 0 || this.closed) {
      try {
        return Promise.resolve(chooseMove(view, level, { monstro: this.monstro }));
      } catch (err) {
        return Promise.reject(err as Error);
      }
    }
    const slot = this.pick();
    const id = ++this.nextId;
    return new Promise<Move>((resolve, reject) => {
      const timer = setTimeout(() => this.settle(id, new Error('bot demorou demais')), (this.monstro.timeLimitMs ?? 600) + TIMEOUT_SLACK_MS);
      this.pending.set(id, { resolve, reject, timer, slot });
      slot.busy++;
      slot.worker.postMessage({ id, view, level, monstro: this.monstro } satisfies BotRequest);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const id of [...this.pending.keys()]) this.settle(id, new Error('servidor desligando'));
    await Promise.all(this.slots.splice(0).map((s) => s.worker.terminate()));
  }

  /** O menos ocupado; sobe worker novo enquanto não chegou no tamanho. */
  private pick(): Slot {
    const idle = this.slots.find((s) => s.busy === 0);
    if (idle) return idle;
    if (this.slots.length < this.size) return this.spawn();
    return this.slots.reduce((a, b) => (b.busy < a.busy ? b : a));
  }

  private spawn(): Slot {
    const worker = new Worker(workerUrl, { execArgv: workerArgv() });
    worker.unref();
    const slot: Slot = { worker, busy: 0 };
    worker.on('message', (res: BotResponse) => this.settle(res.id, 'move' in res ? res.move : new Error(res.error)));
    const lost = (err: unknown) => {
      // Worker morreu: quem esperava por ele cai no plano B da mesa, e o próximo pedido sobe outro.
      const i = this.slots.indexOf(slot);
      if (i < 0) return;
      this.slots.splice(i, 1);
      if (!this.closed) this.log('worker de bot caiu', err);
      for (const [id, p] of this.pending) if (p.slot === slot) this.settle(id, new Error('worker de bot caiu'));
    };
    worker.on('error', lost);
    worker.on('exit', (code) => lost(new Error(`saiu com código ${code}`)));
    this.slots.push(slot);
    return slot;
  }

  private settle(id: number, result: Move | Error): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.slot.busy--;
    if (result instanceof Error) p.reject(result);
    else p.resolve(result);
  }
}
