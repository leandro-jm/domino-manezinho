import type { AddressInfo } from 'node:net';
import { PROTOCOL_VERSION, type AuthResponse, type ClientToServerEvents, type ServerToClientEvents, type SocketAuth } from '@domino/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { buildServer, type BuildOptions, type BuiltServer } from '../src/app';
import type { Timings } from '../src/config';
import type { Db } from '../src/db';
import type { PushTarget } from '../src/push';
import { TEST_DATABASE_URL } from '../vitest.config';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export const FAST: Partial<Timings> = {
  botDelayMs: [0, 0],
  nextHandMs: 5,
  quickFillMs: 100,
  disconnectGraceMs: 200,
  roomAbandonMs: 5_000,
  practiceCooldownMs: 30_000,
  emoteCooldownMs: 2_000,
};

export const resetDb = async (db: Db): Promise<void> => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Hand", "MatchPlayer", "Match", "PushSubscription", "TransferCode", "Player" RESTART IDENTITY CASCADE',
  );
};

export interface TestServer extends BuiltServer {
  url: string;
  pushes: { target: PushTarget; payload: { title: string; body: string; url: string; tag: string } }[];
  close(): Promise<void>;
}

export const startServer = async (timings: Partial<Timings> = {}, opts: BuildOptions = {}): Promise<TestServer> => {
  const pushes: TestServer['pushes'] = [];
  const built = await buildServer({
    ...opts,
    config: { databaseUrl: TEST_DATABASE_URL, vapid: null, pushHosts: ['push.example'], rateLimit: false, ...opts.config, timings: { ...FAST, ...timings } },
    pushSender:
      opts.pushSender ??
      (async (target, payload) => {
        pushes.push({ target, payload: JSON.parse(payload) });
      }),
  });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = built.app.server.address() as AddressInfo;
  return { ...built, url: `http://127.0.0.1:${port}`, pushes, close: () => built.app.close() };
};

export const createPlayer = async (s: BuiltServer, nickname: string, avatarId = 'veterano'): Promise<AuthResponse> => {
  const res = await s.app.inject({ method: 'POST', url: '/api/players', payload: { nickname, avatarId } });
  if (res.statusCode !== 201) throw new Error(`criar jogador falhou: ${res.body}`);
  return res.json();
};

/** Envelhece as contas para valerem ranking (conta recém-criada não conta). */
export const ageAccounts = async (s: BuiltServer, ids: string[]): Promise<void> => {
  await s.ctx.db.player.updateMany({ where: { id: { in: ids } }, data: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60_000) } });
};

export const connectClient = (url: string, token: string, auth: Omit<SocketAuth, 'token'> = { protocol: PROTOCOL_VERSION }): Promise<Client> =>
  new Promise((resolve, reject) => {
    const socket: Client = connect(url, { auth: { token, ...auth }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });

/** Emite com ack e devolve a resposta. */
export const ask = <T>(fn: (cb: (res: T) => void) => void): Promise<T> => new Promise((resolve) => fn(resolve));

/** Espera um evento que satisfaça o predicado. */
export const waitFor = <K extends keyof ServerToClientEvents>(
  socket: Client,
  event: K,
  pred: (...args: Parameters<ServerToClientEvents[K]>) => boolean = () => true,
  timeoutMs = 10_000,
): Promise<Parameters<ServerToClientEvents[K]>> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`timeout esperando ${String(event)}`));
    }, timeoutMs);
    const handler = (...args: Parameters<ServerToClientEvents[K]>) => {
      if (!pred(...args)) return;
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(args);
    };
    socket.on(event, handler as never);
  });

export const until = async (fn: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> => {
  const end = Date.now() + timeoutMs;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timeout esperando condição');
    await new Promise((r) => setTimeout(r, 20));
  }
};
