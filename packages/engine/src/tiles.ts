import type { Seat, Team, Tile } from './types';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const HAND_SIZE = 7;

/** As 28 pedras do duplo-6, com ids estáveis de 0 a 27. */
export const DECK: readonly Tile[] = (() => {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) tiles.push(Object.freeze({ id: tiles.length, a, b }));
  }
  // Pedras são compartilhadas por todas as partidas: congeladas para ninguém alterar por engano.
  return Object.freeze(tiles);
})();

export const tileById = (id: number): Tile => {
  const tile = DECK[id];
  if (!tile) throw new Error(`Pedra inexistente: ${id}`);
  return tile;
};

export const findTile = (a: number, b: number): Tile => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const tile = DECK.find((t) => t.a === lo && t.b === hi);
  if (!tile) throw new Error(`Pedra inexistente: ${a}-${b}`);
  return tile;
};

/** Carroça de sena (6-6). */
export const SENA = findTile(6, 6);

export const isDouble = (t: Tile): boolean => t.a === t.b;
export const pips = (t: Tile): number => t.a + t.b;
export const handPips = (hand: readonly Tile[]): number => hand.reduce((s, t) => s + pips(t), 0);
export const hasValue = (t: Tile, v: number): boolean => t.a === v || t.b === v;

export const teamOf = (seat: Seat): Team => (seat % 2) as Team;
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat;
export const tileLabel = (t: Tile): string => `${t.a}-${t.b}`;
