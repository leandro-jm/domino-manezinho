/// <reference lib="webworker" />
import { chooseMove, rankMoves, reviewMove } from '@domino/bots';
import type { BotLevel } from '@domino/shared';
import type { Move, PlayerView } from '@domino/engine';

export type BotWorkerRequest =
  | { type: 'move'; id: number; view: PlayerView; level: BotLevel }
  /** Dica pro humano: todas as jogadas avaliadas pelo Monstro, da melhor pra pior. */
  | { type: 'rank'; id: number; view: PlayerView }
  /** Revisão das jogadas do humano na mão que acabou. */
  | { type: 'review'; id: number; decisions: { view: PlayerView; move: Move }[] };

/** Revisão: menos conta por jogada que a dica (são várias de uma vez). */
const REVIEW = { samples: 100, timeLimitMs: 400 };

const MONSTRO = { samples: 160, timeLimitMs: 700 };

// Bots pensam fora da thread principal para a cena 3D não travar.
self.onmessage = (e: MessageEvent<BotWorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'rank') self.postMessage({ id: req.id, ranked: rankMoves(req.view, { monstro: MONSTRO }) });
    else if (req.type === 'review') {
      const reviews = req.decisions.map((d) => {
        try {
          const r = reviewMove(d.view, d.move, { monstro: REVIEW });
          return { best: r.best.move, loss: r.loss };
        } catch (err) {
          console.warn('[revisão] não deu pra rever a jogada', err);
          return null;
        }
      });
      self.postMessage({ id: req.id, reviews });
    }
    else self.postMessage({ id: req.id, move: chooseMove(req.view, req.level, { monstro: MONSTRO }) });
  } catch (err) {
    // Sem jogada: a thread principal joga no lugar (ou a dica não vem).
    console.error('[bot] falhou', err);
    self.postMessage({ id: req.id, ...(req.type === 'rank' && { ranked: null }), ...(req.type === 'review' && { reviews: null }) });
  }
};
