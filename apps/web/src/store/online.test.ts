import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, ERROR_CODES, type Ack, type RoomSnapshot } from '@domino/shared';

type Responder = (event: string, args: unknown[]) => Ack<object> | undefined;

/** Socket de mentira: guarda o que foi emitido e responde os acks pelo roteiro do teste. */
class FakeSocket {
  static last: FakeSocket;
  static respond: Responder = () => ({ ok: true });
  connected = true;
  active = true;
  emitted: string[] = [];
  private handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  constructor(readonly auth: object) {
    FakeSocket.last = this;
  }
  get volatile() {
    return this;
  }
  on(event: string, fn: (...a: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  /** O servidor mandando um evento. */
  fire(event: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }
  emit(event: string, ...args: unknown[]) {
    this.emitted.push(event);
    const cb = args.at(-1);
    if (typeof cb === 'function') {
      const res = FakeSocket.respond(event, args.slice(0, -1));
      if (res) queueMicrotask(() => cb(res));
    }
    return this;
  }
  connect() {
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
}

// Só o que o store usa da página: se ela está visível (presença) e o aviso de quando muda.
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => undefined, removeEventListener: () => undefined });
vi.mock('socket.io-client', () => ({ io: (_url: unknown, opts: { auth: object }) => new FakeSocket(opts.auth) }));
const forceUpdate = vi.fn();
vi.mock('../lib/update', () => ({ forceUpdate }));

const { useOnline } = await import('./online');
const { useProfile } = await import('./profile');
const { useTable } = await import('./table');

const snapshot = (status: RoomSnapshot['status']): RoomSnapshot => ({
  code: 'ABCDE',
  ownerId: 'eu',
  settings: DEFAULT_ROOM_SETTINGS,
  seats: [
    { kind: 'human', player: { id: 'eu', nickname: 'Eu', tag: '0001', avatarId: 'mane', rating: 1000 }, connected: true },
    { kind: 'bot', level: 'amador', nickname: 'Tião', avatarId: 'pescador' },
    { kind: 'bot', level: 'amador', nickname: 'Zé', avatarId: 'veterano' },
    { kind: 'bot', level: 'amador', nickname: 'Cota', avatarId: 'rendeira' },
  ],
  status,
  turnDeadline: null,
  quick: false,
  fillAt: null,
});

/** Entra na mesa ABCDE já com a partida rolando (a tela de jogo fica ligada ao online). */
const seated = async () => {
  await useOnline.getState().joinRoom('ABCDE');
  FakeSocket.last.fire('room:state', snapshot('playing'));
  expect(useTable.getState().mode).toBe('online');
  return FakeSocket.last;
};

beforeEach(() => {
  FakeSocket.respond = () => ({ ok: true });
  forceUpdate.mockReset();
  useOnline.getState().socket?.disconnect();
  useOnline.setState({ socket: null, room: null, invite: null });
  useTable.getState().reset();
  useProfile.setState({ token: 'token-de-teste' });
});

describe('mesa online', () => {
  it('manda a versão do protocolo no handshake', async () => {
    const socket = await seated();
    expect(socket.auth).toMatchObject({ token: 'token-de-teste', protocol: expect.any(Number) });
  });

  it('perdeu a cadeira (outra aba): senta de novo e reenvia a jogada', async () => {
    const socket = await seated();
    let moves = 0;
    FakeSocket.respond = (event) => {
      if (event !== 'game:move') return { ok: true };
      return ++moves === 1 ? { ok: false, error: 'Tu abriste essa mesa noutra aba.', code: ERROR_CODES.lostSeat } : { ok: true };
    };
    socket.emitted = [];
    const result = await useTable.getState().actions!.play({ type: 'pass', seat: 0 });
    expect(result).toBeNull();
    expect(socket.emitted).toEqual(['game:move', 'room:join', 'game:move']);
  });

  it('outro erro só volta a mensagem, sem tentar de novo', async () => {
    const socket = await seated();
    FakeSocket.respond = (event) => (event === 'game:move' ? { ok: false, error: 'Não é tua vez, calma!' } : { ok: true });
    socket.emitted = [];
    expect(await useTable.getState().actions!.play({ type: 'pass', seat: 0 })).toBe('Não é tua vez, calma!');
    expect(socket.emitted).toEqual(['game:move']);
  });

  it('servidor diz que o app tá velho: atualiza em vez de tentar de novo', async () => {
    const socket = await seated();
    socket.active = false;
    socket.fire('connect_error', Object.assign(new Error('Teu app tá desatualizado.'), { data: { code: ERROR_CODES.updateRequired } }));
    expect(forceUpdate).toHaveBeenCalledOnce();
    expect(useOnline.getState().socket).toBeNull();
  });

  it('convite pra outra mesa aparece; pra mesa onde já está, não', async () => {
    const socket = await seated();
    const from = { id: 'amigo', nickname: 'Amigo', tag: '0002', avatarId: 'boi', rating: 1000 };
    socket.fire('invite', { from, code: 'ABCDE' });
    expect(useOnline.getState().invite).toBeNull();
    socket.fire('invite', { from, code: 'QWERT' });
    expect(useOnline.getState().invite).toEqual({ from, code: 'QWERT' });
  });
});
