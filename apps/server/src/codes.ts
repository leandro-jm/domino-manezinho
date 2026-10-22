import { randomInt } from 'node:crypto';

// Sem I, L, O (e sem 0/1 nos códigos com números) para não confundir ao ditar.
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const TRANSFER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const randomCode = (length: number, alphabet: string): string => {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
};

export const randomTag = (): string => String(randomInt(10_000)).padStart(4, '0');

/** RNG criptográfico em [0, 1) para embaralhar as pedras das partidas online. */
export const secureRng = (): number => randomInt(2 ** 47) / 2 ** 47;
