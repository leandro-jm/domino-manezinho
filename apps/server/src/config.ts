import { availableParallelism } from 'node:os';
export interface ServerConfig {
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  /** Origens liberadas no CORS; `null` = qualquer localhost (dev). */
  corsOrigins: string[] | null;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  webDist: string | null;
  /**
   * Pasta do arquivo de estado (mesas em andamento e resultados pendentes) para sobreviver a reinício e deploy.
   * `null` desliga: reiniciar fecha as mesas.
   */
  stateDir: string | null;
  /**
   * Proxy reverso confiável para ler o IP real (X-Forwarded-For): false, nº de saltos ou lista de IPs/CIDRs.
   * Sem isso qualquer cliente falsifica o IP e fura o limite de requisições.
   */
  trustProxy: boolean | number | string[];
  /** Limite de requisições por IP (desligado nos testes). */
  rateLimit: boolean;
  /** Token do scrape de /api/metrics (Bearer). Sem ele o endpoint nem existe. */
  metricsToken: string | null;
  /** Hosts aceitos como endpoint de push (sufixo de domínio); evita o servidor postar em URL arbitrária. */
  pushHosts: string[];
  timings: Timings;
  /** Orçamento do bot "monstro" no servidor. */
  monstro: { samples: number; timeLimitMs: number };
  /** Workers que pensam a jogada do Monstro fora do event loop (0 = no event loop mesmo). */
  botWorkers: number;
}

export interface Timings {
  /** Faixa [mín, máx] do "pensando..." dos bots. */
  botDelayMs: [number, number];
  quickFillMs: number;
  disconnectGraceMs: number;
  nextHandMs: number;
  /** Sala sem nenhum humano conectado por esse tempo fecha. */
  roomAbandonMs: number;
  /** Multiplicador de turnSeconds (1000 = segundos de verdade; testes encolhem). */
  turnMsPerSecond: number;
  practiceCooldownMs: number;
  emoteCooldownMs: number;
  turnPushDebounceMs: number;
  /** Depois de restaurar as mesas, tempo para os jogadores reconectarem antes de bot assumir/perder a cadeira. */
  restoreGraceMs: number;
  /** De quanto em quanto tempo salva o estado (protege contra queda sem aviso, como falta de memória). */
  stateSaveMs: number;
  /** Estado mais velho que isso não restaura as mesas (só os resultados pendentes). */
  restoreMaxAgeMs: number;
}

export const DEV_JWT_SECRET = 'domino-manezinho-dev-secret-troca-isso';
export const DEFAULT_DATABASE_URL = 'postgresql://domino:domino@localhost:5442/domino';

/** Limites por IP. Rotas sensíveis (criar jogador, resgatar código) têm limite próprio mais apertado. */
export const RATE_LIMITS = {
  global: { max: 300, timeWindow: 60_000 },
  createPlayer: { max: 20, timeWindow: 60 * 60_000 },
  claim: { max: 10, timeWindow: 10 * 60_000 },
  clientErrors: { max: 30, timeWindow: 10 * 60_000 },
} as const;

export const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

export const DEFAULT_TIMINGS: Timings = {
  botDelayMs: [900, 1600],
  quickFillMs: 20_000,
  disconnectGraceMs: 10_000,
  nextHandMs: 5_000,
  roomAbandonMs: 120_000,
  turnMsPerSecond: 1000,
  practiceCooldownMs: 30_000,
  emoteCooldownMs: 2_000,
  turnPushDebounceMs: 60_000,
  restoreGraceMs: 60_000,
  stateSaveMs: 10_000,
  restoreMaxAgeMs: 15 * 60_000,
};

const proxy = (raw: string | undefined): boolean | number | string[] => {
  const v = raw?.trim();
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
};

const int = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** Aceita "900-1600" ou um número só. */
const range = (raw: string | undefined, fallback: [number, number]): [number, number] => {
  if (!raw) return fallback;
  const [a = NaN, b = a] = raw.split('-').map((s) => int(s.trim(), NaN));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback;
  return [Math.min(a, b), Math.max(a, b)];
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  let jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    if (env.NODE_ENV === 'production') throw new Error('JWT_SECRET é obrigatório em produção');
    console.warn('[domino] JWT_SECRET não definido: usando segredo de desenvolvimento.');
    jwtSecret = DEV_JWT_SECRET;
  }
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT || 'mailto:contato@dominomanezinho.app',
        }
      : null;
  const origins = env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  const pushHosts = env.PUSH_HOSTS?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    port: int(env.PORT, 3001),
    host: env.HOST || '0.0.0.0',
    databaseUrl: env.DATABASE_URL || DEFAULT_DATABASE_URL,
    jwtSecret,
    corsOrigins: origins?.length ? origins : null,
    vapid,
    webDist: env.WEB_DIST || null,
    stateDir: env.STATE_DIR || null,
    trustProxy: proxy(env.TRUST_PROXY),
    rateLimit: env.RATE_LIMIT !== 'false',
    metricsToken: env.METRICS_TOKEN || null,
    pushHosts: pushHosts?.length ? pushHosts : DEFAULT_PUSH_HOSTS,
    timings: {
      botDelayMs: range(env.BOT_DELAY_MS, DEFAULT_TIMINGS.botDelayMs),
      quickFillMs: int(env.QUICK_FILL_MS, DEFAULT_TIMINGS.quickFillMs),
      disconnectGraceMs: int(env.DISCONNECT_GRACE_MS, DEFAULT_TIMINGS.disconnectGraceMs),
      nextHandMs: int(env.NEXT_HAND_MS, DEFAULT_TIMINGS.nextHandMs),
      roomAbandonMs: int(env.ROOM_ABANDON_MS, DEFAULT_TIMINGS.roomAbandonMs),
      turnMsPerSecond: DEFAULT_TIMINGS.turnMsPerSecond,
      practiceCooldownMs: DEFAULT_TIMINGS.practiceCooldownMs,
      emoteCooldownMs: DEFAULT_TIMINGS.emoteCooldownMs,
      turnPushDebounceMs: DEFAULT_TIMINGS.turnPushDebounceMs,
      restoreGraceMs: int(env.RESTORE_GRACE_MS, DEFAULT_TIMINGS.restoreGraceMs),
      stateSaveMs: DEFAULT_TIMINGS.stateSaveMs,
      restoreMaxAgeMs: DEFAULT_TIMINGS.restoreMaxAgeMs,
    },
    monstro: { samples: 60, timeLimitMs: 250 },
    botWorkers: int(env.BOT_WORKERS, Math.max(1, Math.min(4, availableParallelism() - 1))),
  };
};
