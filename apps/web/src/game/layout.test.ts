import { describe, expect, it } from 'vitest';
import { applyMove, createMatch, createRng, legalMoves } from '@domino/engine';
import type { MatchState } from '@domino/engine';
import { TILE_L, TILE_W, layoutBoard, type TileSlot } from './layout';

const extents = (t: TileSlot) => (t.dx !== 0 ? [TILE_L / 2, TILE_W / 2] : [TILE_W / 2, TILE_L / 2]);

const overlaps = (a: TileSlot, b: TileSlot) => {
  const [ax, az] = extents(a);
  const [bx, bz] = extents(b);
  return Math.abs(a.x - b.x) < ax! + bx! - 1e-6 && Math.abs(a.z - b.z) < az! + bz! - 1e-6;
};

/** Joga uma mão inteira ao acaso, guardando a mesa mais cheia. */
const randomHand = (seed: number): MatchState => {
  const rng = createRng(seed);
  let m = createMatch({}, seed);
  while (!m.hand.result) {
    const moves = legalMoves(m, m.hand.turn);
    m = applyMove(m, moves[Math.floor(rng() * moves.length)]!);
  }
  return m;
};

describe('disposição das pedras na mesa', () => {
  it('mesa vazia mostra só a ponta do meio', () => {
    expect(layoutBoard([], []).ends).toHaveLength(1);
  });

  it('nenhuma pedra fica por cima de outra e todas cabem na mesa', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { board, log } = randomHand(seed).hand;
      const { tiles, ends } = layoutBoard(board, log);
      expect(tiles).toHaveLength(board.length);
      for (let i = 0; i < tiles.length; i++) {
        expect(Math.abs(tiles[i]!.x)).toBeLessThan(5.2);
        expect(Math.abs(tiles[i]!.z)).toBeLessThan(5.2);
        for (let j = i + 1; j < tiles.length; j++) expect(overlaps(tiles[i]!, tiles[j]!), `seed ${seed}`).toBe(false);
      }
      expect(ends.map((e) => e.value)).toEqual([board[0]!.left, board[board.length - 1]!.right]);
    }
  });
});
