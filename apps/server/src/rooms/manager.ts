import type { LobbyRoom, PublicPlayer, RoomSettings } from '@domino/shared';
import { DEFAULT_ROOM_SETTINGS } from '@domino/shared';
import { ROOM_ALPHABET, randomCode } from '../codes';
import { CLOSE_REASONS, RoomError } from './errors';
import { Room, type RoomDeps } from './room';
import type { SavedRoom } from './saved';

export type ManagerDeps = Omit<RoomDeps, 'isVisible' | 'onPlayerGone' | 'onClose'>;

/**
 * Mesas em memória de um processo só. Para escalar horizontalmente: trocar o adapter do
 * Socket.IO pelo de Redis (a mesa já só fala com sockets via io.to/io.in) e mover
 * `rooms`/`playerRoom` para um dono por mesa (sticky por código).
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** Mesa atual de cada jogador (no máximo uma). */
  private readonly playerRoom = new Map<string, Room>();
  /** Visibilidade do app por socket de cada jogador. */
  private readonly presence = new Map<string, Map<string, boolean>>();
  private readonly roomDeps: RoomDeps;

  constructor(deps: ManagerDeps) {
    this.roomDeps = {
      ...deps,
      isVisible: (id) => this.isVisible(id),
      onPlayerGone: (id, room) => {
        if (this.playerRoom.get(id) === room) this.playerRoom.delete(id);
      },
      onClose: (room) => {
        if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
      },
    };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  roomOf(playerId: string): Room | undefined {
    return this.playerRoom.get(playerId);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Mesas com partida rolando agora. */
  get playing(): number {
    let n = 0;
    for (const room of this.rooms.values()) if (room.status === 'playing') n++;
    return n;
  }

  private newCode(): string {
    for (;;) {
      const code = randomCode(5, ROOM_ALPHABET);
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Antes de entrar noutra mesa, sai da atual. */
  private switchTo(playerId: string, room: Room): void {
    const current = this.playerRoom.get(playerId);
    if (current && current !== room) current.leave(playerId);
    this.playerRoom.set(playerId, room);
  }

  create(player: PublicPlayer, socketId: string, settings: RoomSettings, quick = false): Room {
    const room = new Room(this.newCode(), player, settings, quick, this.roomDeps);
    this.rooms.set(room.code, room);
    this.switchTo(player.id, room);
    room.join(player, socketId);
    return room;
  }

  join(code: string, player: PublicPlayer, socketId: string): { room: Room; seat: number } {
    const room = this.get(code);
    if (!room) throw new RoomError('Essa mesa não existe (ou já fechou).');
    // Valida antes de tirar o jogador da mesa atual.
    room.seatFor(player.id);
    this.switchTo(player.id, room);
    return { room, seat: room.join(player, socketId) };
  }

  /** Jogo rápido: entra numa sala rápida esperando gente, ou abre uma. */
  quick(player: PublicPlayer, socketId: string): Room {
    const current = this.playerRoom.get(player.id);
    if (current?.quick && current.status === 'waiting') {
      current.join(player, socketId);
      return current;
    }
    const open = [...this.rooms.values()].find(
      (r) => r.quick && r.status === 'waiting' && r.settings.visibility === 'public' && r.freeSeats().length > 0,
    );
    if (open) return this.join(open.code, player, socketId).room;
    return this.create(player, socketId, { ...DEFAULT_ROOM_SETTINGS, visibility: 'public' }, true);
  }

  lobby(): LobbyRoom[] {
    const list: LobbyRoom[] = [];
    for (const r of this.rooms.values()) {
      if (r.closed || r.status !== 'waiting' || r.settings.visibility !== 'public') continue;
      const free = r.freeSeats().length;
      if (!free) continue;
      const humans = r.humans();
      const owner = humans.find((h) => h.player.id === r.ownerId)?.player ?? humans[0]?.player;
      if (!owner) continue;
      list.push({
        code: r.code,
        ownerNickname: owner.nickname,
        ownerAvatarId: owner.avatarId,
        humans: humans.length,
        freeSeats: free,
        settings: r.settings,
      });
    }
    return list.sort((a, b) => b.humans - a.humans);
  }

  // ---------- sockets e presença ----------

  /** Socket novo: marca presença e, se o jogador tinha caído de uma mesa, devolve a cadeira. */
  connected(player: PublicPlayer, socketId: string): void {
    let sockets = this.presence.get(player.id);
    if (!sockets) this.presence.set(player.id, (sockets = new Map()));
    sockets.set(socketId, true);
    const room = this.playerRoom.get(player.id);
    if (room?.wantsRebind(player.id)) room.join(player, socketId);
  }

  disconnected(playerId: string, socketId: string): void {
    const sockets = this.presence.get(playerId);
    sockets?.delete(socketId);
    if (sockets && !sockets.size) this.presence.delete(playerId);
    this.playerRoom.get(playerId)?.disconnected(playerId, socketId);
  }

  setPresence(playerId: string, socketId: string, visible: boolean): void {
    this.presence.get(playerId)?.set(socketId, visible);
  }

  isVisible(playerId: string): boolean {
    const sockets = this.presence.get(playerId);
    return !!sockets && [...sockets.values()].some(Boolean);
  }

  shutdown(): void {
    for (const room of [...this.rooms.values()]) room.close(CLOSE_REASONS.shutdown);
  }

  // ---------- reinício do servidor ----------

  toSaved(): SavedRoom[] {
    return [...this.rooms.values()].filter((r) => !r.closed).map((r) => r.toSaved());
  }

  /** Remonta as mesas salvas; uma mesa quebrada não impede as outras. Devolve quantas voltaram. */
  restore(saved: readonly SavedRoom[], graceMs: number): number {
    let restored = 0;
    for (const s of saved) {
      if (this.rooms.has(s.code)) continue;
      try {
        const room = Room.restore(s, this.roomDeps, graceMs);
        this.rooms.set(room.code, room);
        for (const h of room.humans()) this.playerRoom.set(h.player.id, room);
        restored++;
      } catch (err) {
        this.roomDeps.log(`não deu pra restaurar a mesa ${s.code}`, err);
      }
    }
    return restored;
  }

  /** Para todas as mesas sem fechá-las para os jogadores (o estado já foi salvo). */
  suspend(): void {
    for (const room of this.rooms.values()) room.suspend();
  }
}
