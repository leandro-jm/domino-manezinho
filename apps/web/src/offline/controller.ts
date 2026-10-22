import { applyMove, canonicalMove, createMatch, getPlayerView, isLegal, legalMovesForView, startNextHand } from '@domino/engine';
import type { MatchConfig, MatchState, Move, PlayerView, Seat } from '@domino/engine';
import type { MoveEvaluation } from '@domino/bots';
import { BOT_PERSONAS, type BotLevel } from '@domino/shared';
import { load, save } from '../lib/storage';
import { useProfile } from '../store/profile';
import { useTable, type Mistake, type TableSeat } from '../store/table';
import type { BotWorkerRequest } from './bot.worker';
import { reportPractice } from './results';

export const HUMAN_SEAT: Seat = 0;
const NEXT_HAND_MS = 6000;
const SAVE_KEY = 'dm:offline';
/** Sobe quando o formato salvo muda de um jeito que o código novo não lê. */
const SAVE_VERSION = 1;
/** Bot do worker que não responde nisso joga pela thread principal. */
const BOT_TIMEOUT_MS = 5000;
/**
 * Perda a partir da qual a jogada vira "lance pra pensar" (pontos esperados na mão). No modo batida a
 * mediana de quem joga a primeira pedra que serve é ~0,06 e só 1 em 4 passa de 0,25; abaixo de 0,3 é
 * ruído do Monte Carlo.
 */
const MISTAKE_LOSS = { batida: 0.3, pontos: 5 } as const;
const MAX_MISTAKES = 3;

/** Omit que respeita cada variante da união. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** O que o worker devolve para os pedidos da thread principal (dica e revisão). */
interface WorkerReply {
  id: number;
  move?: Move;
  ranked?: MoveEvaluation[] | null;
  reviews?: ({ best: Move; loss: number } | null)[] | null;
}

export interface OfflineSetup {
  partner: BotLevel;
  opponents: BotLevel;
  config: MatchConfig;
}

interface Saved {
  v?: number;
  setup: OfflineSetup;
  match: MatchState;
  personas: number[];
  batidas: { carrocas: number; laelos: number; cruzadas: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Confere o que veio do localStorage: save antigo ou corrompido não pode derrubar o app. */
const validSave = (raw: unknown): raw is Saved => {
  if (!isObj(raw) || (raw.v !== undefined && raw.v !== SAVE_VERSION)) return false;
  const { setup, match, personas, batidas } = raw;
  if (!isObj(setup) || !isObj(setup.config) || !isObj(batidas) || !Array.isArray(personas) || personas.length !== 3) return false;
  if (!personas.every((p) => typeof p === 'number' && BOT_PERSONAS[p])) return false;
  if (!isObj(match) || !isObj(match.hand) || !Array.isArray(match.hand.hands) || match.hand.hands.length !== 4) return false;
  try {
    getPlayerView(match as unknown as MatchState, HUMAN_SEAT);
    return true;
  } catch {
    return false;
  }
};

export const savedOfflineGame = (): Saved | null => {
  const saved = load<unknown>(SAVE_KEY, null);
  if (saved === null) return null;
  if (!validSave(saved)) {
    save(SAVE_KEY, null);
    return null;
  }
  return saved.match.winner === null ? saved : null;
};

/** Partida de treino rodando inteira no aparelho: engine local + bots num Web Worker. */
class OfflineGame {
  private state: Saved;
  private worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  private pending = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  /** Worker não carregou: os bots passam a jogar na thread principal. */
  private workerBroken = false;
  /** Pedidos do humano (dica, revisão) esperando o worker; ids negativos, pra não cruzar com as jogadas dos bots. */
  private readonly waiting = new Map<number, (reply: WorkerReply | null) => void>();
  private requestSeq = 0;
  /** Decisões do humano nesta mão que tinham mais de uma opção (revistas quando a mão acaba). */
  private decisions: { view: PlayerView; move: Move }[] = [];

  constructor(saved: Saved) {
    this.state = saved;
    this.worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.id < 0) return this.waiting.get(e.data.id)?.(e.data);
      if (e.data.id !== this.pending || this.stopped) return;
      const move = e.data.move;
      if (move && isLegal(this.match, move)) this.apply(move);
      else void this.fallbackBot();
    };
    // Worker que nem carrega (navegador sem module worker, chunk sumiu depois de deploy) não pode travar a mesa.
    this.worker.onerror = () => {
      this.workerBroken = true;
      void this.fallbackBot();
    };
    this.worker.onmessageerror = () => void this.fallbackBot();
  }

