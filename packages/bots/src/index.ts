import { createRng, legalMovesForView } from '@domino/engine';
import type { Move, PlayerView, Rng } from '@domino/engine';
import type { BotLevel } from '@domino/shared';
import { amadorMove } from './policies';
import { evaluateMoves, monstroMove, pracaMove, type MonstroOptions, type MoveEvaluation } from './monstro';

export interface ChooseOptions {
  rng?: Rng;
  monstro?: MonstroOptions;
}

/** Decide a jogada de um bot só com o que ele enxerga da mesa. */
export const chooseMove = (view: PlayerView, level: BotLevel, opts: ChooseOptions = {}): Move => {
  if (view.result || view.winner !== null) throw new Error('A mão já acabou');
  const moves = legalMovesForView(view);
  if (!moves.length) throw new Error('Não é a vez deste bot');
  const rng = opts.rng ?? randomRng();
  if (level === 'amador') return amadorMove(view, moves, rng);
  if (level === 'praca') return pracaMove(view, moves, rng);
  return monstroMove(view, moves, rng, opts.monstro);
};

/**
 * Todas as jogadas de quem está na vez avaliadas pelo Monstro, da melhor para a pior.
 * Base da dica e da análise pós-jogo: `value` é o resultado médio da mão para a dupla.
 */
export const rankMoves = (view: PlayerView, opts: ChooseOptions = {}): MoveEvaluation[] => {
  if (view.result || view.winner !== null) throw new Error('A mão já acabou');
  const moves = legalMovesForView(view);
  if (!moves.length) throw new Error('Não é a vez deste jogador');
  return evaluateMoves(view, moves, opts.rng ?? randomRng(), opts.monstro).sort((a, b) => b.value - a.value);
};

export interface MoveReview {
  played: MoveEvaluation;
  best: MoveEvaluation;
  /** Quanto a jogada feita rende a menos que a melhor (0 = jogou a melhor). */
  loss: number;
}

/** Compara a jogada feita com a que o Monstro faria, na mesma situação (só o que o jogador enxergava). */
export const reviewMove = (view: PlayerView, played: Move, opts: ChooseOptions = {}): MoveReview => {
  const ranked = rankMoves(view, opts);
  const mine = ranked.find((r) => sameMove(r.move, played));
  if (!mine) throw new Error('Jogada não era legal nessa situação');
  const best = ranked[0]!;
  return { played: mine, best, loss: Math.max(0, best.value - mine.value) };
};

const sameMove = (a: Move, b: Move): boolean =>
  a.type === b.type && (a.type === 'pass' || (b.type === 'play' && a.tileId === b.tileId && a.side === b.side));

const randomRng = (): Rng => createRng((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);

export { evaluateMoves, monstroMove, type MonstroOptions, type MoveEvaluation } from './monstro';
export { sampleHands, unseenTiles, determinize } from './sampling';
export { playBotMatch } from './arena';
