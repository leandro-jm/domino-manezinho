import type { BotLevel } from './bots';
import type { BatidaKind, MatchConfig, Move, PlayerView, Seat, Team } from '@domino/engine';

// ---------- Jogadores ----------

export interface PublicPlayer {
  id: string;
  nickname: string;
  /** Sufixo numérico para diferenciar apelidos iguais: Apelido#1234. */
  tag: string;
  avatarId: string;
  rating: number;
}

export interface PlayerStats {
  games: number;
  wins: number;
  practiceGames: number;
  practiceWins: number;
  carrocas: number;
  laelos: number;
  cruzadas: number;
  streak: number;
  bestStreak: number;
}

/** Tipos de notificação que dá pra ligar ou desligar um por um. */
export type PushKind = 'turn' | 'invite' | 'full';
export type PushPrefs = Record<PushKind, boolean>;
export const PUSH_KINDS: readonly PushKind[] = ['turn', 'invite', 'full'];

/** O que qualquer um vê tocando no jogador do ranking. */
export interface PublicProfile extends PublicPlayer {
  title: string;
  stats: PlayerStats;
}

export interface PlayerProfile extends PublicProfile {
  pushPrefs: PushPrefs;
}

export interface AuthResponse {
  token: string;
  player: PlayerProfile;
}

export type RankingBoard = 'geral' | 'semanal' | 'amigos' | 'treino';

export interface RankingEntry {
  position: number;
  player: PublicPlayer;
  /** Rating (geral/amigos), pontos de rating ganhos na semana (semanal) ou vitórias (treino). */
  value: number;
  games: number;
  wins: number;
}

// ---------- Histórico ----------

/** Cadeira de uma partida do histórico. */
export interface MatchSeat {
  seat: Seat;
  team: Team;
  kind: 'human' | 'bot';
  /** Humano: o apelido de agora. Bot: o personagem que estava na mesa. */
  nickname: string;
  avatarId: string;
  playerId: string | null;
  botLevel: BotLevel | null;
  /** Rating antes da partida (nulo nas partidas antigas e nos bots). */
  ratingBefore: number | null;
  ratingDelta: number;
}

export interface MatchSummary {
  id: string;
  endedAt: string;
  config: MatchConfig;
  rated: boolean;
  winnerTeam: Team | null;
  /** Placar final; nulo nas partidas de antes do histórico. */
  scores: [number, number] | null;
  /** Cadeira de quem pediu. */
  mySeat: Seat;
  seats: MatchSeat[];
  handCount: number;
}

export interface MatchHand {
  number: number;
  result: 'batida' | 'trancado';
  kind: BatidaKind | null;
  winnerTeam: Team | null;
  points: number;
  moves: Move[];
  /** Pedras dadas a cada cadeira (ids). Nulo nas partidas antigas: aí não dá pra refazer a mão. */
  dealt: number[][] | null;
}

export interface MatchDetail extends MatchSummary {
  hands: MatchHand[];
}

export interface MatchPage {
  matches: MatchSummary[];
  /** Mandar em `before` para buscar as mais antigas; nulo quando acabou. */
  next: string | null;
}

// ---------- REST ----------