  /** Joga pelo bot da vez na thread principal, com o nível mais leve. */
  private async fallbackBot() {
    if (this.stopped) return;
    const match = this.match;
    const { hand, winner } = match;
    if (winner !== null || hand.result || !this.levelOf(hand.turn)) return;
    const id = ++this.pending;
    // Os bots só vêm pra thread principal quando o worker falha: ficam fora do pacote inicial do app.
    const { chooseMove } = await import('@domino/bots');
    if (this.stopped || id !== this.pending || this.match !== match) return;
    this.apply(chooseMove(getPlayerView(match, hand.turn), 'amador'));
  }

  private get match() {
    return this.state.match;
  }

  /** Dica: a jogada que o Monstro faria no meu lugar (null se não deu pra calcular a tempo). */
  private hint(): Promise<Move | null> {
    const view = this.view();
    if (view.turn !== HUMAN_SEAT || view.result) return Promise.resolve(null);
    if (this.workerBroken) {
      return import('@domino/bots')
        .then(({ rankMoves }) => rankMoves(view, { monstro: { samples: 40, timeLimitMs: 300 } })[0]?.move ?? null)
        .catch(() => null);
    }
    return this.ask({ type: 'rank', view }, BOT_TIMEOUT_MS).then((reply) => reply?.ranked?.[0]?.move ?? null);
  }

