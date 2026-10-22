import { DEFAULT_CONFIG, findTile } from '../src';
import type { MatchConfig, MatchState, Move, PlacedTile, Seat, Tile } from '../src';

export const T = (s: string): Tile => {
  const [a, b] = s.split('-').map(Number);
  return findTile(a!, b!);
};

/** Pedra já na mesa mostrando `left` do lado esquerdo. */
export const placed = (s: string, left: number, seat: Seat = 0): PlacedTile => {
  const tile = T(s);
  return { tile, left, right: tile.a === left ? tile.b : tile.a, seat };
};

export const matchWith = (opts: {
  hands: string[][];
  board?: PlacedTile[];
  turn?: Seat;
  config?: Partial<MatchConfig>;
  scores?: [number, number];
  log?: Move[];
}): MatchState => {
  const turn = opts.turn ?? 0;
  return {
    config: { ...DEFAULT_CONFIG, ...opts.config },
    scores: opts.scores ?? [0, 0],
    winner: null,
    seed: 42,
    hand: {
      number: 2,
      hands: opts.hands.map((h) => h.map(T)),
      board: opts.board ?? [],
      turn,
      starter: turn,
      mustOpenWith: null,
      log: opts.log ?? [],
      galo: [0, 0],
      result: null,
    },
  };
};
