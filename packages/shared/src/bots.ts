/** Níveis de bot. Como cada um joga fica em @domino/bots; aqui o que tela, servidor e ranking precisam saber. */
export type BotLevel = 'amador' | 'praca' | 'monstro';

export interface BotLevelInfo {
  label: string;
  /** Rótulo curto para botão ("+ Monstro"). */
  short: string;
  description: string;
  /** Rating fixo do bot na média da dupla (Elo). */
  rating: number;
  /** Mesa rápida completa com este nível a partir dessa média de rating dos humanos (vale o mais forte que couber). */
  quickFillFrom: number;
}

/** Do mais fraco ao mais forte. */
export const BOT_LEVELS: Record<BotLevel, BotLevelInfo> = {
  amador: { label: 'Amador', short: 'Amador', description: 'Joga no chute, bom pra pegar o jeito.', rating: 900, quickFillFrom: 0 },
  praca: {
    label: 'Bom de praça',
    short: 'Bom de praça',
    description: 'Já sabe o que faz, mas ainda dá umas bobeadas.',
    rating: 1150,
    quickFillFrom: 1050,
  },
  monstro: {
    label: 'É um monstro',
    short: 'Monstro',
    description: 'Conta pedra, lê os passes e não perdoa.',
    rating: 1400,
    quickFillFrom: 1150,
  },
};

export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS) as BotLevel[];

export const isBotLevel = (value: unknown): value is BotLevel => typeof value === 'string' && Object.hasOwn(BOT_LEVELS, value);

/** Nível dos bots que completam a mesa rápida, pela média de rating dos humanos sentados. */
export const quickFillLevel = (avgRating: number): BotLevel =>
  BOT_LEVEL_IDS.reduce((best, level) => (BOT_LEVELS[level].quickFillFrom <= avgRating ? level : best), BOT_LEVEL_IDS[0]!);
