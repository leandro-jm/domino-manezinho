export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type Side = 'left' | 'right';

/** Pedra do dominó duplo-6. Sempre a <= b. */
export interface Tile {
  id: number;
  a: number;
  b: number;
}

/** Pedra colocada na mesa, já orientada (left/right são os valores visíveis de cada lado). */
export interface PlacedTile {
  tile: Tile;
  left: number;
  right: number;
  seat: Seat;
}

export type Move =
  | { type: 'play'; seat: Seat; tileId: number; side: Side }
  | { type: 'pass'; seat: Seat };

/**
 * - batida: pontua pelo tipo de batida (simples 1, carroça 2, lá-e-ló 3, cruzada 4).
 * - pontos: pontua a soma dos pontinhos que sobraram na mão da dupla adversária.
 */
export type ScoringMode = 'batida' | 'pontos';

export interface MatchConfig {
  scoring: ScoringMode;
  targetScore: number;
  /** Passe do adversário logo após sua jogada dá ponto pra tua dupla. */
  galo: boolean;
}

export type BatidaKind = 'simples' | 'carroca' | 'laelo' | 'cruzada';

export type HandResult =
  | { type: 'batida'; seat: Seat; team: Team; kind: BatidaKind; points: number; galo: [number, number] }
  | { type: 'trancado'; team: Team | null; pips: [number, number]; points: number; galo: [number, number] };

export interface HandState {
  number: number;
  hands: Tile[][];
  board: PlacedTile[];
  turn: Seat;
  starter: Seat;
  /** Na 1ª mão a saída é obrigatoriamente com a carroça de sena. */
  mustOpenWith: number | null;
  log: Move[];
  galo: [number, number];
  result: HandResult | null;
}

export interface MatchState {
  config: MatchConfig;
  scores: [number, number];
  hand: HandState;
  winner: Team | null;
  seed: number;
}
