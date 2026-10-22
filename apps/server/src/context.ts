import type { ClientErrorKind, RoomInvite } from '@domino/shared';
import type { TokenService } from './auth';
import type { ServerConfig } from './config';
import type { Db } from './db';
import type { PushService } from './push';
import type { ResultQueue } from './results';
import type { RoomManager } from './rooms/manager';
import type { Notifier } from './rooms/notifier';

export interface AppContext {
  config: ServerConfig;
  db: Db;
  tokens: TokenService;
  push: PushService;
  notifier: Notifier;
  rooms: RoomManager;
  results: ResultQueue;
  /** Conta um erro vindo do app (métrica por tipo). */
  reportClientError: (kind: ClientErrorKind) => void;
  /** Convite pra mesa na tela de quem está com o app aberto (todas as abas e aparelhos). */
  sendInvite: (playerId: string, invite: RoomInvite) => void;
  /** Derruba os sockets abertos do jogador (token revogado: o aparelho antigo não pode seguir na mesa). */
  disconnectPlayer: (playerId: string) => void;
  /** Grava agora o arquivo de estado (no-op sem STATE_DIR). Usado no erro fatal antes de sair. */
  saveState: () => void;
}