  /** Manda um pedido pro worker e espera a resposta (null se demorar demais). */
  private ask(req: DistributiveOmit<BotWorkerRequest, 'id'>, timeoutMs: number): Promise<WorkerReply | null> {
    const id = -++this.requestSeq;
    return new Promise((resolve) => {
      const done = (reply: WorkerReply | null) => {
        clearTimeout(timer);
        this.waiting.delete(id);
        resolve(reply);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      this.waiting.set(id, done);
      this.worker.postMessage({ ...req, id } as BotWorkerRequest);
    });
  }

  /** Mão acabou: o Monstro revê as decisões do humano e aponta as que renderam bem menos que a melhor. */
  private async review(handNumber: number) {
    const decisions = this.decisions;
    this.decisions = [];
    const { setState } = useTable;
    if (this.workerBroken || !decisions.length) {
      setState({ analysis: { handNumber, pending: false, reviewed: 0, mistakes: [] } });
      return;
    }
    setState({ analysis: { handNumber, pending: true, reviewed: decisions.length, mistakes: [] } });
    const reply = await this.ask({ type: 'review', decisions }, BOT_TIMEOUT_MS + decisions.length * 600);
    if (this.stopped || useTable.getState().analysis?.handNumber !== handNumber) return;
    const threshold = MISTAKE_LOSS[this.match.config.scoring];
    const mistakes: Mistake[] = (reply?.reviews ?? [])
      .flatMap((r, i) => {
        const d = decisions[i]!;
        return r && r.loss >= threshold ? [{ played: d.move, best: r.best, loss: r.loss, boardBefore: d.view.board }] : [];
      })
      .sort((a, b) => b.loss - a.loss)
      .slice(0, MAX_MISTAKES);
    setState({ analysis: { handNumber, pending: false, reviewed: reply?.reviews ? decisions.length : 0, mistakes } });
  }

  private levelOf(seat: Seat): BotLevel | null {
    if (seat === HUMAN_SEAT) return null;
    return seat === 2 ? this.state.setup.partner : this.state.setup.opponents;
  }

  start() {
    const identity = useProfile.getState();
    const me = { nickname: identity.local?.nickname ?? 'Tu', avatarId: identity.local?.avatarId ?? 'veterano' };
    const seats: TableSeat[] = [0, 1, 2, 3].map((s) => {
      if (s === HUMAN_SEAT) return { ...me, kind: 'human', connected: true };
      const persona = BOT_PERSONAS[this.state.personas[s - 1]!]!;
      return { ...persona, kind: 'bot', level: this.levelOf(s as Seat)!, connected: true };
    });
    useTable.setState({
      mode: 'offline',
      seats,
      turnDeadline: null,
      lastMove: null,
      emotes: [],
      canRematch: true,
      actions: {
        play: async (move) => this.humanPlay(move),
        emote: (id) => useTable.getState().pushEmote(HUMAN_SEAT, id),
        nextHand: () => this.nextHand(),
        hint: () => this.hint(),
        rematch: async () => {
          this.state = newSaved(this.state.setup);
          this.decisions = [];
          useTable.setState({ analysis: null });
          this.publish();
          this.schedule();
          return null;
        },
        leave: () => this.stop(),
      },
    });
    this.publish();
    this.schedule();
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.worker.terminate();
  }

  private view(): PlayerView {
    return getPlayerView(this.match, HUMAN_SEAT);
  }

  private publish() {
    save(SAVE_KEY, this.state);
    useTable.getState().setView(this.view());
  }

  private humanPlay(move: Move): string | null {
    const m = canonicalMove(this.match, { ...move, seat: HUMAN_SEAT });
    if (!m) return 'Essa pedra não encaixa aí, mané.';
    const view = this.view();
    if (legalMovesForView(view).length > 1) this.decisions.push({ view, move: m });
    this.apply(m);
    return null;
  }

  private apply(move: Move) {
    this.state = { ...this.state, match: applyMove(this.match, move) };
    // A jogada como ficou no histórico (com pontas iguais o lado é normalizado).
    useTable.getState().pushMove(this.match.hand.log[this.match.hand.log.length - 1]!);
    const result = this.match.hand.result;
    if (result?.type === 'batida' && result.seat === HUMAN_SEAT) {
      const key = ({ carroca: 'carrocas', laelo: 'laelos', cruzada: 'cruzadas', simples: null } as const)[result.kind];
      if (key) this.state.batidas = { ...this.state.batidas, [key]: this.state.batidas[key] + 1 };
    }
    this.publish();
    if (result) void this.review(this.match.hand.number);
    if (this.match.winner !== null) this.report();
    this.schedule();
  }

  /** Próxima mão sozinha; espera a revisão e, se tem lance pra pensar, deixa ler e apertar "Próxima mão". */
  private autoNextHand() {
    const analysis = useTable.getState().analysis;
    if (analysis?.pending) {
      this.timers.push(setTimeout(() => this.autoNextHand(), 1000));
      return;
    }
    if (!analysis?.mistakes.length) this.nextHand();
  }

  private nextHand() {
    if (!this.match.hand.result || this.match.winner !== null) return;
    this.timers.forEach(clearTimeout);
    this.state = { ...this.state, match: startNextHand(this.match) };
    useTable.setState({ analysis: null });
    this.publish();
    this.schedule();
  }

  private schedule() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const { hand, winner } = this.match;
    if (winner !== null) return;
    if (hand.result) {
      this.timers.push(setTimeout(() => this.autoNextHand(), NEXT_HAND_MS));
      return;
    }
    const level = this.levelOf(hand.turn);
    if (!level) return;
    const view = getPlayerView(this.match, hand.turn);
    const id = ++this.pending;
    // Bot "pensa" um pouco, como gente; o Monstro faz a conta durante a espera.
    const delay = 500 + Math.random() * 700;
    if (this.workerBroken) {
      this.timers.push(setTimeout(() => id === this.pending && void this.fallbackBot(), delay));
    } else {
      this.timers.push(setTimeout(() => this.worker.postMessage({ type: 'move', id, view, level } satisfies BotWorkerRequest), delay));
      this.timers.push(setTimeout(() => id === this.pending && void this.fallbackBot(), delay + BOT_TIMEOUT_MS));
    }
    if (Math.random() < 0.06) {
      const lines = ['olholho', 'tastolo', 'dalhe', 'segura', 'tavazado'];
      useTable.getState().pushEmote(hand.turn, lines[Math.floor(Math.random() * lines.length)]!);
    }
  }

  private report() {
    void reportPractice({ won: this.match.winner === 0, ...this.state.batidas });
  }
}

const newSaved = (setup: OfflineSetup): Saved => {
  const order = [...BOT_PERSONAS.keys()].sort(() => Math.random() - 0.5);
  return {
    v: SAVE_VERSION,
    setup,
    match: createMatch(setup.config, (Math.random() * 2 ** 31) >>> 0),
    personas: order.slice(0, 3),
    batidas: { carrocas: 0, laelos: 0, cruzadas: 0 },
  };
};

let current: OfflineGame | null = null;

export const startOfflineGame = (setup: OfflineSetup | 'resume') => {
  current?.stop();
  const saved = setup === 'resume' ? savedOfflineGame() : newSaved(setup);
  if (!saved) return false;
  try {
    current = new OfflineGame(saved);
    current.start();
    return true;
  } catch (err) {
    console.error('[treino] não deu pra retomar a partida salva', err);
    current?.stop();
    current = null;
    save(SAVE_KEY, null);
    return false;
  }
};

export const stopOfflineGame = () => {
  current?.stop();
  current = null;
};
