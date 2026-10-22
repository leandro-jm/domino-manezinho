import { applyMove, createMatch, createRng, getPlayerView, startNextHand } from '@domino/engine';
import type { MatchConfig, MatchState } from '@domino/engine';
import type { BotLevel } from '@domino/shared';
import { chooseMove, type ChooseOptions } from './index';

/** Partida completa só entre bots (assentos 0..3). Usada no simulador e nos testes. */
export const playBotMatch = (
  levels: [BotLevel, BotLevel, BotLevel, BotLevel],
  seed: number,
  config: Partial<MatchConfig> = {},
  opts: Omit<ChooseOptions, 'rng'> = {},
): MatchState => {
  const rng = createRng(seed ^ 0x5eed);
  let m = createMatch(config, seed);
  while (m.winner === null) {
    if (m.hand.result) {
      m = startNextHand(m);
      continue;
    }
    const seat = m.hand.turn;
    m = applyMove(m, chooseMove(getPlayerView(m, seat), levels[seat], { ...opts, rng }));
  }
  return m;
};
