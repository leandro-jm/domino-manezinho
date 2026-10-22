import type { BatidaKind, MatchConfig, Move, Seat, Team } from '@domino/engine';
import { BOT_LEVELS, DEFAULT_AVATAR_ID, isBotLevel, type MatchDetail, type MatchPage, type MatchSeat, type MatchSummary } from '@domino/shared';
import type { Db } from './db';
import type { Hand, Match, MatchPlayer, Player } from './generated/prisma/client';

export const HISTORY_PAGE = 20;

type MatchRow = Match & { players: (MatchPlayer & { player: Player | null })[]; _count: { hands: number } };

const toSeat = (p: MatchRow['players'][number]): MatchSeat => {
  const botLevel = isBotLevel(p.botLevel) ? p.botLevel : null;
  const human = p.botLevel === null;
  return {
    seat: p.seat as Seat,
    team: p.team as Team,
    kind: human ? 'human' : 'bot',
    nickname: human
      ? (p.player?.nickname ?? 'Jogador que saiu')
      : (p.botNickname ?? `Bot ${botLevel ? BOT_LEVELS[botLevel].label : ''}`.trim()),
    avatarId: (human ? p.player?.avatarId : p.botAvatarId) ?? DEFAULT_AVATAR_ID,
    playerId: p.playerId,
    botLevel,
    ratingBefore: p.ratingBefore,
    ratingDelta: p.ratingDelta,
  };
};

const toSummary = (m: MatchRow, playerId: string): MatchSummary => ({
  id: m.id,
  endedAt: (m.endedAt ?? m.startedAt).toISOString(),
  config: { scoring: m.scoring as MatchConfig['scoring'], targetScore: m.targetScore, galo: m.galo },
  rated: m.rated,
  winnerTeam: m.winnerTeam as Team | null,
  scores: (m.scores as [number, number] | null) ?? null,
  mySeat: m.players.find((p) => p.playerId === playerId)!.seat as Seat,
  seats: m.players.map(toSeat).sort((a, b) => a.seat - b.seat),
  handCount: m._count.hands,
});

const include = { players: { include: { player: true } }, _count: { select: { hands: true } } } as const;

/** Partidas do jogador, da mais recente pra mais antiga, `HISTORY_PAGE` por vez. */
export const listMatches = async (db: Db, playerId: string, before?: Date): Promise<MatchPage> => {
  const rows = await db.match.findMany({
    where: { endedAt: before ? { lt: before } : { not: null }, players: { some: { playerId } } },
    orderBy: { endedAt: 'desc' },
    take: HISTORY_PAGE + 1,
    include,
  });
  const page = rows.slice(0, HISTORY_PAGE);
  const more = rows.length > HISTORY_PAGE;
  return { matches: page.map((m) => toSummary(m, playerId)), next: more ? page[page.length - 1]!.endedAt!.toISOString() : null };
};

const toHand = (h: Hand): MatchDetail['hands'][number] => ({
  number: h.number,
  result: h.result as 'batida' | 'trancado',
  kind: h.kind as BatidaKind | null,
  winnerTeam: h.winnerTeam as Team | null,
  points: h.points,
  moves: h.moves as unknown as Move[],
  dealt: (h.dealt as number[][] | null) ?? null,
});

/** Partida com as mãos, só para quem jogou nela (as mãos de todo mundo aparecem). Null se não achou ou não jogou. */
export const matchDetail = async (db: Db, id: string, playerId: string): Promise<MatchDetail | null> => {
  const m = await db.match.findUnique({ where: { id }, include: { ...include, hands: { orderBy: { number: 'asc' } } } });
  if (!m || !m.players.some((p) => p.playerId === playerId)) return null;
  return { ...toSummary(m, playerId), hands: m.hands.map(toHand) };
};
