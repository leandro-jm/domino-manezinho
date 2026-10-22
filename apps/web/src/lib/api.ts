import type {
  AuthResponse,
  CreatePlayerBody,
  MatchDetail,
  MatchPage,
  PlayerProfile,
  PracticeResultBody,
  PublicPlayer,
  PublicProfile,
  PushSubscriptionBody,
  RankingBoard,
  RankingEntry,
  TransferCode,
  UpdatePlayerBody,
} from '@domino/shared';

export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Código estável do servidor (ex.: player_not_found), quando vem. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Sem rede, ou servidor fora do ar/quebrado (proxy devolve 5xx): dá pra seguir offline. */
export const isUnreachable = (err: unknown) => err instanceof ApiError && (err.status === 0 || err.status >= 500);

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com a Praça. Confere tua internet.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'Deu ruim no servidor.', res.status, data.code);
  return data;
};

export const api = {
  createPlayer: (body: CreatePlayerBody) => request<AuthResponse>('POST', '/players', body),
  me: () => request<PlayerProfile>('GET', '/players/me'),
  renewToken: () => request<AuthResponse>('POST', '/players/me/token'),
  updateMe: (body: UpdatePlayerBody) => request<PlayerProfile>('PATCH', '/players/me', body),
  transferCode: () => request<TransferCode>('POST', '/players/me/transfer'),
  claim: (code: string) => request<AuthResponse>('POST', '/players/claim', { code }),
  practice: (body: PracticeResultBody) => request<PlayerProfile>('POST', '/practice', body),
  ranking: (board: RankingBoard) => request<RankingEntry[]>('GET', `/ranking?board=${board}&limit=50`),
  rankingPosition: (board: RankingBoard) => request<RankingEntry | null>('GET', `/ranking/position?board=${board}`),
  player: (id: string) => request<PublicProfile>('GET', `/players/${encodeURIComponent(id)}`),
  friends: () => request<PublicPlayer[]>('GET', '/friends'),
  invite: (code: string, playerId: string) => request<object>('POST', `/rooms/${code}/invite`, { playerId }),
  pushKey: () => request<{ publicKey: string | null }>('GET', '/push/key'),
  subscribePush: (body: PushSubscriptionBody) => request<object>('POST', '/push/subscribe', body),
  unsubscribePush: (endpoint: string) => request<object>('DELETE', '/push/subscribe', { endpoint }),
  exportMe: () => request<object>('GET', '/players/me/export'),
  deleteMe: () => request<object>('DELETE', '/players/me'),
  matches: (before?: string) => request<MatchPage>('GET', `/matches${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  match: (id: string) => request<MatchDetail>('GET', `/matches/${encodeURIComponent(id)}`),
};
