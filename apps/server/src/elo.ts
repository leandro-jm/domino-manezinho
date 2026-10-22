import type { Team } from '@domino/engine';

export const ELO_K = 32;

export const expectedScore = (rating: number, opponent: number): number => 1 / (1 + 10 ** ((opponent - rating) / 400));

export const teamRating = (ratings: readonly number[]): number =>
  ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

/** Variação de rating de cada humano de cada dupla (todos da dupla recebem o mesmo). */
export const eloDeltas = (teams: [number, number], winner: Team, k = ELO_K): [number, number] => {
  const delta = (team: Team): number => {
    const e = expectedScore(teams[team], teams[team === 0 ? 1 : 0]);
    const s = team === winner ? 1 : 0;
    return Math.round(k * (s - e)) + 0; // + 0 evita -0
  };
  return [delta(0), delta(1)];
};
