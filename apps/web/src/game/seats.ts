import type { Seat } from '@domino/engine';

/** Posição relativa na mesa: 0 = eu (embaixo), 1 = direita, 2 = parceiro (em frente), 3 = esquerda. */
export type RelSeat = 0 | 1 | 2 | 3;

/** Onde `seat` aparece na mesa de quem está sentado em `me`. */
export const relativeSeat = (seat: Seat, me: Seat): RelSeat => ((seat - me + 4) % 4) as RelSeat;

/** Quem está sentado na posição relativa `rel` da mesa de `me`. */
export const seatAt = (me: Seat, rel: RelSeat): Seat => ((me + rel) % 4) as Seat;
