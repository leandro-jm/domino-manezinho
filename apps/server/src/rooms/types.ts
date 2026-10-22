import type { BotLevel, ClientToServerEvents, PublicPlayer, ServerToClientEvents } from '@domino/shared';
import type { Server } from 'socket.io';

export interface SocketData {
  player: PublicPlayer;
}

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface HumanSlot {
  kind: 'human';
  player: PublicPlayer;
  socketId: string | null;
  disconnectedAt: number | null;
  /** Saiu por vontade própria (room:leave): não volta sozinho ao reconectar. */
  left: boolean;
}

export interface BotSlot {
  kind: 'bot';
  level: BotLevel;
  nickname: string;
  avatarId: string;
}

export type Slot = HumanSlot | BotSlot;
