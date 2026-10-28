import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ClientErrorKind, RoomInvite } from '@domino/shared';
import { Server } from 'socket.io';
import { createTokenService } from './auth';
import { DEFAULT_TIMINGS, loadConfig, RATE_LIMITS, type ServerConfig, type Timings } from './config';
import type { AppContext } from './context';
import { createDb, type Db } from './db';
import { HttpError } from './errors';
import { Metrics } from './metrics';
import { persistMatch } from './persistence';
import { toPublic } from './players';
import { PushService, type PushSender } from './push';
import { ResultQueue } from './results';
import { renderPage, robotsTxt, sitemapXml } from './seo';
import { StateStore } from './state';
import { RoomManager } from './rooms/manager';
import { Notifier } from './rooms/notifier';
import type { TypedServer } from './rooms/types';
import { BotPool } from './rooms/bots';
import { attachSockets, playerChannel } from './rooms/socket';
import { matchRoutes } from './routes/matches';
import { playerRoutes } from './routes/players';
import { socialRoutes } from './routes/social';

export interface BuildOptions {
  config?: Partial<Omit<ServerConfig, 'timings'>> & { timings?: Partial<Timings> };
  /** Usa um Prisma já criado (não é desconectado no close). */
  db?: Db;
  /** Substitui o envio real de web-push (testes). */
  pushSender?: PushSender;
  logger?: boolean;
}

