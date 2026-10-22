import { tileById } from './tiles';
import type { Move } from './types';

/**
 * Números que cada jogador comprovadamente não tem: quem passou não tinha pedra
 * para nenhuma das pontas daquele momento, e mão de dominó só diminui.
 */
export const knownVoids = (log: readonly Move[]): Set<number>[] => {
  const voids = [0, 1, 2, 3].map(() => new Set<number>());
  let ends: [number, number] | null = null;
  for (const move of log) {
    if (move.type === 'pass') {
      if (ends) voids[move.seat]!.add(ends[0]).add(ends[1]);
      continue;
    }
    const t = tileById(move.tileId);
    if (!ends) ends = [t.a, t.b];
    else if (move.side === 'left') ends = [t.a === ends[0] ? t.b : t.a, ends[1]];
    else ends = [ends[0], t.a === ends[1] ? t.b : t.a];
  }
  return voids;
};
