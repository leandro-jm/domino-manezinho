import type { PublicPlayer, RankingBoard, RankingEntry } from '@domino/shared';
import type { Db } from './db';
import type { Player } from './generated/prisma/client';
import { toPublic } from './players';

export const RANKING_BOARDS: readonly RankingBoard[] = ['geral', 'semanal', 'amigos', 'treino'];
export const RANKING_TZ = 'America/Sao_Paulo';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Offset da zona (ms, local - UTC) num instante. */
const tzOffsetMs = (date: Date, timeZone: string): number => {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return (m[1] === '-' ? -1 : 1) * minutes * 60_000;
};

/** Segunda-feira 00:00 (horário de Brasília) da semana de `now`. */
export const weekStart = (now: Date = new Date(), timeZone = RANKING_TZ): Date => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const dow = WEEKDAYS.indexOf(parts.weekday ?? 'Mon');
  const localMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - dow);
  return new Date(localMidnight - tzOffsetMs(new Date(localMidnight), timeZone));
};

const entries = (rows: { player: Player; value: number; games: number; wins: number }[]): RankingEntry[] =>
  rows.map((r, i) => ({ position: i + 1, player: toPublic(r.player), value: r.value, games: r.games, wins: r.wins }));

/** Quem já dividiu mesa com o jogador, do mais recente pro mais antigo. */
export const friendIds = async (db: Db, playerId: string, limit = 100): Promise<string[]> => {
  const rows = await db.$queryRaw<{ playerId: string }[]>`
    SELECT other."playerId" AS "playerId", MAX(m."endedAt") AS last
    FROM "MatchPlayer" me
    JOIN "MatchPlayer" other ON other."matchId" = me."matchId"
      AND other."playerId" IS NOT NULL AND other."playerId" <> me."playerId"
    JOIN "Match" m ON m.id = me."matchId"
    WHERE me."playerId" = ${playerId}
    GROUP BY other."playerId"
    ORDER BY last DESC NULLS LAST
    LIMIT ${limit}`;
  return rows.map((r) => r.playerId);
};

export const listFriends = async (db: Db, playerId: string): Promise<PublicPlayer[]> => {
  const ids = await friendIds(db, playerId);
  const players = await db.player.findMany({ where: { id: { in: ids } } });
  const byId = new Map(players.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [toPublic(p)] : [];
  });
};

export const ranking = async (
  db: Db,
  board: RankingBoard,
  limit: number,
  me: string | null,
  now = new Date(),
): Promise<RankingEntry[]> => {
  // Desempate final pelo id: sem ele, empate total sai em ordem diferente a cada consulta (e a posição não bate).
  const byRating = [{ rating: 'desc' as const }, { wins: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];
  switch (board) {
    case 'geral': {
      const players = await db.player.findMany({ where: { games: { gt: 0 } }, orderBy: byRating, take: limit });
      return entries(players.map((p) => ({ player: p, value: p.rating, games: p.games, wins: p.wins })));
    }
    case 'treino': {
      const players = await db.player.findMany({
        where: { practiceGames: { gt: 0 } },
        orderBy: [{ practiceWins: 'desc' }, { practiceGames: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      return entries(players.map((p) => ({ player: p, value: p.practiceWins, games: p.practiceGames, wins: p.practiceWins })));
    }
    case 'amigos': {
      if (!me) return [];
      const ids = [me, ...(await friendIds(db, me, 500))];
      const players = await db.player.findMany({ where: { id: { in: ids } }, orderBy: byRating, take: limit });
      return entries(players.map((p) => ({ player: p, value: p.rating, games: p.games, wins: p.wins })));
    }
    case 'semanal': {
      const since = weekStart(now);
      const rows = await db.$queryRaw<{ playerId: string; delta: number; games: number; wins: number }[]>`
        SELECT mp."playerId" AS "playerId",
          SUM(mp."ratingDelta")::int AS delta,
          COUNT(*)::int AS games,
          SUM(CASE WHEN mp.team = m."winnerTeam" THEN 1 ELSE 0 END)::int AS wins
        FROM "MatchPlayer" mp
        JOIN "Match" m ON m.id = mp."matchId"
        WHERE mp."playerId" IS NOT NULL AND m.rated AND m."endedAt" >= ${since}
        GROUP BY mp."playerId"
        ORDER BY delta DESC, wins DESC, games ASC, mp."playerId" ASC
        LIMIT ${limit}`;
      const players = await db.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } });
      const byId = new Map(players.map((p) => [p.id, p]));
      return entries(
        rows.flatMap((r) => {
          const player = byId.get(r.playerId);
          return player ? [{ player, value: r.delta, games: r.games, wins: r.wins }] : [];
        }),
      );
    }
  }
};

/** Posição do jogador no ranking (com o mesmo desempate da lista), ou null se ele não aparece nele. */
export const rankingPosition = async (db: Db, board: RankingBoard, me: string, now = new Date()): Promise<RankingEntry | null> => {
  if (board === 'geral' || board === 'treino') {
    const p = await db.player.findUnique({ where: { id: me } });
    if (!p) return null;
    if (board === 'geral') {
      if (!p.games) return null;
      const ahead = await db.player.count({
        where: {
          games: { gt: 0 },
          OR: [
            { rating: { gt: p.rating } },
            { rating: p.rating, wins: { gt: p.wins } },
            { rating: p.rating, wins: p.wins, createdAt: { lt: p.createdAt } },
            { rating: p.rating, wins: p.wins, createdAt: p.createdAt, id: { lt: p.id } },
          ],
        },
      });
      return { position: ahead + 1, player: toPublic(p), value: p.rating, games: p.games, wins: p.wins };
    }
    if (!p.practiceGames) return null;
    const ahead = await db.player.count({
      where: {
        practiceGames: { gt: 0 },
        OR: [
          { practiceWins: { gt: p.practiceWins } },
          { practiceWins: p.practiceWins, practiceGames: { lt: p.practiceGames } },
          { practiceWins: p.practiceWins, practiceGames: p.practiceGames, createdAt: { lt: p.createdAt } },
          { practiceWins: p.practiceWins, practiceGames: p.practiceGames, createdAt: p.createdAt, id: { lt: p.id } },
        ],
      },
    });
    return { position: ahead + 1, player: toPublic(p), value: p.practiceWins, games: p.practiceGames, wins: p.practiceWins };
  }
  // Amigos (até 500) e semana (só quem jogou valendo na semana) são listas curtas: procura nelas.
  const all = await ranking(db, board, 10_000, me, now);
  return all.find((e) => e.player.id === me) ?? null;
};
