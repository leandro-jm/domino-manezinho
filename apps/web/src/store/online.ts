import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { BotLevel } from '@domino/shared';
import type { Seat } from '@domino/engine';
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  type Ack,
  type ClientToServerEvents,
  type ConnectErrorData,
  type ErrorCode,
  type LobbyRoom,
  type RoomInvite,
  type RoomSettings,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '@domino/shared';
import { API_BASE } from '../lib/api';
import { useSettings } from '../lib/settings';
import { forceUpdate } from '../lib/update';
import { useProfile } from './profile';
import { useTable, type TableSeat } from './table';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface OnlineStore {
  socket: GameSocket | null;
  connected: boolean;
  room: RoomSnapshot | null;
  closedReason: string | null;
  /** Convite pra mesa que chegou com o app aberto (o aviso some quando a pessoa responde). */
  invite: RoomInvite | null;
  dismissInvite: () => void;
  connect: () => GameSocket | null;
  disconnect: () => void;
  /** Força uma conexão nova e espera ela abrir. */
  reconnect: () => Promise<void>;
  listRooms: () => Promise<LobbyRoom[]>;
  createRoom: (settings: RoomSettings) => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  quickPlay: () => Promise<string>;
  leaveRoom: () => void;
  sit: (seat: Seat) => Promise<void>;
  setBot: (seat: Seat, level: BotLevel | null) => Promise<void>;
  updateSettings: (settings: RoomSettings) => Promise<void>;
  start: () => Promise<void>;
}

/** Recusa do servidor: a mensagem vai pra tela, o código decide o que fazer. */
class AckError extends Error {
  constructor(
    message: string,
    readonly code?: ErrorCode,
  ) {
    super(message);
  }
}

const unwrap = <T extends object>(res: Ack<T>): T => {
  if (!res.ok) throw new AckError(res.error, res.code);
  return res;
};

const NO_ANSWER = 'A praça não respondeu. Tenta de novo.';

/** Emite com ack e timeout, transformando erro do servidor em exceção. */
const call = <T extends object>(emit: (cb: (res: Ack<T>) => void) => void, timeoutMs = 8000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(NO_ANSWER)), timeoutMs);
    emit((res) => {
      clearTimeout(timer);
      try {
        resolve(unwrap(res));
      } catch (err) {
        reject(err);
      }
    });
  });

const toTableSeats = (room: RoomSnapshot): (TableSeat | null)[] =>
  room.seats.map((occ) => {
    if (!occ) return null;
    if (occ.kind === 'bot') return { nickname: occ.nickname, avatarId: occ.avatarId, kind: 'bot', level: occ.level, connected: true };
    return { nickname: occ.player.nickname, avatarId: occ.player.avatarId, kind: 'human', playerId: occ.player.id, connected: occ.connected };
  });

