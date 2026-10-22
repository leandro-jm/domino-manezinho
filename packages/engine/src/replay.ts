import { applyMove } from './rules';
import { SENA, tileById } from './tiles';
import type { HandState, MatchConfig, MatchState, Move, Tile } from './types';

/** As mãos como foram dadas: o que sobrou com cada um mais o que cada um jogou (ordenadas por id). */
export const dealtHands = (hand: Pick<HandState, 'hands' | 'log'>): Tile[][] =>
  hand.hands.map((left, seat) =>
    [...left, ...hand.log.flatMap((m) => (m.type === 'play' && m.seat === seat ? [tileById(m.tileId)] : []))].sort(
      (x, y) => x.id - y.id,
    ),
  );

export interface HandReplay {
  number: number;
  /** Ids das pedras dadas a cada cadeira. */
  dealt: number[][];
  moves: Move[];
}

/**
 * Refaz a mão jogada por jogada a partir das mãos dadas. Devolve o estado antes da primeira jogada
 * e depois de cada uma (o último tem o resultado). `scores` é o placar antes da mão.
 */
export const replayHand = (config: MatchConfig, scores: [number, number], replay: HandReplay): MatchState[] => {
  const first = replay.moves[0];
  if (!first) throw new Error('Mão sem jogadas');
  // Quem sai sempre joga (mesa vazia aceita qualquer pedra); na 1ª mão, com a carroça de sena.
  const starter = first.seat;
  let state: MatchState = {
    config,
    scores,
    winner: null,
    seed: 0,
    hand: {
      number: replay.number,
      hands: replay.dealt.map((ids) => ids.map(tileById)),
      board: [],
      turn: starter,
      starter,
      mustOpenWith: replay.number === 1 ? SENA.id : null,
      log: [],
      galo: [0, 0],
      result: null,
    },
  };
  const states = [state];
  for (const move of replay.moves) {
    state = applyMove(state, move);
    states.push(state);
  }
  return states;
};

/** Refaz a partida inteira, mão a mão; o placar de cada mão começa onde a anterior terminou. */
export const replayMatch = (config: MatchConfig, hands: readonly HandReplay[]): MatchState[][] => {
  let scores: [number, number] = [0, 0];
  return hands.map((h) => {
    const states = replayHand(config, scores, h);
    scores = states[states.length - 1]!.scores;
    return states;
  });
};
