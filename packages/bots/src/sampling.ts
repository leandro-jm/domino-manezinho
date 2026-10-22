import { DECK, SEATS, hasValue, knownVoids, shuffle } from '@domino/engine';
import type { MatchState, PlayerView, Rng, Seat, Tile } from '@domino/engine';

/** Pedras que o jogador não vê: nem na mão dele, nem na mesa. */
export const unseenTiles = (view: PlayerView): Tile[] => {
  const seen = new Set([...view.myHand.map((t) => t.id), ...view.board.map((p) => p.tile.id)]);
  return DECK.filter((t) => !seen.has(t.id));
};

/**
 * Sorteia uma distribuição possível das mãos escondidas, respeitando quantas pedras
 * cada um tem e os números que cada um comprovadamente não tem (passes).
 */
export const sampleHands = (view: PlayerView, rng: Rng, voids = knownVoids(view.log)): Tile[][] => {
  const others = SEATS.filter((s) => s !== view.seat);
  const unseen = unseenTiles(view);

  for (let attempt = 0; attempt < 200; attempt++) {
    const hands: Tile[][] = [[], [], [], []];
    hands[view.seat] = view.myHand.slice();
    const room = (s: Seat) => view.handCounts[s] - hands[s]!.length;
    const canHold = (s: Seat, t: Tile) => room(s) > 0 && ![...voids[s]!].some((v) => hasValue(t, v));

    const left = shuffle(unseen, rng);
    let ok = true;
    while (left.length) {
      // Sempre a pedra mais restrita agora (as cadeiras vão enchendo), para não cair em beco sem saída.
      let pick = 0;
      let fewest = Infinity;
      left.forEach((t, i) => {
        const n = others.filter((s) => canHold(s, t)).length;
        if (n < fewest) [pick, fewest] = [i, n];
      });
      const t = left.splice(pick, 1)[0]!;
      const options = others.filter((s) => canHold(s, t));
      if (!options.length) {
        ok = false;
        break;
      }
      // Cadeira com mais espaço livre tem mais chance de ter a pedra (sorteio uniforme das mãos possíveis).
      let r = rng() * options.reduce<number>((sum, s) => sum + room(s), 0);
      const seat = options.find((s) => (r -= room(s)) < 0) ?? options[options.length - 1]!;
      hands[seat]!.push(t);
    }
    if (ok) return hands;
  }

  // Sem solução consistente (não deveria ocorrer): distribui ignorando os passes.
  const hands: Tile[][] = [[], [], [], []];
  hands[view.seat] = view.myHand.slice();
  const pool = shuffle(unseen, rng);
  for (const s of others) hands[s] = pool.splice(0, view.handCounts[s]);
  return hands;
};

/** Monta um estado completo de partida a partir da visão + mãos sorteadas (para simular). */
export const determinize = (view: PlayerView, hands: Tile[][]): MatchState => ({
  config: view.config,
  scores: view.scores,
  winner: null,
  seed: 0,
  hand: {
    number: view.handNumber,
    hands,
    board: view.board,
    turn: view.turn,
    starter: view.turn,
    mustOpenWith: view.mustOpenWith,
    log: view.log,
    galo: [0, 0],
    result: null,
  },
});