/** Tipos de erro que o app manda pro servidor (pra saber o que quebra no aparelho dos jogadores). */
export const CLIENT_ERROR_KINDS = ['error', 'rejection', 'render', 'webgl-lost', 'scene', 'models'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export interface ClientErrorBody {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  /** Tela onde aconteceu (só o caminho). */
  path?: string;
}

export interface CreatePlayerBody {
  nickname: string;
  avatarId: string;
}

export interface UpdatePlayerBody extends Partial<CreatePlayerBody> {
  pushPrefs?: Partial<PushPrefs>;
}

export interface TransferCode {
  code: string;
  expiresAt: string;
}

/** Resultado de partida de treino jogada offline contra bots. */
export interface PracticeResultBody {
  won: boolean;
  carrocas: number;
  laelos: number;
  cruzadas: number;
}

export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface ApiError {
  error: string;
}

// ---------- Salas (Socket.IO) ----------

export type TurnSeconds = 15 | 30 | 60;

export interface RoomSettings {
  visibility: 'private' | 'public';
  config: MatchConfig;
  turnSeconds: TurnSeconds;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  visibility: 'private',
  config: { scoring: 'batida', targetScore: 6, galo: false },
  turnSeconds: 30,
};

export type SeatOccupant =
  | { kind: 'human'; player: PublicPlayer; connected: boolean }
  | { kind: 'bot'; level: BotLevel; nickname: string; avatarId: string };

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomSnapshot {
  code: string;
  ownerId: string;
  settings: RoomSettings;
  seats: [SeatOccupant | null, SeatOccupant | null, SeatOccupant | null, SeatOccupant | null];
  status: RoomStatus;
  /** Prazo (epoch ms) da jogada atual, quando há partida em andamento. */
  turnDeadline: number | null;
  /** Sala criada pelo "jogo rápido": completa com bots sozinha. */
  quick: boolean;
  /** Quando a sala rápida vai completar com bots (epoch ms). */
  fillAt: number | null;
}

export interface LobbyRoom {
  code: string;
  ownerNickname: string;
  ownerAvatarId: string;
  humans: number;
  freeSeats: number;
  settings: RoomSettings;
}

/** Códigos estáveis de erro: o cliente decide por eles (a mensagem é só pra gente ler e pode mudar). */
export const ERROR_CODES = {
  /** Esta conexão não está mais sentada na mesa (outra aba, reconexão): dá pra sentar de novo. */
  lostSeat: 'lost_seat',
  /** Handshake recusou o token: tentar de novo não adianta. */
  tokenRefused: 'token_refused',
  /** App velho demais para este servidor: precisa atualizar. */
  updateRequired: 'update_required',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: ErrorCode };
type Callback<T = object> = (res: Ack<T>) => void;

export interface ClientToServerEvents {
  'lobby:list': (cb: (rooms: LobbyRoom[]) => void) => void;
  'room:create': (settings: RoomSettings, cb: Callback<{ code: string }>) => void;
  'room:join': (code: string, cb: Callback<{ seat: Seat | null }>) => void;
  'room:quick': (cb: Callback<{ code: string }>) => void;
  'room:leave': () => void;
  'room:sit': (seat: Seat, cb: Callback) => void;
  /** Coloca (level) ou tira (null) um bot de uma cadeira. Só o dono da sala. */
  'room:bot': (seat: Seat, level: BotLevel | null, cb: Callback) => void;
  'room:settings': (settings: RoomSettings, cb: Callback) => void;
  'room:start': (cb: Callback) => void;
  'game:move': (move: Move, cb: Callback) => void;
  /** Dono pede revanche depois do fim da partida. */
  'game:rematch': (cb: Callback) => void;
  'chat:emote': (emoteId: string) => void;
  /** App em primeiro plano ou não — decide se manda push de "tua vez". */
  presence: (visible: boolean) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void;
  'game:view': (view: PlayerView) => void;
  /** Última jogada, para animação e som. */
  'game:move': (move: Move) => void;
  'chat:emote': (e: { seat: Seat; emoteId: string }) => void;
  'room:closed': (reason: string) => void;
  /** Alguém chamou pra mesa (chega em qualquer tela do app aberto). */
  invite: (invite: RoomInvite) => void;
}

export interface RoomInvite {
  from: PublicPlayer;
  code: string;
}

/**
 * Versão do protocolo do socket. Sobe quando o servidor muda de um jeito que app antigo (PWA em cache)
 * não entende; o servidor recusa abaixo do mínimo dele com ERROR_CODES.updateRequired.
 */
export const PROTOCOL_VERSION = 1;

export interface SocketAuth {
  token: string;
  /** PROTOCOL_VERSION do app. App de antes do campo existir não manda (conta como 1). */
  protocol?: number;
}

/** Dados do erro de conexão recusada no handshake (connect_error.data). */
export interface ConnectErrorData {
  code: ErrorCode;
}
