import { DEFAULT_ROOM_SETTINGS, type RoomSettings, type TurnSeconds } from '@domino/shared';

export const TURN_SECONDS: readonly TurnSeconds[] = [15, 30, 60];
/** Faixa aceita de pontos para fechar a partida, por modo de contagem. */
export const TARGET_LIMITS = { batida: [1, 20], pontos: [10, 500] } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida as configurações vindas do cliente (campos ausentes usam o padrão). */
export const parseRoomSettings = (raw: unknown, base: RoomSettings = DEFAULT_ROOM_SETTINGS): RoomSettings | null => {
  if (!isObj(raw)) return null;
  const cfg = isObj(raw.config) ? raw.config : {};
  const visibility = raw.visibility ?? base.visibility;
  const turnSeconds = raw.turnSeconds ?? base.turnSeconds;
  const scoring = cfg.scoring ?? base.config.scoring;
  const targetScore = cfg.targetScore ?? base.config.targetScore;
  const galo = cfg.galo ?? base.config.galo;

  if (visibility !== 'private' && visibility !== 'public') return null;
  if (!TURN_SECONDS.includes(turnSeconds as TurnSeconds)) return null;
  if (scoring !== 'batida' && scoring !== 'pontos') return null;
  if (typeof galo !== 'boolean') return null;
  const [min, max] = TARGET_LIMITS[scoring];
  if (typeof targetScore !== 'number' || !Number.isInteger(targetScore) || targetScore < min || targetScore > max) return null;
  return { visibility, turnSeconds: turnSeconds as TurnSeconds, config: { scoring, targetScore, galo } };
};
