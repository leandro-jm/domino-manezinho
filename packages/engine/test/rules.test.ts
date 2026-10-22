import { describe, expect, it } from 'vitest';
import {
  DECK,
  SENA,
  applyMove,
  boardEnds,
  createMatch,
  getPlayerView,
  isLegal,
  knownVoids,
  legalMoves,
  pips,
  startNextHand,
} from '../src';
import type { MatchConfig, Move } from '../src';
import { T, matchWith, placed } from './helpers';

describe('pedras', () => {
  it('duplo-6 tem 28 pedras distintas e 168 pontinhos', () => {
    expect(DECK).toHaveLength(28);
    expect(new Set(DECK.map((t) => `${t.a}-${t.b}`)).size).toBe(28);
    expect(DECK.reduce((s, t) => s + pips(t), 0)).toBe(168);
  });
});

describe('início da partida', () => {
  it('distribui 7 pedras para cada um, sem repetir', () => {
    const m = createMatch({}, 123);
    expect(m.hand.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(new Set(m.hand.hands.flat().map((t) => t.id)).size).toBe(28);
  });

  it('mesma semente gera a mesma distribuição', () => {
    expect(createMatch({}, 7).hand.hands).toEqual(createMatch({}, 7).hand.hands);
    expect(createMatch({}, 7).hand.hands).not.toEqual(createMatch({}, 8).hand.hands);
  });

  it('mãos saem ordenadas (a ordem do embaralhamento não vaza) e o RNG injetado manda na distribuição', () => {
    const m = createMatch({}, 7);
    for (const h of m.hand.hands) expect(h.map((t) => t.id)).toEqual(h.map((t) => t.id).sort((a, b) => a - b));
    const fixed = () => {
      let i = 0;
      return () => ((i++ * 0.6180339887) % 1);
    };
    // Com RNG próprio a semente não influencia: é ele que embaralha.
    expect(createMatch({}, 1, fixed()).hand.hands).toEqual(createMatch({}, 2, fixed()).hand.hands);
    const done = { ...m, hand: { ...m.hand, result: { type: 'trancado' as const, team: null, pips: [0, 0] as [number, number], points: 0, galo: [0, 0] as [number, number] } } };
    expect(startNextHand(done, fixed()).hand.hands).toEqual(startNextHand({ ...done, seed: 999 }, fixed()).hand.hands);
  });

  it('na 1ª mão sai quem tem a carroça de sena, e só com ela', () => {
    const m = createMatch({}, 99);
    const starter = m.hand.turn;
    expect(m.hand.hands[starter]!.some((t) => t.id === SENA.id)).toBe(true);
    expect(legalMoves(m, starter)).toEqual([{ type: 'play', seat: starter, tileId: SENA.id, side: 'left' }]);
  });

  it('ninguém joga fora da vez', () => {
    const m = createMatch({}, 99);
    const other = ((m.hand.turn + 1) % 4) as 0 | 1 | 2 | 3;
    expect(legalMoves(m, other)).toEqual([]);
  });
});

describe('jogadas', () => {
  it('encaixa a pedra orientada na ponta escolhida', () => {
    const m = matchWith({
      hands: [['2-5', '6-6'], ['1-1'], ['1-2'], ['1-3']],
      board: [placed('2-4', 2)],
    });
    const left = applyMove(m, { type: 'play', seat: 0, tileId: T('2-5').id, side: 'left' });
    expect(boardEnds(left.hand.board)).toEqual([5, 4]);
    expect(left.hand.board[0]).toMatchObject({ left: 5, right: 2 });
    expect(left.hand.turn).toBe(1);
  });

  it('com pontas iguais aceita qualquer lado e grava a jogada canônica', () => {
    const m = matchWith({ hands: [['3-5', '6-6'], ['1-1'], ['1-2'], ['1-3']], board: [placed('3-3', 3)] });
    const right = { type: 'play', seat: 0, tileId: T('3-5').id, side: 'right', extra: 'lixo' } as unknown as Move;
    expect(isLegal(m, right)).toBe(true);
    const after = applyMove(m, right);
    expect(after.hand.log.at(-1)).toEqual({ type: 'play', seat: 0, tileId: T('3-5').id, side: 'left' });
    // Pontas diferentes: o lado continua valendo.
    const diff = matchWith({ hands: [['2-5', '6-6'], [], [], []], board: [placed('2-4', 2)] });
    expect(isLegal(diff, { type: 'play', seat: 0, tileId: T('2-5').id, side: 'right' })).toBe(false);
  });

  it('a visão do jogador é cópia e as pedras são imutáveis', () => {
    const m = matchWith({ hands: [['3-5', '6-6'], ['1-1'], ['1-2'], ['1-3']], board: [placed('3-3', 3)] });
    const v = getPlayerView(m, 0);
    v.myHand.reverse();
    v.board.pop();
    v.log.push({ type: 'pass', seat: 0 });
    expect(m.hand.hands[0]!.map((t) => t.id)).toEqual([T('3-5').id, T('6-6').id]);
    expect(m.hand.board).toHaveLength(1);
    expect(m.hand.log).toHaveLength(0);
    expect(Object.isFrozen(DECK[0])).toBe(true);
  });

  it('com pontas iguais oferece só um lado', () => {
    const m = matchWith({ hands: [['3-5', '6-6'], [], [], []], board: [placed('3-3', 3)] });
    expect(legalMoves(m, 0)).toEqual([{ type: 'play', seat: 0, tileId: T('3-5').id, side: 'left' }]);
  });

  it('pedra que encaixa nas duas pontas oferece os dois lados', () => {
    const m = matchWith({ hands: [['2-4', '6-6'], [], [], []], board: [placed('2-1', 2), placed('1-4', 1)] });
    expect(legalMoves(m, 0).map((x) => x.type === 'play' && x.side)).toEqual(['left', 'right']);
  });

  it('sem pedra que encaixe, só resta passar', () => {
    const m = matchWith({ hands: [['6-6', '5-5'], ['1-1'], [], []], board: [placed('2-4', 2)] });
    expect(legalMoves(m, 0)).toEqual([{ type: 'pass', seat: 0 }]);
    const after = applyMove(m, { type: 'pass', seat: 0 });
    expect(after.hand.turn).toBe(1);
  });

  it('rejeita jogada ilegal', () => {
    const m = matchWith({ hands: [['6-6', '5-5'], [], [], []], board: [placed('2-4', 2)] });
    const bad = { type: 'play', seat: 0, tileId: T('6-6').id, side: 'left' } as const;
    expect(isLegal(m, bad)).toBe(false);
    expect(() => applyMove(m, bad)).toThrow(/inválida/);
  });
});

describe('batidas (modo batida)', () => {
  const bater = (tile: string, board: ReturnType<typeof placed>[], side: 'left' | 'right' = 'right') => {
    const m = matchWith({ hands: [[tile], ['1-1', '6-6'], ['0-0'], ['5-6']], board });
    return applyMove(m, { type: 'play', seat: 0, tileId: T(tile).id, side });
  };
  const pontas24 = [placed('2-3', 2), placed('3-4', 3)];

  it('simples vale 1', () => {
    expect(bater('4-5', pontas24).hand.result).toMatchObject({ type: 'batida', kind: 'simples', points: 1, team: 0 });
  });

  it('de carroça vale 2', () => {
    expect(bater('4-4', pontas24).hand.result).toMatchObject({ kind: 'carroca', points: 2 });
  });

  it('lá-e-ló vale 3', () => {
    expect(bater('2-4', pontas24).hand.result).toMatchObject({ kind: 'laelo', points: 3 });
    expect(bater('2-4', pontas24, 'left').hand.result).toMatchObject({ kind: 'laelo', points: 3 });
  });

  it('cruzada (carroça nas duas pontas) vale 4', () => {
    const pontas44 = [placed('4-1', 4), placed('1-3', 1), placed('3-4', 3)];
    expect(bater('4-4', pontas44, 'left').hand.result).toMatchObject({ kind: 'cruzada', points: 4 });
  });

  it('pedra comum com pontas iguais é batida simples', () => {
    const pontas44 = [placed('4-1', 4), placed('1-3', 1), placed('3-4', 3)];
    expect(bater('4-5', pontas44, 'left').hand.result).toMatchObject({ kind: 'simples', points: 1 });
  });

  it('soma no placar e a próxima mão sai com quem bateu, sem obrigar a sena', () => {
    const m = bater('4-4', pontas24);
    expect(m.scores).toEqual([2, 0]);
    expect(legalMoves(m, 0)).toEqual([]);
    const next = startNextHand(m);
    expect(next.hand.number).toBe(3);
    expect(next.hand.turn).toBe(0);
    expect(next.hand.mustOpenWith).toBeNull();
    expect(legalMoves(next, 0)).toHaveLength(7);
  });

  it('a partida termina ao atingir o placar alvo', () => {
    const m = matchWith({ hands: [['4-4'], ['1-1'], ['0-0'], ['5-6']], board: pontas24, scores: [5, 3] });
    const end = applyMove(m, { type: 'play', seat: 0, tileId: T('4-4').id, side: 'right' });
    expect(end.scores).toEqual([7, 3]);
    expect(end.winner).toBe(0);
    expect(() => startNextHand(end)).toThrow();
  });
});

describe('modo pontos', () => {
  it('batida vale a soma das pedras da dupla adversária', () => {
    const m = matchWith({
      hands: [['4-5'], ['1-1', '6-6'], ['0-0'], ['5-6']],
      board: [placed('2-3', 2), placed('3-4', 3)],
      config: { scoring: 'pontos', targetScore: 100 },
    });
    const end = applyMove(m, { type: 'play', seat: 0, tileId: T('4-5').id, side: 'right' });
    expect(end.hand.result).toMatchObject({ type: 'batida', points: 2 + 12 + 11 });
    expect(end.scores).toEqual([25, 0]);
  });
});

describe('fim da partida', () => {
  it('empate em cima do alvo não acaba: joga outra mão até alguém passar na frente', () => {
    const m = matchWith({ hands: [['3-4'], ['6-6'], ['5-5'], ['1-1']], board: [placed('2-3', 2)], scores: [5, 6] });
    const tied = applyMove(m, { type: 'play', seat: 0, tileId: T('3-4').id, side: 'right' });
    expect(tied.scores).toEqual([6, 6]);
    expect(tied.winner).toBeNull();
    expect(() => startNextHand(tied)).not.toThrow();
  });
});

describe('trancado', () => {
  // Só o 0-5 ainda tem zero fora da mesa: ao jogá-lo, as duas pontas viram 0 e ninguém mais joga.
  const trancar = (hands: string[][], config?: Partial<MatchConfig>) => {
    const m = matchWith({ hands, board: [placed('0-1', 0), placed('1-5', 1)], config });
    return applyMove(m, { type: 'play', seat: 0, tileId: T('0-5').id, side: 'right' });
  };

  it('vence a dupla com menos pontos na mão', () => {
    const m = trancar([['0-5', '6-6'], ['1-1', '1-2'], ['2-2', '2-3'], ['3-3', '3-4']]);
    expect(m.hand.result).toEqual({ type: 'trancado', team: 1, pips: [21, 18], points: 1, galo: [0, 0] });
    expect(m.scores).toEqual([0, 1]);
    // Sai o jogador da dupla vencedora com menos pontos na mão.
    expect(startNextHand(m).hand.turn).toBe(1);
  });

  it('no modo pontos vale os pontos que a dupla perdedora tinha na mão', () => {
    const m = trancar([['0-5', '6-6'], ['1-1', '1-2'], ['2-2', '2-3'], ['3-3', '3-4']], { scoring: 'pontos', targetScore: 100 });
    expect(m.hand.result).toMatchObject({ type: 'trancado', team: 1, pips: [21, 18], points: 21 });
    expect(m.scores).toEqual([0, 21]);
  });

  it('empate não pontua e repete quem saiu', () => {
    const m = trancar([['0-5', '6-6'], ['4-4'], ['2-2'], ['3-5']]);
    expect(m.hand.result).toMatchObject({ type: 'trancado', team: null, points: 0 });
    expect(m.scores).toEqual([0, 0]);
    expect(startNextHand(m).hand.turn).toBe(m.hand.starter);
  });
});

describe('galo', () => {
  const setup = (galo: boolean) =>
    matchWith({
      hands: [['6-6', '3-3'], ['1-1', '5-5'], [], []],
      board: [placed('2-4', 2)],
      turn: 1,
      config: { galo },
      log: [{ type: 'play', seat: 0, tileId: T('2-4').id, side: 'left' }],
    });

  it('passe logo após a jogada do adversário dá ponto pra dupla que jogou', () => {
    const m = applyMove(setup(true), { type: 'pass', seat: 1 });
    expect(m.hand.galo).toEqual([1, 0]);
  });

  it('no modo pontos o galo vale 20', () => {
    const m = matchWith({
      hands: [['6-6', '3-3'], ['1-1', '5-5'], [], []],
      board: [placed('2-4', 2)],
      turn: 1,
      config: { galo: true, scoring: 'pontos', targetScore: 100 },
      log: [{ type: 'play', seat: 0, tileId: T('2-4').id, side: 'left' }],
    });
    expect(applyMove(m, { type: 'pass', seat: 1 }).hand.galo).toEqual([20, 0]);
  });

  it('só o primeiro passe depois da jogada conta', () => {
    const first = applyMove(setup(true), { type: 'pass', seat: 1 });
    const second = applyMove(first, { type: 'pass', seat: 2 });
    expect(second.hand.galo).toEqual([1, 0]);
  });

  it('desligado por padrão não pontua', () => {
    expect(applyMove(setup(false), { type: 'pass', seat: 1 }).hand.galo).toEqual([0, 0]);
  });
});

describe('visão do jogador', () => {
  it('mostra só a própria mão e a contagem dos outros', () => {
    const m = createMatch({}, 5);
    const view = getPlayerView(m, 2);
    expect(view.myHand).toEqual(m.hand.hands[2]);
    expect(view.handCounts).toEqual([7, 7, 7, 7]);
    expect(view.revealedHands).toBeNull();
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(m.hand.hands[0]));
  });
});

describe('histórico', () => {
  it('quem passou fica marcado sem os números das pontas daquele momento', () => {
    const voids = knownVoids([
      { type: 'play', seat: 0, tileId: T('6-6').id, side: 'left' },
      { type: 'play', seat: 1, tileId: T('6-2').id, side: 'right' },
      { type: 'pass', seat: 2 },
      { type: 'play', seat: 3, tileId: T('6-4').id, side: 'left' },
      { type: 'pass', seat: 0 },
    ]);
    expect([...voids[2]!].sort()).toEqual([2, 6]);
    expect([...voids[0]!].sort()).toEqual([2, 4]);
    expect(voids[1]!.size + voids[3]!.size).toBe(0);
  });
});
