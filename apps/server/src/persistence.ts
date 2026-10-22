import { teamOf, type HandResult, type MatchConfig, type Move, type Seat, type Team } from '@domino/engine';
import { BOT_LEVELS, type BotLevel } from '@domino/shared';
import type { Db } from './db';
import { eloDeltas, teamRating } from './elo';
import { Prisma, type Player } from './generated/prisma/client';

export interface SeatRecord {
  seat: Seat;
  playerId: string | null;
  botLevel: BotLevel | null;
  /** Personagem do bot (resultado salvo antes do histórico existir não tem). */
  botNickname?: string | null;
  botAvatarId?: string | null;
}

export interface HandRecord {
  number: number;
  result: HandResult;
  log: Move[];
  /** Ids das pedras dadas a cada cadeira, para refazer a mão no histórico. */
  dealt?: number[][];
}

export interface FinishedMatch {
  /** Id fixo desde o começo da partida: gravar de novo (tentativa, mesa restaurada) não duplica. */
  id: string;
  roomCode: string;
  config: MatchConfig;
  startedAt: Date;
  endedAt: Date;
  winner: Team;
  /** Placar final (resultado salvo antes do histórico existir não tem). */
  scores?: [number, number];
  seats: SeatRecord[];
  hands: HandRecord[];
}

export interface BatidaCounts {
  carrocas: number;
  laelos: number;
  cruzadas: number;
}

/** Batidas especiais feitas por cada cadeira ao longo da partida. */
export const countBatidas = (hands: readonly HandRecord[]): Record<Seat, BatidaCounts> => {
  const counts = [0, 1, 2, 3].map(() => ({ carrocas: 0, laelos: 0, cruzadas: 0 })) as unknown as Record<Seat, BatidaCounts>;
  for (const { result } of hands) {
    if (result.type !== 'batida') continue;
    const c = counts[result.seat];
    if (result.kind === 'carroca') c.carrocas++;
    else if (result.kind === 'laelo') c.laelos++;
    else if (result.kind === 'cruzada') c.cruzadas++;
  }
  return counts;
};

/** Regras contra farm de rating com contas de mentira. */
export const RATED_RULES = {
  /** Conta com pelo menos essa idade conta para valer ranking... */
  minAccountAgeMs: 24 * 60 * 60_000,
  /** ...ou com essa quantidade de partidas online gravadas pelo servidor. */
  minMatches: 5,
  /** Vitórias valendo rating contra o mesmo adversário humano por janela; depois disso não sobe mais. */
  sameOpponentLimit: 3,
  sameOpponentWindowMs: 24 * 60 * 60_000,
} as const;

/** Partida vale ranking quando tem pelo menos dois humanos elegíveis (conta nova recém-criada não conta). */
export const isRated = (seats: readonly SeatRecord[], eligible: ReadonlySet<string>): boolean =>
  seats.filter((s) => s.playerId && eligible.has(s.playerId)).length >= 2;

/** Elegível: conta antiga o bastante ou com partidas online suficientes. */
export const isEligible = (player: Pick<Player, 'createdAt'>, matches: number, now: Date): boolean =>
  now.getTime() - player.createdAt.getTime() >= RATED_RULES.minAccountAgeMs || matches >= RATED_RULES.minMatches;

/**
 * Grava partida, jogadores e mãos e atualiza rating/estatísticas numa transação só.
 * Retorna os jogadores humanos já atualizados.
 */
