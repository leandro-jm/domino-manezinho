import { boardEnds, playsFor } from './rules';
import type { HandResult, MatchConfig, MatchState, Move, PlacedTile, Seat, Tile } from './types';

/**
 * Tudo que um jogador enxerga sentado à mesa: a própria mão e quantas pedras os outros têm.
 * É o que o servidor manda para cada cliente e o que os bots recebem para decidir.
 */
export interface PlayerView {
  seat: Seat;
  config: MatchConfig;
  scores: [number, number];
  handNumber: number;
  myHand: Tile[];
  handCounts: [number, number, number, number];
  board: PlacedTile[];
  ends: [number, number] | null;
  turn: Seat;
  mustOpenWith: number | null;
  log: Move[];
  result: HandResult | null;
  /** Mão de todos revelada só quando a mão termina. */
  revealedHands: Tile[][] | null;
  winner: 0 | 1 | null;
}

/** Cópias rasas: quem recebe a visão (bot, tela) pode ordenar ou mexer sem estragar o estado da partida. */
export const getPlayerView = (match: MatchState, seat: Seat): PlayerView => {
  const { hand } = match;
  return {
    seat,
    config: { ...match.config },
    scores: [...match.scores],
    handNumber: hand.number,
    myHand: hand.hands[seat]!.slice(),
    handCounts: hand.hands.map((h) => h.length) as PlayerView['handCounts'],
    board: hand.board.slice(),
    ends: boardEnds(hand.board),
    turn: hand.turn,
    mustOpenWith: hand.mustOpenWith,
    log: hand.log.slice(),
    result: hand.result,
    revealedHands: hand.result ? hand.hands.map((h) => h.slice()) : null,
    winner: match.winner,
  };
};

/** Jogadas legais de quem enxerga esta visão (as mãos dos outros não importam pra isso). */
export const legalMovesForView = (view: PlayerView): Move[] => {
  if (view.result || view.winner !== null || view.turn !== view.seat) return [];
  const plays = playsFor(view.seat, view.board, view.mustOpenWith, view.myHand);
  return plays.length ? plays : [{ type: 'pass', seat: view.seat }];
};
