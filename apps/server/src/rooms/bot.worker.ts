import { parentPort } from 'node:worker_threads';
import { chooseMove } from '@domino/bots';
import type { BotRequest, BotResponse } from './bots';

// Pensa a jogada do bot fora do event loop principal (o Monstro leva centenas de ms).
parentPort!.on('message', (req: BotRequest) => {
  let res: BotResponse;
  try {
    res = { id: req.id, move: chooseMove(req.view, req.level, { monstro: req.monstro }) };
  } catch (err) {
    res = { id: req.id, error: err instanceof Error ? err.message : String(err) };
  }
  parentPort!.postMessage(res);
});
