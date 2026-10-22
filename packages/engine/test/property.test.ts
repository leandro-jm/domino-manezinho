import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SEATS, applyMove, createMatch, dealtHands, getPlayerView, isLegal, legalMoves, legalMovesForView, replayMatch, startNextHand } from '../src';
import type { HandReplay, HandResult, MatchConfig, MatchState } from '../src';

/** Joga uma partida inteira escolhendo jogadas legais ao acaso, verificando invariantes a cada passo. */
const playRandomMatch = (seed: number, picks: number[], config: Partial<MatchConfig>): MatchState => {
  let m = createMatch(config, seed);
  let step = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    if (m.winner !== null) return m;
    if (m.hand.result) {
      m = startNextHand(m);
      continue;
    }
    const moves = legalMoves(m, m.hand.turn);
    expect(moves.length).toBeGreaterThan(0);
    // Quem só enxerga a própria mão chega nas mesmas jogadas (e quem não está na vez, em nenhuma).
    for (const s of SEATS) expect(legalMovesForView(getPlayerView(m, s))).toEqual(legalMoves(m, s));
    const move = moves[picks[step++ % picks.length]! % moves.length]!;
    expect(isLegal(m, move)).toBe(true);
    const before = m.scores;
    m = applyMove(m, move);

    const ids = [...m.hand.board.map((p) => p.tile.id), ...m.hand.hands.flat().map((t) => t.id)];
    expect(new Set(ids).size).toBe(28);
    for (let i = 1; i < m.hand.board.length; i++) {
      expect(m.hand.board[i - 1]!.right).toBe(m.hand.board[i]!.left);
    }
    expect(m.scores[0]).toBeGreaterThanOrEqual(before[0]);
    expect(m.scores[1]).toBeGreaterThanOrEqual(before[1]);
  }
  throw new Error('partida não terminou');
};

describe('partidas aleatórias', () => {
  const arb = fc.tuple(fc.integer({ min: 0, max: 2 ** 31 }), fc.array(fc.nat(50), { minLength: 1, maxLength: 64 }));

  it('modo batida: sempre termina, mesa encadeada e pedras conservadas', () => {
    fc.assert(
      fc.property(arb, fc.boolean(), ([seed, picks], galo) => {
        const m = playRandomMatch(seed, picks, { galo });
        expect(Math.max(...m.scores)).toBeGreaterThanOrEqual(6);
      }),
      { numRuns: 300 },
    );
  });

  it('modo pontos até 100', () => {
    fc.assert(
      fc.property(arb, ([seed, picks]) => {
        const m = playRandomMatch(seed, picks, { scoring: 'pontos', targetScore: 100 });
        expect(Math.max(...m.scores)).toBeGreaterThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});

describe('replay', () => {
  it('refaz a partida a partir das mãos dadas e chega no mesmo placar e nos mesmos resultados', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.array(fc.nat(50), { minLength: 1, maxLength: 64 }), fc.boolean(), (seed, picks, galo) => {
        let m = createMatch({ galo }, seed);
        const played: { replay: HandReplay; result: HandResult; scores: [number, number] }[] = [];
        let step = 0;
        while (m.winner === null) {
          if (m.hand.result) {
            m = startNextHand(m);
            continue;
          }
          const moves = legalMoves(m, m.hand.turn);
          m = applyMove(m, moves[picks[step++ % picks.length]! % moves.length]!);
          if (m.hand.result) {
            played.push({
              replay: { number: m.hand.number, dealt: dealtHands(m.hand).map((h) => h.map((t) => t.id)), moves: m.hand.log },
              result: m.hand.result,
              scores: m.scores,
            });
          }
        }
        const replayed = replayMatch(m.config, played.map((p) => p.replay));
        replayed.forEach((states, i) => {
          const last = states[states.length - 1]!;
          expect(last.hand.result).toEqual(played[i]!.result);
          expect(last.scores).toEqual(played[i]!.scores);
          expect(states).toHaveLength(played[i]!.replay.moves.length + 1);
          expect(states[0]!.hand.hands.flat()).toHaveLength(28);
        });
      }),
      { numRuns: 150 },
    );
  });
});
