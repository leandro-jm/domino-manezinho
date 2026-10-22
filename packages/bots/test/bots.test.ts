import { describe, expect, it } from 'vitest';
import { applyMove, createMatch, createRng, getPlayerView, hasValue, isLegal, knownVoids, legalMoves, legalMovesForView } from '@domino/engine';
import { chooseMove, playBotMatch, rankMoves, reviewMove, sampleHands } from '../src';

describe('sorteio de mãos', () => {
  it('respeita a quantidade de pedras e os números que cada um não tem', () => {
    let m = createMatch({}, 11);
    const rng = createRng(1);
    // Avança a mão com jogadas aleatórias até alguém ter passado.
    while (!m.hand.result && !m.hand.log.some((x) => x.type === 'pass')) {
      const moves = legalMoves(m, m.hand.turn);
      m = applyMove(m, moves[Math.floor(rng() * moves.length)]!);
    }
    const view = getPlayerView(m, m.hand.turn);
    const voids = knownVoids(view.log);
    for (let i = 0; i < 50; i++) {
      const hands = sampleHands(view, rng);
      expect(hands.map((h) => h.length)).toEqual(view.handCounts);
      expect(hands[view.seat]).toEqual(view.myHand);
      hands.forEach((h, s) => {
        for (const t of h) for (const v of voids[s]!) if (s !== view.seat) expect(hasValue(t, v)).toBe(false);
      });
      const ids = [...hands.flat(), ...view.board.map((p) => p.tile)].map((t) => t.id);
      expect(new Set(ids).size).toBe(28);
    }
  });
});

describe('sorteio de mãos sob muitos passes', () => {
  it('nunca dá a ninguém um número que ele já mostrou não ter', () => {
    const rng = createRng(5);
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let m = createMatch({}, seed);
      while (!m.hand.result) {
        const view = getPlayerView(m, m.hand.turn);
        const voids = knownVoids(view.log);
        if (voids.some((v, s) => s !== view.seat && v.size)) {
          checked++;
          const hands = sampleHands(view, rng);
          hands.forEach((h, s) => {
            if (s === view.seat) return;
            for (const t of h) for (const v of voids[s]!) expect(hasValue(t, v)).toBe(false);
          });
        }
        const moves = legalMoves(m, m.hand.turn);
        m = applyMove(m, moves[Math.floor(rng() * moves.length)]!);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('bots', () => {
  it('não joga depois que a mão acabou', () => {
    let m = createMatch({}, 9);
    while (!m.hand.result) m = applyMove(m, legalMoves(m, m.hand.turn)[0]!);
    expect(() => chooseMove(getPlayerView(m, m.hand.turn), 'amador')).toThrow(/acabou/);
  });

  it.each(['amador', 'praca', 'monstro'] as const)('%s só faz jogada legal, inclusive a saída com a sena', (level) => {
    const m = createMatch({}, 3);
    const move = chooseMove(getPlayerView(m, m.hand.turn), level, { rng: createRng(2), monstro: { samples: 10 } });
    expect(isLegal(m, move)).toBe(true);
  });

  it('partidas entre bots sempre terminam', () => {
    const m = playBotMatch(['monstro', 'amador', 'amador', 'monstro'], 77, {}, { monstro: { samples: 10 } });
    expect(m.winner).not.toBeNull();
  });

  it('o Monstro ganha do Amador na maioria das partidas', () => {
    let wins = 0;
    const games = 30;
    for (let g = 0; g < games; g++) {
      const team = g % 2;
      const levels = [0, 1, 2, 3].map((s) => (s % 2 === team ? 'monstro' : 'amador')) as Parameters<typeof playBotMatch>[0];
      if (playBotMatch(levels, 500 + g, {}, { monstro: { samples: 30 } }).winner === team) wins++;
    }
    expect(wins / games).toBeGreaterThanOrEqual(0.65);
  }, 60_000);

  it('o Bom de praça fica entre os dois: ganha do Amador na maioria', () => {
    // Orçamento fixo (não depende do relógio): com as mesmas sementes o resultado é sempre o mesmo.
    let wins = 0;
    const games = 60;
    for (let g = 0; g < games; g++) {
      const team = g % 2;
      const levels = [0, 1, 2, 3].map((s) => (s % 2 === team ? 'praca' : 'amador')) as Parameters<typeof playBotMatch>[0];
      if (playBotMatch(levels, 900 + g).winner === team) wins++;
    }
    expect(wins / games).toBeGreaterThanOrEqual(0.6);
  }, 60_000);
});

describe('avaliação das jogadas', () => {
  /** Primeira posição com escolha de verdade (a saída com a carroça de sena é forçada). */
  const choicePosition = (seed: number) => {
    let m = createMatch({}, seed);
    while (legalMoves(m, m.hand.turn).length < 2) m = applyMove(m, legalMoves(m, m.hand.turn)[0]!);
    return getPlayerView(m, m.hand.turn);
  };
  const budget = { samples: 30, timeLimitMs: 60_000 };

  it('avalia cada jogada legal uma vez, da melhor para a pior, com o mesmo número de simulações', () => {
    const view = choicePosition(3);
    const ranked = rankMoves(view, { rng: createRng(9), monstro: budget });
    expect(ranked.map((r) => r.move).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(
      legalMovesForView(view).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.value).toBeGreaterThanOrEqual(ranked[i]!.value);
    expect(new Set(ranked.map((r) => r.rollouts))).toEqual(new Set([budget.samples * 2]));
  });

  it('o Monstro joga a primeira da lista (mesma semente, mesma conta)', () => {
    for (const seed of [3, 8, 21]) {
      const view = choicePosition(seed);
      const best = rankMoves(view, { rng: createRng(seed), monstro: budget })[0]!;
      expect(chooseMove(view, 'monstro', { rng: createRng(seed), monstro: budget })).toEqual(best.move);
    }
  });

  it('revisão: a melhor jogada não perde nada; a pior perde a diferença pra melhor', () => {
    const view = choicePosition(8);
    const ranked = rankMoves(view, { rng: createRng(4), monstro: budget });
    const best = reviewMove(view, ranked[0]!.move, { rng: createRng(4), monstro: budget });
    expect(best.loss).toBe(0);
    const worst = reviewMove(view, ranked.at(-1)!.move, { rng: createRng(4), monstro: budget });
    expect(worst.best.move).toEqual(ranked[0]!.move);
    expect(worst.loss).toBeCloseTo(ranked[0]!.value - ranked.at(-1)!.value);
    expect(() => reviewMove(view, { type: 'pass', seat: view.seat }, { monstro: budget })).toThrow();
  });
});
