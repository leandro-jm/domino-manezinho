import { rankTitle, type PlayerProfile, type PlayerStats, type PublicPlayer, type PublicProfile } from '@domino/shared';
import type { Player } from './generated/prisma/client';

export const toPublic = (p: Player): PublicPlayer => ({
  id: p.id,
  nickname: p.nickname,
  tag: p.tag,
  avatarId: p.avatarId,
  rating: p.rating,
});

export const toStats = (p: Player): PlayerStats => ({
  games: p.games,
  wins: p.wins,
  practiceGames: p.practiceGames,
  practiceWins: p.practiceWins,
  carrocas: p.carrocas,
  laelos: p.laelos,
  cruzadas: p.cruzadas,
  streak: p.streak,
  bestStreak: p.bestStreak,
});

export const toPublicProfile = (p: Player): PublicProfile => ({ ...toPublic(p), title: rankTitle(p.rating), stats: toStats(p) });

export const toProfile = (p: Player): PlayerProfile => ({
  ...toPublicProfile(p),
  pushPrefs: { turn: p.pushTurn, invite: p.pushInvite, full: p.pushFull },
});
