import type { BatidaKind } from '@domino/engine';

/** Chat rápido: só frases prontas, sem chat livre (dispensa moderação). */
export const EMOTES: readonly { id: string; text: string }[] = [
  { id: 'olholho', text: 'Ó-lhó-lhó!' },
  { id: 'tastolo', text: 'Tás tolo?' },
  { id: 'dalhe', text: 'Dá-lhe!' },
  { id: 'tanso', text: 'Mas que tanso!' },
  { id: 'batenamesa', text: 'Bate na mesa!' },
  { id: 'desenhe', text: 'Queres que eu desenhe?' },
  { id: 'segura', text: 'Segura essa, meu!' },
  { id: 'tavazado', text: 'Tá vazado!' },
  { id: 'mofas', text: 'Mofas com a pomba na balaia!' },
  { id: 'boajogada', text: 'Boa, parceiro!' },
];

export const emoteText = (id: string): string | null => EMOTES.find((e) => e.id === id)?.text ?? null;

export const BATIDA_LABELS: Record<BatidaKind, string> = {
  simples: 'Batida simples',
  carroca: 'Batida de carroça',
  laelo: 'Lá-e-ló!',
  cruzada: 'Cruzada!',
};

export const INITIAL_RATING = 1000;

const TITLES: readonly [number, string][] = [
  [1300, 'Rei da Praça XV'],
  [1150, 'Manezinho da Ilha'],
  [1050, 'Manezinho'],
  [950, 'Mané'],
  [-Infinity, 'Tanso'],
];

export const rankTitle = (rating: number): string => TITLES.find(([min]) => rating >= min)![1];

const BAD_WORDS = ['porra', 'caralho', 'merda', 'puta', 'buceta', 'cacete', 'viado', 'arrombado', 'fdp', 'pqp', 'cu'];
/** Longos e sem palavra inocente que os contenha: barrados mesmo colados em outra palavra ("porraloka"). */
const BAD_ANYWHERE = ['porra', 'caralho', 'merda', 'buceta', 'cacete', 'arrombado'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
/** "porrrra" e "porra" viram a mesma coisa. */
const squash = (s: string) => s.replace(/(.)\1+/g, '$1');

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/** Retorna o apelido normalizado ou uma mensagem de erro. */
export const validateNickname = (raw: string): { ok: true; nickname: string } | { ok: false; error: string } => {
  const nickname = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return { ok: false, error: `O apelido precisa ter de ${NICKNAME_MIN} a ${NICKNAME_MAX} letras.` };
  }
  // Só alfabeto latino (com acento): letra de outro alfabeto igualzinha à nossa servia pra se passar por outro.
  if (!/^[\p{Script=Latin}0-9 ._'-]+$/u.test(nickname)) {
    return { ok: false, error: 'Usa só letras, números, espaço, ponto, hífen ou sublinhado.' };
  }
  // ".." ou "--" na mesa não dá pra chamar de nada.
  if (!/[\p{L}0-9]/u.test(nickname)) return { ok: false, error: 'O apelido precisa ter alguma letra ou número.' };
  const plain = nickname
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9]/g, (d) => LEET[d] ?? d);
  const words = plain.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = squash(words.join(''));
  const bad =
    words.some((w) => BAD_WORDS.includes(w) || BAD_WORDS.includes(squash(w))) ||
    BAD_ANYWHERE.some((w) => compact.includes(squash(w)));
  if (bad) return { ok: false, error: 'Olha a boca, mané! Escolhe outro apelido.' };
  return { ok: true, nickname };
};
