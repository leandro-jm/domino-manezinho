import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseMove } from '@domino/bots';
import { createMatch, legalMovesForView, type Move } from '@domino/engine';
import type { BotWorkerRequest } from './bot.worker';

/** Worker de mentira: responde como o de verdade (bots reais), ou falha, conforme o teste pede. */
class FakeWorker {
  static last: FakeWorker | null = null;
  /** Perda que a revisão devolve pra cada jogada do humano. */
  static reviewLoss = 0;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: BotWorkerRequest[] = [];
  broken = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(req: BotWorkerRequest) {
    this.posted.push(req);
    if (this.broken) return;
    setTimeout(() => {
      if (req.type === 'move') this.onmessage?.({ data: { id: req.id, move: chooseMove(req.view, 'amador') } });
      else if (req.type === 'review') {
        const reviews = req.decisions.map((d) => ({ best: legalMovesForView(d.view).find((m) => JSON.stringify(m) !== JSON.stringify(d.move))!, loss: FakeWorker.reviewLoss }));
        this.onmessage?.({ data: { id: req.id, reviews } });
      } else this.onmessage?.({ data: { id: req.id, ranked: [{ move: legalMovesForView(req.view)[0], value: 1, rollouts: 2 }] } });
    }, 0);
  }
  terminate() {}
}

const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
});
vi.stubGlobal('Worker', FakeWorker);
vi.mock('./results', () => ({ reportPractice: vi.fn(async () => undefined) }));

const { savedOfflineGame, startOfflineGame, stopOfflineGame } = await import('./controller');
const { useTable } = await import('../store/table');

/** Partida salva com a semente escolhida: o teste não depende de sorteio. */
const resumeWithSeed = (seed: number) => {
  data.set(
    'dm:offline',
    JSON.stringify({
      v: 1,
      setup: { partner: 'amador', opponents: 'amador', config: { scoring: 'batida', targetScore: 6, galo: false } },
      match: createMatch({}, seed),
      personas: [0, 1, 2],
      batidas: { carrocas: 0, laelos: 0, cruzadas: 0 },
    }),
  );
  expect(startOfflineGame('resume')).toBe(true);
};

/** Joga a mão inteira: o humano sempre a primeira jogada legal, os bots pelo worker (tempo correndo à toa). */
const playHand = async () => {
  const hand = useTable.getState().view!.handNumber;
  for (let i = 0; i < 400; i++) {
    const view = useTable.getState().view!;
    if (view.handNumber !== hand || view.result) return;
    if (view.turn === view.seat) await useTable.getState().actions!.play(legalMovesForView(view)[0]!);
    else await vi.advanceTimersByTimeAsync(1500);
  }
  throw new Error('a mão não terminou');
};

beforeEach(() => {
  vi.useFakeTimers();
  data.clear();
  FakeWorker.reviewLoss = 0;
  useTable.getState().reset();
});
afterEach(() => {
  stopOfflineGame();
  vi.useRealTimers();
});

describe('treino offline', () => {
  it('save estragado é jogado fora em vez de derrubar o app', () => {
    data.set('dm:offline', JSON.stringify({ v: 1, setup: {}, match: { hand: 'lixo' } }));
    expect(savedOfflineGame()).toBeNull();
    expect(data.has('dm:offline')).toBe(false);
  });

  it('jogada que não encaixa é recusada com mensagem', async () => {
    resumeWithSeed(3);
    // Espera até ser a vez do humano.
    for (let i = 0; i < 20 && useTable.getState().view!.turn !== 0; i++) await vi.advanceTimersByTimeAsync(1500);
    const view = useTable.getState().view!;
    const legal = new Set(legalMovesForView(view).flatMap((m) => (m.type === 'play' ? [m.tileId] : [])));
    const bad = view.myHand.find((t) => !legal.has(t.id));
    // Com essa semente o humano tem pedra que não serve na primeira vez dele.
    expect(bad).toBeDefined();
    const msg = await useTable.getState().actions!.play({ type: 'play', seat: 0, tileId: bad!.id, side: 'left' });
    expect(msg).toMatch(/não encaixa/);
  });

  it('worker que não carrega: os bots seguem jogando na thread principal', async () => {
    resumeWithSeed(5);
    const worker = FakeWorker.last!;
    worker.broken = true;
    const log = () => useTable.getState().view!.log.length;
    const humanTurn = () => useTable.getState().view!.turn === 0;
    // Chega a vez de um bot e ele pede a jogada ao worker quebrado; o erro chega e a thread principal joga.
    while (humanTurn()) await useTable.getState().actions!.play(legalMovesForView(useTable.getState().view!)[0]!);
    await vi.advanceTimersByTimeAsync(1500);
    expect(worker.posted.at(-1)?.type).toBe('move');
    const before = log();
    worker.onerror?.();
    await vi.advanceTimersByTimeAsync(10);
    await vi.dynamicImportSettled();
    expect(log()).toBe(before + 1);
    // Daí em diante nem tenta o worker: os bots jogam direto.
    const posted = worker.posted.length;
    for (let i = 0; i < 6; i++) {
      if (humanTurn()) await useTable.getState().actions!.play(legalMovesForView(useTable.getState().view!)[0]!);
      else await vi.advanceTimersByTimeAsync(1500);
      await vi.dynamicImportSettled();
    }
    expect(log()).toBeGreaterThan(before + 3);
    expect(worker.posted.filter((p) => p.type === 'move').length).toBe(posted);
  });

  it('dica: devolve uma jogada que dá pra fazer agora', async () => {
    resumeWithSeed(8);
    for (let i = 0; i < 20 && useTable.getState().view!.turn !== 0; i++) await vi.advanceTimersByTimeAsync(1500);
    const hint = useTable.getState().actions!.hint!();
    await vi.advanceTimersByTimeAsync(10);
    const move = (await hint) as Move;
    expect(legalMovesForView(useTable.getState().view!)).toContainEqual(move);
  });

  it('sem lance pra pensar a próxima mão vem sozinha; com lance, espera o jogador', async () => {
    resumeWithSeed(11);
    await playHand();
    await vi.advanceTimersByTimeAsync(10);
    const clean = useTable.getState().analysis!;
    expect(clean.pending).toBe(false);
    expect(clean.mistakes).toEqual([]);
    await vi.advanceTimersByTimeAsync(7000);
    expect(useTable.getState().view!.handNumber).toBe(2);

    FakeWorker.reviewLoss = 1;
    await playHand();
    await vi.advanceTimersByTimeAsync(10);
    const analysis = useTable.getState().analysis!;
    // Com essa semente o humano tem escolha em algumas jogadas da 2ª mão (senão não haveria o que revisar).
    expect(analysis.reviewed).toBeGreaterThan(0);
    expect(analysis.mistakes.length).toBe(Math.min(analysis.reviewed, 3));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(useTable.getState().view!.handNumber).toBe(2);
    useTable.getState().actions!.nextHand!();
    expect(useTable.getState().view!.handNumber).toBe(3);
    expect(useTable.getState().analysis).toBeNull();
  });
});