export const useOnline = create<OnlineStore>((set, get) => {
  const need = () => {
    const socket = get().connect();
    if (!socket) throw new Error('Cria teu perfil online antes de jogar com a turma.');
    return socket;
  };

  /** Liga a mesa da tela ao online. Falso se o jogador está num treino: não sequestra a mesa offline. */
  const bindTable = (): boolean => {
    const table = useTable.getState();
    if (table.mode === 'online') return true;
    if (table.mode === 'offline') return false;
    table.reset();
    useTable.setState({
      mode: 'online',
      actions: {
        play: async (move) => {
          const send = (timeout?: number) => call((cb) => need().emit('game:move', move, cb), timeout);
          // Desconectado, o emit ficaria no buffer e sairia na volta junto com o reenvio (jogada dupla → erro).
          if (!need().connected) {
            const room = get().room;
            try {
              await get().reconnect();
              if (room) await call((cb) => need().emit('room:join', room.code, cb));
            } catch (err) {
              return (err as Error).message;
            }
          }
          try {
            // Resposta normal leva milissegundos; 4 s sem nada é conexão morta (aba dormiu, Wi-Fi piscou).
            await send(4000);
            return null;
          } catch (err) {
            const msg = (err as Error).message;
            const room = get().room;
            if (room && msg === NO_ANSWER) {
              // Derruba a conexão velha, reconecta, senta de novo e reenvia.
              try {
                await get().reconnect();
                await call((cb) => need().emit('room:join', room.code, cb));
                await send();
                return null;
              } catch (retry) {
                return (retry as Error).message;
              }
            }
            // Esta aba perdeu a cadeira (outra aba, reconexão): senta de novo e tenta mais uma vez.
            if (room && err instanceof AckError && err.code === ERROR_CODES.lostSeat) {
              try {
                await call((cb) => need().emit('room:join', room.code, cb));
                await send();
                return null;
              } catch (retry) {
                return (retry as Error).message;
              }
            }
            return msg;
          }
        },
        // Emote atrasado não faz sentido: sem conexão, descarta em vez de guardar.
        emote: (id) => need().volatile.emit('chat:emote', id),
        rematch: async () => {
          try {
            await call((cb) => need().emit('game:rematch', cb));
            return null;
          } catch (err) {
            return (err as Error).message;
          }
        },
        leave: () => get().leaveRoom(),
      },
    });
    return true;
  };

  let onVisibility: (() => void) | null = null;
  const dropVisibility = () => {
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    onVisibility = null;
  };
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1000;

  return {
    socket: null,
    connected: false,
    room: null,
    closedReason: null,
    invite: null,
    dismissInvite: () => set({ invite: null }),

    connect: () => {
      const token = useProfile.getState().token;
      const existing = get().socket;
      if (existing && (existing.auth as { token?: string }).token === token) {
        // Conexão parada (servidor derrubou, erro no handshake): religa em vez de devolver um socket morto.
        if (!existing.active) existing.connect();
        return existing;
      }
      // Token trocou (perfil recadastrado ou trazido de outro aparelho): conexão nova.
      existing?.disconnect();
      dropVisibility();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (!token) {
        set({ socket: null, connected: false });
        return null;
      }
      const socket: GameSocket = io(API_BASE || undefined, { auth: { token, protocol: PROTOCOL_VERSION }, transports: ['websocket', 'polling'] });
      socket.on('connect_error', (err) => {
        // Middleware recusou: o socket.io para de tentar sozinho.
        if (socket.active) return;
        const code = (err as { data?: Partial<ConnectErrorData> }).data?.code;
        if (code === ERROR_CODES.updateRequired) {
          // App velho demais pra este servidor: tentar de novo não adianta, só atualizando.
          set({ socket: null, connected: false });
          forceUpdate();
          return;
        }
        if (code === ERROR_CODES.tokenRefused) {
          // Token recusado não melhora tentando de novo: ressincroniza o perfil.
          dropVisibility();
          set({ socket: null, connected: false });
          void useProfile.getState().sync().catch(() => undefined);
          return;
        }
        // Erro passageiro do servidor (ex.: banco piscou): tenta de novo com espera crescente.
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (get().socket === socket && !socket.active) socket.connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      });
      socket.on('connect', () => {
        retryDelay = 1000;
        set({ connected: true });
        socket.emit('presence', document.visibilityState === 'visible');
        // Voltou a conexão no meio de uma sala: senta de novo na mesma cadeira.
        const room = get().room;
        if (room) {
          socket.emit('room:join', room.code, (res) => {
            if (res.ok || get().room?.code !== room.code) return;
            // A mesa fechou (ou a cadeira se foi) enquanto estava fora.
            set({ room: null, closedReason: res.error });
            if (useTable.getState().mode === 'online') useTable.getState().reset();
          });
        }
      });
      socket.on('disconnect', (reason) => {
        set({ connected: false });
        // Servidor derrubou de propósito (reinício, deploy): o socket.io não reconecta sozinho nesse caso.
        if (reason === 'io server disconnect') socket.connect();
      });
      socket.on('room:state', (room) => {
        set({ room, closedReason: null });
        if (!bindTable()) return;
        const me = useProfile.getState().profile?.id;
        useTable.setState({ seats: toTableSeats(room), turnDeadline: room.turnDeadline, canRematch: room.ownerId === me });
      });
      socket.on('game:view', (view) => {
        if (bindTable()) useTable.getState().setView(view);
      });
      socket.on('game:move', (move) => {
        if (useTable.getState().mode === 'online') useTable.getState().pushMove(move);
      });
      socket.on('chat:emote', ({ seat, emoteId }) => {
        const table = useTable.getState();
        const playerId = table.seats[seat]?.playerId;
        // Silenciado neste aparelho: nem balão nem voz.
        if (playerId && useSettings.getState().muted.includes(playerId)) return;
        if (table.mode === 'online') table.pushEmote(seat, emoteId);
      });
      socket.on('invite', (invite) => {
        // Já está nessa mesa: não precisa avisar.
        if (get().room?.code !== invite.code) set({ invite });
      });
      socket.on('room:closed', (reason) => {
        set({ room: null, closedReason: reason });
        if (useTable.getState().mode === 'online') useTable.getState().reset();
      });
      onVisibility = () => socket.emit('presence', document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      set({ socket });
      return socket;
    },

    reconnect: () =>
      new Promise<void>((resolve, reject) => {
        const socket = get().socket;
        if (!socket) return reject(new Error('Sem conexão com a praça.'));
        const onConnect = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          socket.off('connect', onConnect);
          reject(new Error('Sem conexão com a praça. Confere tua internet.'));
        }, 8000);
        socket.once('connect', onConnect);
        socket.disconnect();
        socket.connect();
      }),

    disconnect: () => {
      get().socket?.disconnect();
      dropVisibility();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      set({ socket: null, connected: false, room: null });
    },

    listRooms: () =>
      new Promise((resolve, reject) => {
        const socket = need();
        // Desconectado o pedido ficaria no buffer e sairia em rajada na volta: nem manda.
        if (!socket.connected) return reject(new Error(NO_ANSWER));
        const timer = setTimeout(() => reject(new Error(NO_ANSWER)), 8000);
        socket.emit('lobby:list', (rooms) => {
          clearTimeout(timer);
          resolve(rooms);
        });
      }),

    createRoom: async (settings) => (await call<{ code: string }>((cb) => need().emit('room:create', settings, cb))).code,

    joinRoom: async (code) => {
      await call((cb) => need().emit('room:join', code.toUpperCase(), cb));
    },

    quickPlay: async () => (await call<{ code: string }>((cb) => need().emit('room:quick', cb))).code,

    leaveRoom: () => {
      const { socket, room } = get();
      if (room) socket?.emit('room:leave');
      set({ room: null, closedReason: null });
      if (useTable.getState().mode === 'online') useTable.getState().reset();
    },

    sit: async (seat) => {
      await call((cb) => need().emit('room:sit', seat, cb));
    },
    setBot: async (seat, level) => {
      await call((cb) => need().emit('room:bot', seat, level, cb));
    },
    updateSettings: async (settings) => {
      await call((cb) => need().emit('room:settings', settings, cb));
    },
    start: async () => {
      await call((cb) => need().emit('room:start', cb));
    },
  };
});
