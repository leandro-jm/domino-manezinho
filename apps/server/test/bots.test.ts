import { applyMove, createMatch, getPlayerView, isLegal, legalMoves } from '@domino/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { BotPool } from '../src/rooms/bots';

const pools: BotPool[] = [];
afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.close()));
});

/** Primeira posição da partida em que quem está na vez tem mais de uma jogada (a saída é forçada). */
const opening = () => {
  let match = createMatch({ scoring: 'batida', targetScore: 6, galo: false }, 42);
  for (let moves = legalMoves(match, match.hand.turn); moves.length < 2; moves = legalMoves(match, match.hand.turn)) {
    match = applyMove(match, moves[0]!);
  }
  return { match, view: getPlayerView(match, match.hand.turn) };
};

describe('pool de bots', () => {
  it('Monstro pensa no worker sem travar o event loop', async () => {
    const pool = new BotPool(1, { samples: 10_000, timeLimitMs: 400 }, () => undefined);
    pools.push(pool);
    const { match, view } = opening();
    // Esquenta o worker (subir com o tsx leva um tempo) antes de medir.
    await pool.choose(view, 'monstro');

    let ticks = 0;
    const tick = setInterval(() => ticks++, 10);
    const move = await pool.choose(view, 'monstro');
    clearInterval(tick);
    expect(isLegal(match, move)).toBe(true);
    // 400 ms pensando: com o event loop livre o intervalo de 10 ms dispara dezenas de vezes.
    expect(ticks).toBeGreaterThan(15);
  });

  it('sem workers joga direto', async () => {
    const pool = new BotPool(0, { samples: 4, timeLimitMs: 10 }, () => undefined);
    pools.push(pool);
    const { match, view } = opening();
    expect(isLegal(match, await pool.choose(view, 'monstro'))).toBe(true);
    expect(isLegal(match, await pool.choose(view, 'amador'))).toBe(true);
  });

  it('desligando, quem esperava recebe erro (a mesa cai no plano B)', async () => {
    const pool = new BotPool(1, { samples: 10_000, timeLimitMs: 2_000 }, () => undefined);
    const { view } = opening();
    const waiting = expect(pool.choose(view, 'monstro')).rejects.toThrow(/desligando/);
    await pool.close();
    await waiting;
  });
});
