import { applyMove, knownVoids, teamOf } from '@domino/engine';
import type { Move, PlayerView, Rng } from '@domino/engine';
import { amadorMove, handValue, rollout } from './policies';
import { determinize, sampleHands } from './sampling';

export interface MonstroOptions {
  /** Quantas distribuições de mãos sortear (cada uma testa todas as jogadas candidatas). */
  samples?: number;
  /** Limite de tempo em ms; para antes se estourar. */
  timeLimitMs?: number;
  /** Simulações por jogada candidata em cada distribuição sorteada. */
  rolloutsPerSample?: number;
}

export interface MoveEvaluation {
  move: Move;
  /** Resultado médio da mão para a dupla de quem joga (pontos a favor menos contra, galo incluso). */
  value: number;
  /** Simulações que entraram na média. */
  rollouts: number;
}

/**
 * Monte Carlo determinizado: sorteia mãos possíveis para os outros (coerentes com os passes
 * já vistos) e joga cada candidata até o fim da mão várias vezes. Todas as candidatas são
 * testadas nas mesmas mãos sorteadas, para a comparação entre elas ser justa.
 */
export const evaluateMoves = (view: PlayerView, moves: Move[], rng: Rng, opts: MonstroOptions = {}): MoveEvaluation[] => {
  const { samples = 120, timeLimitMs = 600, rolloutsPerSample = 2 } = opts;
  const team = teamOf(view.seat);
  const voids = knownVoids(view.log);
  const totals = moves.map(() => 0);
  const deadline = Date.now() + timeLimitMs;
  let done = 0;

  for (; done < samples && Date.now() < deadline; done++) {
    const state = determinize(view, sampleHands(view, rng, voids));
    moves.forEach((move, idx) => {
      const after = applyMove(state, move);
      for (let r = 0; r < rolloutsPerSample; r++) totals[idx]! += handValue(rollout(after, rng), team);
    });
  }

  const rollouts = done * rolloutsPerSample;
  return moves.map((move, i) => ({ move, value: rollouts ? totals[i]! / rollouts : 0, rollouts }));
};

/** "Bom de praça": conta pouco (orçamento fixo, não depende da máquina) e às vezes joga no impulso. */
export const PRACA = { samples: 10, rolloutsPerSample: 1, timeLimitMs: 2_000, impulse: 0.15 } as const;

export const pracaMove = (view: PlayerView, moves: Move[], rng: Rng): Move => {
  if (moves.length === 1) return moves[0]!;
  if (rng() < PRACA.impulse) return amadorMove(view, moves, rng);
  return monstroMove(view, moves, rng, PRACA);
};

/** "É um monstro": a jogada de melhor resultado médio para a dupla. */
export const monstroMove = (view: PlayerView, moves: Move[], rng: Rng, opts: MonstroOptions = {}): Move => {
  if (moves.length === 1) return moves[0]!;
  const evaluated = evaluateMoves(view, moves, rng, opts);
  return evaluated.reduce((best, e) => (e.value > best.value ? e : best)).move;
};