export interface BuiltServer {
  app: FastifyInstance;
  io: TypedServer;
  ctx: AppContext;
}

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const buildServer = async (opts: BuildOptions = {}): Promise<BuiltServer> => {
  const base = loadConfig();
  const config: ServerConfig = {
    ...base,
    ...opts.config,
    timings: { ...DEFAULT_TIMINGS, ...base.timings, ...opts.config?.timings },
  };

  const hops = config.trustProxy;
  const trustProxy = typeof hops === 'number' ? (_addr: string, hop: number) => hop < hops : hops;
  const app = Fastify({ logger: opts.logger ?? false, trustProxy });
  const log = (msg: string, err?: unknown) => app.log.error({ err }, msg);

  const db = opts.db ?? createDb(config.databaseUrl);
  const tokens = createTokenService(config.jwtSecret, async (id) => {
    const p = await db.player.findUnique({ where: { id }, select: { tokenVersion: true } });
    return p ? p.tokenVersion : null;
  });
  const push = new PushService(db, config.vapid, opts.pushSender, log);
  const notifier = new Notifier(push, config.timings.turnPushDebounceMs, log);

  const origin = config.corsOrigins ?? LOCALHOST;
  await app.register(cors, { origin, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'data:', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  if (config.rateLimit) await app.register(rateLimit, { global: true, ...RATE_LIMITS.global });

  const io: TypedServer = new Server(app.server, { cors: { origin }, path: '/socket.io' });
  // Resultado que o banco recusou fica na fila e é gravado depois; a mesa recebe o rating novo quando sair.
  const results = new ResultQueue({
    persist: async (m) => (await persistMatch(db, m)).map(toPublic),
    onSaved: (m, players) => {
      const room = rooms.get(m.roomCode);
      if (room?.currentMatchId === m.id) room.applyPlayers(players);
    },
    log,
  });
  const metrics = new Metrics();
  metrics.counter('domino_matches_finished_total', 'Partidas online que terminaram');
  metrics.counter('domino_socket_throttled_total', 'Eventos de socket descartados pelo limite por jogador');
  metrics.histogram('domino_socket_ack_seconds', 'Tempo até o ack de cada evento de socket');
  metrics.histogram('domino_http_request_seconds', 'Tempo de resposta das rotas HTTP');
  metrics.counter('domino_client_errors_total', 'Erros relatados pelo app, por tipo');
  const bots = new BotPool(config.botWorkers, config.monstro, log);
  const rooms = new RoomManager({
    io,
    timings: config.timings,
    bots,
    notifier,
    persist: (m) => {
      metrics.inc('domino_matches_finished_total');
      return results.save(m);
    },
    log,
  });

  // Mesas e resultados pendentes sobrevivem a reinício/deploy: salvos num arquivo e remontados ao subir.
  const store = config.stateDir ? new StateStore(config.stateDir, log) : null;
  const saveState = () => store?.save({ rooms: rooms.toSaved(), pendingResults: results.toSaved() });
  const saved = store?.load();
  if (saved) {
    results.restore(saved.pendingResults);
    const fresh = Date.now() - Date.parse(saved.savedAt) <= config.timings.restoreMaxAgeMs;
    const restored = fresh ? rooms.restore(saved.rooms, config.timings.restoreGraceMs) : 0;
    app.log.info(`estado restaurado: ${restored}/${saved.rooms.length} mesas, ${saved.pendingResults.length} resultados pendentes`);
  }
  const saver = store ? setInterval(saveState, config.timings.stateSaveMs) : null;
  saver?.unref();

  const disconnectPlayer = (playerId: string) => io.in(playerChannel(playerId)).disconnectSockets(true);
  const sendInvite = (playerId: string, invite: RoomInvite) => io.to(playerChannel(playerId)).emit('invite', invite);
  const reportClientError = (kind: ClientErrorKind) => metrics.inc('domino_client_errors_total', { kind });
  const ctx: AppContext = { config, db, tokens, push, notifier, rooms, results, saveState, disconnectPlayer, sendInvite, reportClientError };

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(err.code ? { error: err.message, code: err.code } : { error: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'Requisição inválida.' });
    }
    log('erro inesperado', err);
    return reply.code(500).send({ error: 'Deu ruim aqui no servidor, tenta de novo.' });
  });

  playerRoutes(app, ctx);
  matchRoutes(app, ctx);
  socialRoutes(app, ctx);
  attachSockets(io, { tokens, db, rooms, log, metrics });

  metrics.gauge('domino_rooms', 'Mesas abertas', () => rooms.size);
  metrics.gauge('domino_rooms_playing', 'Mesas com partida rolando', () => rooms.playing);
  metrics.gauge('domino_sockets', 'Conexões de socket abertas', () => io.engine.clientsCount);
  metrics.gauge('domino_results_pending', 'Resultados esperando o banco voltar', () => results.size);
  app.addHook('onResponse', async (req, reply) => {
    // Rota com parâmetro agrupada pelo molde (/api/matches/:id), não por id.
    const route = req.routeOptions.url ?? 'desconhecida';
    metrics.observe('domino_http_request_seconds', reply.elapsedTime / 1000, { route, status: `${Math.floor(reply.statusCode / 100)}xx` });
  });
  if (config.metricsToken) {
    const expected = `Bearer ${config.metricsToken}`;
    app.get('/api/metrics', async (req, reply) => {
      if (req.headers.authorization !== expected) return reply.code(404).send({ error: 'Não achei isso aí.' });
      return reply.type('text/plain; version=0.0.4').send(metrics.render());
    });
  }

  const webDist = config.webDist ? resolve(config.webDist) : null;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // O index.html sai pelo renderPage (título e canonical de cada rota), nunca cru.
      index: false,
      cacheControl: false,
      // Arquivos com hash no nome são eternos; index, service worker e manifest sempre revalidam (senão o PWA não atualiza).
      setHeaders: (reply, filePath) => {
        const immutable = filePath.includes(`${sep}assets${sep}`);
        reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  } else if (webDist) {
    app.log.warn(`WEB_DIST não encontrado: ${webDist}`);
  }
  const serveSpa = !!webDist && existsSync(resolve(webDist, 'index.html'));
  const template = serveSpa ? readFileSync(resolve(webDist, 'index.html'), 'utf8') : '';
  const originOf = (req: FastifyRequest) => config.publicUrl ?? `${req.protocol}://${req.host}`;
  const sendPage = (req: FastifyRequest, reply: FastifyReply, path: string) =>
    reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(renderPage(template, path, originOf(req)));
  if (serveSpa) {
    app.get('/', (req, reply) => sendPage(req, reply, '/'));
    // O service worker guarda essa e serve em qualquer navegação offline: vai com os dados da home.
    app.get('/index.html', (req, reply) => sendPage(req, reply, '/'));
    app.get('/robots.txt', (req, reply) => reply.header('Cache-Control', 'no-cache').type('text/plain; charset=utf-8').send(robotsTxt(originOf(req))));
    app.get('/sitemap.xml', (req, reply) => reply.header('Cache-Control', 'no-cache').type('application/xml; charset=utf-8').send(sitemapXml(originOf(req))));
  }

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    // Arquivo com extensão que não existe (modelo, chunk de build antigo) é 404 de verdade: devolver o index.html
    // com 200 faz o service worker guardar HTML no lugar do arquivo.
    const isFile = /\.[a-z0-9]+$/i.test(path.split('/').pop() ?? '');
    if (serveSpa && req.method === 'GET' && !isFile && !path.startsWith('/api') && !path.startsWith('/socket.io')) {
      return sendPage(req, reply, path);
    }
    return reply.code(404).send({ error: 'Não achei isso aí.' });
  });

  app.addHook('preClose', async () => {
    if (saver) clearInterval(saver);
    results.stop();
    if (store) {
      // Salva e só pausa as mesas: os apps reconectam sozinhos e voltam pra mesma cadeira no servidor novo.
      saveState();
      rooms.suspend();
    } else {
      if (results.size) log(`desligando com ${results.size} resultado(s) sem gravar (STATE_DIR não configurado)`);
      rooms.shutdown();
    }
    io.disconnectSockets(true);
    io.engine.close();
  });
  app.addHook('onClose', async () => {
    metrics.stop();
    await bots.close();
    if (!opts.db) await db.$disconnect();
  });

  return { app, io, ctx };
};
