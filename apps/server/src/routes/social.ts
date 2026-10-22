import { CLIENT_ERROR_KINDS, type PublicPlayer, type RankingBoard, type RankingEntry } from '@domino/shared';
import type { FastifyInstance } from 'fastify';
import { optionalPlayerId, requirePlayerId } from '../auth';
import { RATE_LIMITS } from '../config';
import type { AppContext } from '../context';
import { badRequest, forbidden, HttpError, notFound, unauthorized } from '../errors';
import { RateLimiter } from '../limits';
import { toPublic } from '../players';
import { RANKING_BOARDS, listFriends, ranking, rankingPosition } from '../ranking';

const INVITE_COOLDOWN_MS = 10_000;
const HEALTH_DB_TIMEOUT_MS = 2_000;
/** Convites por remetente numa janela, para quaisquer destinatários. */
const INVITE_WINDOW_MS = 60_000;
const INVITES_PER_WINDOW = 10;
const MAX_SUBSCRIPTIONS = 5;
const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;

/** Endpoint https num host de push conhecido (o próprio host ou subdomínio dele). */
export const isPushEndpoint = (raw: string, hosts: readonly string[]): boolean => {
  if (raw.length > MAX_ENDPOINT) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
};

export const socialRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { db, tokens, push, notifier, rooms, results } = ctx;
  const samePair = new RateLimiter(1, INVITE_COOLDOWN_MS);
  const sent = new RateLimiter(INVITES_PER_WINDOW, INVITE_WINDOW_MS);

  app.get('/api/ranking', async (req): Promise<RankingEntry[]> => {
    const q = req.query as Record<string, string | undefined>;
    const board = (q.board ?? 'geral') as RankingBoard;
    if (!RANKING_BOARDS.includes(board)) throw badRequest('Ranking desconhecido.');
    const n = Number(q.limit ?? 50);
    const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 50;
    const me = await optionalPlayerId(req, tokens);
    if (board === 'amigos' && !me) throw unauthorized();
    return ranking(db, board, limit, me);
  });

  app.get('/api/ranking/position', async (req): Promise<RankingEntry | null> => {
    const board = ((req.query as Record<string, string | undefined>).board ?? 'geral') as RankingBoard;
    if (!RANKING_BOARDS.includes(board)) throw badRequest('Ranking desconhecido.');
    return rankingPosition(db, board, await requirePlayerId(req, tokens));
  });

  app.get('/api/friends', async (req): Promise<PublicPlayer[]> => listFriends(db, await requirePlayerId(req, tokens)));

  app.get('/api/push/key', async () => ({ publicKey: push.publicKey }));

  app.post('/api/push/subscribe', async (req, reply) => {
    const playerId = await requirePlayerId(req, tokens);
    if (!push.enabled) throw new HttpError(503, 'Notificação tá desligada no servidor.');
    const b = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const { endpoint } = b;
    const p256dh = b.keys?.p256dh;
    const auth = b.keys?.auth;
    if (
      typeof endpoint !== 'string' ||
      !isPushEndpoint(endpoint, ctx.config.pushHosts) ||
      typeof p256dh !== 'string' ||
      typeof auth !== 'string' ||
      p256dh.length > MAX_KEY ||
      auth.length > MAX_KEY
    ) {
      throw badRequest('Inscrição de notificação inválida.');
    }
    // A mais antiga sai para caber a nova (aparelhos trocados deixam inscrição velha pra trás).
    const existing = await db.pushSubscription.findMany({
      where: { playerId, NOT: { endpoint } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing.length >= MAX_SUBSCRIPTIONS) {
      await db.pushSubscription.deleteMany({ where: { id: { in: existing.slice(MAX_SUBSCRIPTIONS - 1).map((x) => x.id) } } });
    }
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, playerId },
      update: { p256dh, auth, playerId },
    });
    reply.code(201);
    return { ok: true };
  });

  app.delete('/api/push/subscribe', async (req) => {
    const playerId = await requirePlayerId(req, tokens);
    const endpoint = (req.body as { endpoint?: unknown } | undefined)?.endpoint;
    if (typeof endpoint !== 'string') throw badRequest('Faltou o endpoint.');
    await db.pushSubscription.deleteMany({ where: { endpoint, playerId } });
    return { ok: true };
  });

  app.post('/api/rooms/:code/invite', async (req) => {
    const meId = await requirePlayerId(req, tokens);
    const { code } = req.params as { code: string };
    const room = rooms.get(code);
    if (!room || room.closed) throw notFound('Essa mesa não existe mais.');
    if (room.seatOf(meId) === null) throw forbidden('Só quem tá sentado na mesa pode chamar gente.');
    const targetId = (req.body as { playerId?: unknown } | undefined)?.playerId;
    if (typeof targetId !== 'string') throw badRequest('Faltou quem tu quer chamar.');
    if (targetId === meId) throw badRequest('Chamar a ti mesmo não vale, mané!');
    const [me, target] = await Promise.all([
      db.player.findUnique({ where: { id: meId } }),
      db.player.findUnique({ where: { id: targetId } }),
    ]);
    if (!me) throw unauthorized('Jogador não encontrado. Cria teu jogador de novo.');
    if (!target) throw notFound('Esse jogador não existe.');
    const key = `${meId}:${targetId}`;
    const now = Date.now();
    if (!samePair.allows(key, now)) throw new HttpError(429, 'Calma, já chamaste esse aí. Dá um tempinho.');
    if (!sent.allows(meId, now)) throw new HttpError(429, 'Chamaste gente demais, espera um minutinho.');
    samePair.hit(key, now);
    sent.hit(meId, now);
    // Com o app na frente o convite aparece na tela; push só pra quem não está olhando.
    ctx.sendInvite(target.id, { from: toPublic(me), code: room.code });
    const onScreen = rooms.isVisible(target.id);
    const delivered = onScreen ? 1 : await notifier.invite(toPublic(me), target.id, room.code);
    return { ok: true, delivered };
  });

  // Erro no aparelho do jogador: vai pro log e pra métrica. Sem conta (pode quebrar antes do cadastro);
  // o tamanho de cada campo é cortado e o limite por IP segura enxurrada.
  app.post('/api/client-errors', { config: { rateLimit: RATE_LIMITS.clientErrors } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const kind = CLIENT_ERROR_KINDS.find((k) => k === b.kind);
    if (!kind || typeof b.message !== 'string') throw badRequest('Erro mal descrito.');
    const cut = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    ctx.reportClientError(kind);
    req.log.warn(
      { clientError: { kind, message: cut(b.message, 500), stack: cut(b.stack, 4000), path: cut(b.path, 200), ua: cut(req.headers['user-agent'], 300) } },
      'erro no app',
    );
    return reply.code(204).send();
  });

  // Processo de pé (health check do container). Banco fora não conta: as mesas seguem em memória,
  // e reiniciar o app nessa hora só derrubaria partida.
  app.get('/api/health/live', async () => ({ ok: true }));

  app.get('/api/health', async (_req, reply) => {
    // Banco travado não pode travar o health check: quem monitora precisa de resposta rápida.
    const dbOk = await Promise.race([
      db.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), HEALTH_DB_TIMEOUT_MS).unref()),
    ]);
    if (!dbOk) reply.code(503);
    return { ok: dbOk, db: dbOk, rooms: rooms.size, push: push.enabled, pendingResults: results.size };
  });
};
