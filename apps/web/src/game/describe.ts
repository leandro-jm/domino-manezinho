import { boardEnds, tileById, tileLabel, type HandResult, type Move, type PlacedTile, type Team } from '@domino/engine';
import { BATIDA_LABELS } from '@domino/shared';

/**
 * A jogada em palavras ("Tião jogou 3-5 na ponta do 3"). Com a mesa de antes dá pra dizer a ponta;
 * mesa vazia é a saída.
 */
export const moveText = (move: Move, name: string, boardBefore?: readonly PlacedTile[]): string => {
  if (move.type === 'pass') return `${name} passou (toc-toc)`;
  const tile = tileLabel(tileById(move.tileId));
  if (!boardBefore) return `${name} jogou ${tile}`;
  const ends = boardEnds(boardBefore);
  if (!ends) return `${name} saiu com ${tile}`;
  return `${name} jogou ${tile} na ponta do ${move.side === 'left' ? ends[0] : ends[1]}`;
};

/** Como a mão terminou, do ponto de vista da dupla `mine`. */
export const resultText = (result: HandResult, names: readonly string[], mine: Team): string => {
  const us = (team: Team | null) => (team === null ? 'ninguém' : team === mine ? 'nós' : 'eles');
  if (result.type === 'batida') return `${BATIDA_LABELS[result.kind]} — ${names[result.seat] ?? 'Alguém'} bateu, +${result.points} pra ${us(result.team)}`;
  if (result.team === null) return 'Trancou e empatou: ninguém marca';
  return `Trancou: +${result.points} pra ${us(result.team)}`;
};

/** "o 3-5 na ponta do 3" (sem a ponta quando tanto faz). */
const placement = (move: Extract<Move, { type: 'play' }>, board: readonly PlacedTile[]): string => {
  const tile = `o ${tileLabel(tileById(move.tileId))}`;
  const ends = boardEnds(board);
  return !ends || ends[0] === ends[1] ? tile : `${tile} na ponta do ${move.side === 'left' ? ends[0] : ends[1]}`;
};

/** A dica em palavras, falando com quem vai jogar ("Joga o 3-5 na ponta do 3"). */
export const hintText = (move: Move, board: readonly PlacedTile[]): string => {
  if (move.type === 'pass') return 'Não tem jeito: toc-toc.';
  if (!board.length) return `Sai com ${placement(move, board)}.`;
  return `Joga ${placement(move, board)}.`;
};

/** Lance pra pensar: o que foi jogado, o que o Monstro jogaria e quanto custou ("−1,2 pt"). */
export const mistakeText = (played: Move, best: Move, board: readonly PlacedTile[], loss: number): string => {
  const say = (m: Move) => (m.type === 'pass' ? 'passar' : placement(m, board));
  return `Jogaste ${say(played)}; melhor era ${say(best)} (−${loss.toFixed(1).replace('.', ',')} pt)`;
};
