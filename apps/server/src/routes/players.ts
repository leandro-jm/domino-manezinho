import { AVATARS, PUSH_KINDS, isAvatarUnlocked, validateNickname, type AuthResponse, type PlayerProfile, type PublicProfile, type TransferCode } from '@domino/shared';
import type { FastifyInstance } from 'fastify';
import { requirePlayerId } from '../auth';
import { TRANSFER_ALPHABET, randomCode, randomTag } from '../codes';
import { RATE_LIMITS } from '../config';
import type { AppContext } from '../context';
import { badRequest, forbidden, HttpError, notFound, unauthorized } from '../errors';
import type { Player } from '../generated/prisma/client';
import { RateLimiter } from '../limits';
import { toProfile, toPublicProfile } from '../players';

const TRANSFER_TTL_MS = 10 * 60_000;
/** 31^8 ≈ 8,5e11 combinações: com o limite de tentativas por IP, força bruta não chega lá. */
export const TRANSFER_CODE_LENGTH = 8;

const body = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

const checkNickname = (raw: unknown): string => {
  if (typeof raw !== 'string') throw badRequest('Faltou o apelido.');
  const res = validateNickname(raw);
  if (!res.ok) throw badRequest(res.error);
  return res.nickname;
};

const checkAvatar = (raw: unknown, totalWins: number): string => {
  const avatar = AVATARS.find((a) => a.id === raw);
  if (!avatar) throw badRequest('Esse personagem não existe.');
  if (!isAvatarUnlocked(avatar, totalWins)) {
    throw forbidden(`${avatar.name} ainda tá bloqueado: precisa de ${avatar.unlockWins} vitórias.`);
  }
  return avatar.id;
};

