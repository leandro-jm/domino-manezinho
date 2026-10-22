import { ERROR_CODES, type Ack, type ConnectErrorData, type ErrorCode, type PublicPlayer, type SocketAuth } from '@domino/shared';
import type { TokenService } from '../auth';
import type { Db } from '../db';
import { RateLimiter } from '../limits';
import type { Metrics } from '../metrics';
import { toPublic } from '../players';
import type { RoomManager } from './manager';
import { RoomError } from './errors';
import type { TypedServer } from './types';
import { parseRoomSettings } from './settings';

const GENERIC_ERROR = 'Deu ruim aqui no servidor, tenta de novo.';
const SLOW_DOWN = 'Calma, mané! Muita coisa de uma vez.';
/** O cliente reconhece este começo como "token recusado" e para de tentar; erro passageiro tem que usar GENERIC_ERROR. */
export const TOKEN_ERROR = 'Token inválido, cria teu jogador de novo.';
export const UPDATE_ERROR = 'Teu app tá desatualizado. Atualiza pra jogar.';
/** App com protocolo abaixo disso é recusado no handshake (sobe junto com mudança que quebra app antigo). */
export const MIN_PROTOCOL_VERSION = 1;

/** Erro do handshake com código (chega no cliente como connect_error.data). */
const refused = (message: string, code: ErrorCode): Error => Object.assign(new Error(message), { data: { code } satisfies ConnectErrorData });

/** Canal com todos os sockets de um jogador (abas e aparelhos), para derrubar todos de uma vez. */
export const playerChannel = (playerId: string): string => `jogador:${playerId}`;

/** Eventos que abrem ou procuram mesa (enumeração de códigos, criação em massa). */
const ROOM_EVENTS = new Set(['room:create', 'room:join', 'room:quick']);