export const persistMatch = async (db: Db, m: FinishedMatch): Promise<Player[]> => {
  const batidas = countBatidas(m.hands);
  const humanIds = m.seats.flatMap((s) => (s.playerId ? [s.playerId] : []));
  const now = m.endedAt;

  return db.$transaction(async (tx) => {
    const players = await tx.player.findMany({ where: { id: { in: humanIds } } });
    const byId = new Map(players.map((p) => [p.id, p]));
    // Já gravada (tentativa anterior que gravou mas não respondeu, ou mesa restaurada que terminou de novo).
    if (await tx.match.findUnique({ where: { id: m.id }, select: { id: true } })) return players;

    const counts = await tx.matchPlayer.groupBy({ by: ['playerId'], where: { playerId: { in: humanIds } }, _count: { _all: true } });
    const matchesOf = new Map(counts.map((c) => [c.playerId, c._count._all]));
    const eligible = new Set(players.filter((p) => isEligible(p, matchesOf.get(p.id) ?? 0, now)).map((p) => p.id));
    const rated = isRated(m.seats, eligible);

    // Quem já jogou valendo contra algum desses adversários vezes demais na janela não ganha mais rating deles.
    // Dupla de humanos contra bots não tem adversário humano: aí o limite vale contra o parceiro,
    // senão duas contas da mesma pessoa subiriam sem fim batendo nos bots.
    const capped = new Set<string>();
    if (rated) {
      const since = new Date(now.getTime() - RATED_RULES.sameOpponentWindowMs);
      for (const s of m.seats) {
        if (!s.playerId || !byId.has(s.playerId)) continue;
        const team = teamOf(s.seat);
        const humansOn = (sameTeam: boolean) =>
          m.seats.flatMap((o) => (o.playerId && o.playerId !== s.playerId && (teamOf(o.seat) === team) === sameTeam ? [o.playerId] : []));
        const opponents = humansOn(false);
        const others = opponents.length ? opponents : humansOn(true);
        if (!others.length) continue;
        const sameTeam = !opponents.length;
        const facing = (me: number) => ({
          AND: [
            { players: { some: { playerId: s.playerId, team: me } } },
            { players: { some: { playerId: { in: others }, team: sameTeam ? me : 1 - me } } },
          ],
        });
        const previous = await tx.match.count({
          where: { rated: true, endedAt: { gte: since }, OR: [facing(0), facing(1)] },
        });
        if (previous >= RATED_RULES.sameOpponentLimit) capped.add(s.playerId);
      }
    }

    const ratingOf = (s: SeatRecord): number =>
      s.playerId ? (byId.get(s.playerId)?.rating ?? 1000) : BOT_LEVELS[s.botLevel ?? 'amador'].rating;
    const teams: [number, number] = [0, 1].map((t) =>
      teamRating(m.seats.filter((s) => teamOf(s.seat) === t).map(ratingOf)),
    ) as [number, number];
    const deltas = rated ? eloDeltas(teams, m.winner) : ([0, 0] as [number, number]);
    const deltaOf = (s: SeatRecord): number => {
      const d = deltas[teamOf(s.seat)];
      return s.playerId && capped.has(s.playerId) ? Math.min(d, 0) : d;
    };

    await tx.match.create({
      data: {
        id: m.id,
        roomCode: m.roomCode,
        scoring: m.config.scoring,
        targetScore: m.config.targetScore,
        galo: m.config.galo,
        rated,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        winnerTeam: m.winner,
        scores: m.scores ?? Prisma.DbNull,
        players: {
          create: m.seats.map((s) => {
            const player = s.playerId ? byId.get(s.playerId) : undefined;
            return {
              playerId: player ? player.id : null,
              botLevel: s.botLevel,
              botNickname: s.botNickname ?? null,
              botAvatarId: s.botAvatarId ?? null,
              seat: s.seat,
              team: teamOf(s.seat),
              ratingBefore: player ? player.rating : null,
              ratingDelta: s.playerId ? deltaOf(s) : 0,
            };
          }),
        },
        hands: {
          create: m.hands.map((h) => ({
            number: h.number,
            result: h.result.type,
            kind: h.result.type === 'batida' ? h.result.kind : null,
            winnerTeam: h.result.team,
            points: h.result.points,
            moves: h.log as object[],
            dealt: h.dealt ?? Prisma.DbNull,
          })),
        },
      },
    });

    const updated: Player[] = [];
    for (const s of m.seats) {
      const p = s.playerId ? byId.get(s.playerId) : undefined;
      if (!p) continue;
      const team = teamOf(s.seat);
      const won = team === m.winner;
      const c = batidas[s.seat];
      const counters = {
        carrocas: { increment: c.carrocas },
        laelos: { increment: c.laelos },
        cruzadas: { increment: c.cruzadas },
      };
      const streak = won ? p.streak + 1 : 0;
      const data = rated
        ? {
            ...counters,
            // increment: o jogador pode fechar duas partidas ao mesmo tempo (saiu de uma no meio).
            rating: { increment: deltaOf(s) },
            games: { increment: 1 },
            wins: { increment: won ? 1 : 0 },
            streak,
            bestStreak: Math.max(p.bestStreak, streak),
          }
        : { ...counters, practiceGames: { increment: 1 }, practiceWins: { increment: won ? 1 : 0 } };
      updated.push(await tx.player.update({ where: { id: p.id }, data }));
    }
    return updated;
  }, { maxWait: 5_000, timeout: 15_000 });
};