export const playerRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { db, tokens } = ctx;
  const practice = new RateLimiter(1, ctx.config.timings.practiceCooldownMs);

  const me = async (id: string): Promise<Player> => {
    const p = await db.player.findUnique({ where: { id } });
    if (!p) throw unauthorized('Jogador não encontrado. Cria teu jogador de novo.');
    return p;
  };

  const auth = async (player: Player): Promise<AuthResponse> => ({
    token: await tokens.sign(player.id, player.tokenVersion),
    player: toProfile(player),
  });

  /** Tag aleatória que ainda não existe para esse apelido. */
  const freeTag = async (nickname: string, exceptId?: string): Promise<string> => {
    for (let i = 0; i < 20; i++) {
      const tag = randomTag();
      const clash = await db.player.findFirst({ where: { nickname, tag, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
      if (!clash) return tag;
    }
    throw new HttpError(409, 'Esse apelido tá muito disputado, tenta outro.');
  };

  app.post('/api/players', { config: { rateLimit: RATE_LIMITS.createPlayer } }, async (req, reply): Promise<AuthResponse> => {
    const b = body(req.body);
    const nickname = checkNickname(b.nickname);
    const avatarId = checkAvatar(b.avatarId, 0);
    // Dois cadastros com o mesmo apelido ao mesmo tempo podem sortear a mesma tag: tenta de novo em vez de dar 500.
    let player: Player | undefined;
    for (let i = 0; !player; i++) {
      try {
        player = await db.player.create({ data: { nickname, avatarId, tag: await freeTag(nickname) } });
      } catch (err) {
        if (i >= 3 || (err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    reply.code(201);
    return auth(player);
  });

  app.get('/api/players/me', async (req): Promise<PlayerProfile> => {
    const id = await requirePlayerId(req, tokens);
    await me(id);
    return toProfile(await db.player.update({ where: { id }, data: { lastSeenAt: new Date() } }));
  });

  /** Troca o token por um novo com a mesma versão: quem abre o app de vez em quando nunca vê o token vencer. */
  app.post('/api/players/me/token', async (req): Promise<AuthResponse> => auth(await me(await requirePlayerId(req, tokens))));

  app.patch('/api/players/me', async (req): Promise<PlayerProfile> => {
    const player = await me(await requirePlayerId(req, tokens));
    const b = body(req.body);
    const data: { nickname?: string; tag?: string; avatarId?: string; pushTurn?: boolean; pushInvite?: boolean; pushFull?: boolean } = {};
    if (b.nickname !== undefined) {
      const nickname = checkNickname(b.nickname);
      if (nickname !== player.nickname) {
        data.nickname = nickname;
        const clash = await db.player.findFirst({ where: { nickname, tag: player.tag, NOT: { id: player.id } } });
        if (clash) data.tag = await freeTag(nickname, player.id);
      }
    }
    // Só vitória online desbloqueia: o resultado do treino é informado pelo próprio aparelho.
    if (b.avatarId !== undefined) data.avatarId = checkAvatar(b.avatarId, player.wins);
    if (b.pushPrefs !== undefined) {
      const prefs = b.pushPrefs as Record<string, unknown> | null;
      if (typeof prefs !== 'object' || prefs === null) throw badRequest('Preferência de notificação inválida.');
      const column = { turn: 'pushTurn', invite: 'pushInvite', full: 'pushFull' } as const;
      for (const kind of PUSH_KINDS) {
        const v = prefs[kind];
        if (v === undefined) continue;
        if (typeof v !== 'boolean') throw badRequest('Preferência de notificação inválida.');
        data[column[kind]] = v;
      }
    }
    return toProfile(await db.player.update({ where: { id: player.id }, data }));
  });

  // LGPD: tudo que o servidor guarda sobre o jogador, num arquivo só.
  app.get('/api/players/me/export', async (req, reply) => {
    const player = await me(await requirePlayerId(req, tokens));
    const [subscriptions, seats] = await Promise.all([
      db.pushSubscription.findMany({ where: { playerId: player.id }, select: { endpoint: true, createdAt: true } }),
      db.matchPlayer.findMany({
        where: { playerId: player.id },
        select: { seat: true, team: true, ratingBefore: true, ratingDelta: true, match: { select: { id: true, startedAt: true, endedAt: true, rated: true, winnerTeam: true, scores: true } } },
        orderBy: { match: { endedAt: 'desc' } },
      }),
    ]);
    const { tokenVersion: _, ...data } = player;
    reply.header('Content-Disposition', 'attachment; filename="domino-manezinho-meus-dados.json"');
    return { exportedAt: new Date().toISOString(), player: data, pushSubscriptions: subscriptions, matches: seats };
  });

  // LGPD: apaga a conta. Nas partidas antigas a cadeira fica como "jogador que saiu" (o histórico dos outros segue).
  app.delete('/api/players/me', async (req, reply) => {
    const player = await me(await requirePlayerId(req, tokens));
    ctx.rooms.roomOf(player.id)?.leave(player.id);
    // Inscrições de push e códigos de transferência vão junto (cascade); MatchPlayer fica sem jogador.
    await db.player.delete({ where: { id: player.id } });
    ctx.disconnectPlayer(player.id);
    return reply.code(204).send();
  });

  // Perfil de outro jogador (tocou no ranking): título e números, nada de preferência nem aparelho.
  app.get('/api/players/:id', async (req): Promise<PublicProfile> => {
    const { id } = req.params as { id: string };
    const p = await db.player.findUnique({ where: { id } });
    if (!p) throw notFound('Esse jogador não existe.');
    return toPublicProfile(p);
  });

  app.post('/api/players/me/transfer', async (req): Promise<TransferCode> => {
    const player = await me(await requirePlayerId(req, tokens));
    await db.transferCode.deleteMany({ where: { OR: [{ playerId: player.id }, { expiresAt: { lt: new Date() } }] } });
    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
    for (let i = 0; ; i++) {
      const code = randomCode(TRANSFER_CODE_LENGTH, TRANSFER_ALPHABET);
      try {
        await db.transferCode.create({ data: { code, playerId: player.id, expiresAt } });
        return { code, expiresAt: expiresAt.toISOString() };
      } catch (err) {
        if (i >= 5) throw err;
      }
    }
  });

  app.post('/api/players/claim', { config: { rateLimit: RATE_LIMITS.claim } }, async (req): Promise<AuthResponse> => {
    const raw = body(req.body).code;
    if (typeof raw !== 'string' || !raw.trim()) throw badRequest('Faltou o código.');
    const code = raw.trim().toUpperCase();
    // deleteMany garante uso único mesmo com dois pedidos ao mesmo tempo.
    const found = await db.transferCode.findUnique({ where: { code } });
    const used = found ? await db.transferCode.deleteMany({ where: { id: found.id } }) : { count: 0 };
    if (!found || !used.count || found.expiresAt.getTime() < Date.now()) {
      throw notFound('Código inválido ou vencido. Gera outro no aparelho antigo.');
    }
    // O aparelho antigo perde o acesso: o token dele tem a versão anterior, e o socket aberto cai na hora.
    await me(found.playerId);
    const player = await db.player.update({ where: { id: found.playerId }, data: { tokenVersion: { increment: 1 } } });
    ctx.disconnectPlayer(player.id);
    return auth(player);
  });

  app.post('/api/practice', async (req): Promise<PlayerProfile> => {
    const player = await me(await requirePlayerId(req, tokens));
    const b = body(req.body);
    if (typeof b.won !== 'boolean') throw badRequest('Resultado do treino inválido.');
    const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, 50) : 0);
    if (!practice.take(player.id)) throw new HttpError(429, 'Devagar, mané! Espera um pouquinho pra registrar outro treino.');
    const updated = await db.player.update({
      where: { id: player.id },
      data: {
        practiceGames: { increment: 1 },
        practiceWins: { increment: b.won ? 1 : 0 },
        carrocas: { increment: count(b.carrocas) },
        laelos: { increment: count(b.laelos) },
        cruzadas: { increment: count(b.cruzadas) },
        lastSeenAt: new Date(),
      },
    });
    return toProfile(updated);
  });
};