export const attachSockets = (
  io: TypedServer,
  deps: { tokens: TokenService; db: Db; rooms: RoomManager; log: (msg: string, err?: unknown) => void; metrics?: Metrics },
): void => {
  const { tokens, db, rooms, log, metrics } = deps;
  // Por jogador (não por socket): abrir várias abas não multiplica o limite.
  const anyEvent = new RateLimiter(60, 10_000);
  const roomEvent = new RateLimiter(10, 60_000);

  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as Partial<SocketAuth> | undefined;
      const protocol = typeof auth?.protocol === 'number' ? auth.protocol : 1;
      if (protocol < MIN_PROTOCOL_VERSION) return next(refused(UPDATE_ERROR, ERROR_CODES.updateRequired));
      const token = auth?.token;
      const claims = typeof token === 'string' ? await tokens.verify(token) : null;
      if (!claims) return next(refused(TOKEN_ERROR, ERROR_CODES.tokenRefused));
      const player = await db.player
        .update({ where: { id: claims.playerId, tokenVersion: claims.version }, data: { lastSeenAt: new Date() } })
        // P2025 = não achou (jogador apagado ou token de versão antiga). Qualquer outro erro é o banco: cai no catch
        // de fora e vira erro genérico, que o cliente tenta de novo (antes virava "token inválido" e ele desistia).
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === 'P2025') return null;
          throw err;
        });
      if (!player) return next(refused(TOKEN_ERROR, ERROR_CODES.tokenRefused));
      socket.data.player = toPublic(player);
      next();
    } catch (err) {
      log('falha na autenticação do socket', err);
      next(new Error(GENERIC_ERROR));
    }
  });

  io.on('connection', (socket) => {
    const playerId = socket.data.player.id;
    void socket.join(playerChannel(playerId));

    socket.use((packet, next) => {
      const [event] = packet;
      if (anyEvent.take(playerId) && (!ROOM_EVENTS.has(event) || roomEvent.take(playerId))) {
        // Mede do evento chegar até o ack sair (o tempo que o jogador espera a resposta).
        const last = packet.length - 1;
        const ack = packet[last];
        if (metrics && typeof ack === 'function') {
          const started = performance.now();
          packet[last] = (...args: unknown[]) => {
            metrics.observe('domino_socket_ack_seconds', (performance.now() - started) / 1000, { event: String(event) });
            (ack as (...a: unknown[]) => void)(...args);
          };
        }
        return next();
      }
      metrics?.inc('domino_socket_throttled_total');
      // Descarta o evento; responde no ack (se tiver) para o cliente não ficar esperando.
      const cb = packet[packet.length - 1];
      if (typeof cb === 'function') (cb as (r: Ack<object>) => void)({ ok: false, error: SLOW_DOWN });
    });

    /** Rating pode ter mudado desde a conexão: relê antes de sentar numa mesa. */
    const fresh = async (): Promise<PublicPlayer> => {
      const p = await db.player.findUnique({ where: { id: playerId } });
      if (p) socket.data.player = toPublic(p);
      return socket.data.player;
    };

    const handle = async <T extends object>(cb: unknown, fn: () => T | Promise<T>): Promise<void> => {
      let res: Ack<T>;
      try {
        res = { ok: true, ...(await fn()) };
      } catch (err) {
        if (!(err instanceof RoomError)) log('erro no evento do socket', err);
        res =
          err instanceof RoomError
            ? { ok: false, error: err.message, ...(err.code && { code: err.code }) }
            : { ok: false, error: GENERIC_ERROR };
      }
      if (typeof cb === 'function') (cb as (r: Ack<T>) => void)(res);
    };

    const myRoom = () => {
      const room = rooms.roomOf(playerId);
      if (!room) throw new RoomError('Tu não tá em nenhuma mesa.', ERROR_CODES.lostSeat);
      return room;
    };

    socket.on('lobby:list', (cb) => {
      if (typeof cb === 'function') cb(rooms.lobby());
    });

    socket.on('room:create', (settings, cb) =>
      handle(cb, async () => {
        const parsed = parseRoomSettings(settings);
        if (!parsed) throw new RoomError('Configuração da mesa inválida.');
        const room = rooms.create(await fresh(), socket.id, parsed);
        return { code: room.code };
      }),
    );

    socket.on('room:join', (code, cb) =>
      handle(cb, async () => {
        if (typeof code !== 'string') throw new RoomError('Código de mesa inválido.');
        const { seat } = rooms.join(code, await fresh(), socket.id);
        return { seat: seat as 0 | 1 | 2 | 3 };
      }),
    );

    socket.on('room:quick', (cb) =>
      handle(cb, async () => ({ code: rooms.quick(await fresh(), socket.id).code })),
    );

    socket.on('room:leave', () => {
      rooms.roomOf(playerId)?.leave(playerId);
    });

    socket.on('room:sit', (seat, cb) => handle(cb, () => (myRoom().sit(playerId, seat), {})));

    socket.on('room:bot', (seat, level, cb) => handle(cb, () => (myRoom().setBot(playerId, seat, level), {})));

    socket.on('room:settings', (settings, cb) =>
      handle(cb, () => {
        const room = myRoom();
        const parsed = parseRoomSettings(settings, room.settings);
        if (!parsed) throw new RoomError('Configuração da mesa inválida.');
        room.updateSettings(playerId, parsed);
        return {};
      }),
    );

    socket.on('room:start', (cb) => handle(cb, () => (myRoom().start(playerId), {})));

    socket.on('game:move', (move, cb) => handle(cb, () => (myRoom().move(playerId, socket.id, move), {})));

    socket.on('game:rematch', (cb) => handle(cb, () => (myRoom().rematch(playerId), {})));

    socket.on('chat:emote', (emoteId) => {
      rooms.roomOf(playerId)?.emote(playerId, emoteId);
    });

    socket.on('presence', (visible) => {
      rooms.setPresence(playerId, socket.id, visible === true);
    });

    socket.on('disconnect', () => {
      rooms.disconnected(playerId, socket.id);
    });

    try {
      rooms.connected(socket.data.player, socket.id);
    } catch (err) {
      log('falha ao religar jogador na mesa', err);
    }
  });
};
