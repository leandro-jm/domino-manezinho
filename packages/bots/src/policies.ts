import { applyMove, isDouble, legalMoves, pips, tileById } from '@domino/engine';
import type { MatchState, Move, PlayerView, Rng, Team } from '@domino/engine';

const tileScore = (move: Move): number => {
  if (move.type === 'pass') return -1;
  const t = tileById(move.tileId);
  return pips(t) + (isDouble(t) ? 4 : 0);
};

/** Amador: joga meio no chute; às vezes lembra de largar as pedras pesadas. */
export const amadorMove = (view: PlayerView, moves: Move[], rng: Rng): Move => {
  if (rng() < 0.35) return moves.reduce((best, m) => (tileScore(m) > tileScore(best) ? m : best));
  return moves[Math.floor(rng() * moves.length)]!;
};

/** Política rápida usada nas simulações do Monstro: larga carroças e pedras pesadas, com um pouco de acaso. */
export const rolloutMove = (match: MatchState, rng: Rng): Move => {
  const moves = legalMoves(match, match.hand.turn);
  if (moves.length === 1 || rng() < 0.15) return moves[Math.floor(rng() * moves.length)]!;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = tileScore(m) + rng();
    if (s > bestScore) [best, bestScore] = [m, s];
  }
  return best;
};

/** Valor do fim da mão do ponto de vista da dupla `team` (positivo = bom). */
export const handValue = (match: MatchState, team: Team): number => {
  const result = match.hand.result!;
  const galo = result.galo[team] - result.galo[team === 0 ? 1 : 0];
  if (result.team === null) return galo;
  return (result.team === team ? result.points : -result.points) + galo;
};

export const rollout = (start: MatchState, rng: Rng): MatchState => {
  let m = start;
  while (!m.hand.result) m = applyMove(m, rolloutMove(m, rng));
  return m;
};
