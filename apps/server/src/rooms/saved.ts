import { tileById, type MatchState } from '@domino/engine';
import type { PublicPlayer, RoomSettings, RoomStatus } from '@domino/shared';
import type { HandRecord } from '../persistence';
import type { BotSlot } from './types';

/** Cadeira como vai para o arquivo de estado (sem socket: depois do reinício todo mundo reconecta). */
export type SavedSlot = { kind: 'human'; player: PublicPlayer; left: boolean } | BotSlot;

/** Mesa serializada para sobreviver a reinício/deploy do servidor. */
export interface SavedRoom {
  code: string;
  ownerId: string;
  settings: RoomSettings;
  quick: boolean;
  status: RoomStatus;
  seats: (SavedSlot | null)[];
  match: MatchState | null;
  matchId: string | null;
  startedAt: string;
  hands: HandRecord[];
}

/** Pedras do JSON voltam a ser as do baralho (objetos congelados únicos). */
export const reviveMatch = (m: MatchState): MatchState => ({
  ...m,
  hand: {
    ...m.hand,
    hands: m.hand.hands.map((h) => h.map((t) => tileById(t.id))),
    board: m.hand.board.map((p) => ({ ...p, tile: tileById(p.tile.id) })),
  },
});
