import { createRng, shuffle, type Rng } from './rng';
import { DECK, HAND_SIZE, SEATS, SENA, handPips, hasValue, isDouble, nextSeat, teamOf } from './tiles';
import type {
  BatidaKind,
  HandResult,
  HandState,
  MatchConfig,
  MatchState,
  Move,
  PlacedTile,
  Seat,
  Side,
  Team,
  Tile,
} from './types';

export const DEFAULT_CONFIG: MatchConfig = { scoring: 'batida', targetScore: 6, galo: false };

export const BATIDA_POINTS: Record<BatidaKind, number> = { simples: 1, carroca: 2, laelo: 3, cruzada: 4 };

const GALO_POINTS = { batida: 1, pontos: 20 } as const;

/** Semente por mão: cada mão é reproduzível a partir da semente da partida. */
const handSeed = (seed: number, number: number): number => (seed ^ Math.imul(number, 0x9e3779b1)) >>> 0;

/**
 * Distribui as 28 pedras. Sem `rng`, usa a semente (reproduzível: testes, simulação, treino).
 * O servidor passa um RNG criptográfico: mulberry32 com 32 bits é invertível a partir da própria mão.
 * Cada mão sai ordenada por id para a ordem do embaralhamento não chegar ao cliente.
 */
export const dealHands = (seed: number, rng: Rng = createRng(seed)): Tile[][] => {
  const deck = shuffle(DECK, rng);
  return SEATS.map((s) => deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE).sort((x, y) => x.id - y.id));
};

const newHand = (number: number, hands: Tile[][], starter: Seat, mustOpenWith: number | null): HandState => ({
  number,
  hands,
  board: [],
  turn: starter,
  starter,
  mustOpenWith,
  log: [],
  galo: [0, 0],
  result: null,
});

export const createMatch = (config: Partial<MatchConfig>, seed: number, rng?: Rng): MatchState => {
  const hands = dealHands(handSeed(seed, 1), rng);
  const starter = hands.findIndex((h) => h.some((t) => t.id === SENA.id)) as Seat;
  return {
    config: { ...DEFAULT_CONFIG, ...config },
    scores: [0, 0],
    hand: newHand(1, hands, starter, SENA.id),
    winner: null,
    seed,
  };
};

export const boardEnds = (board: readonly PlacedTile[]): [number, number] | null => {
  const first = board[0];
  const last = board[board.length - 1];
  return first && last ? [first.left, last.right] : null;
};

/** Jogadas de `seat` com estas pedras (sem passe). Serve tanto ao estado completo quanto à visão de um jogador. */
export const playsFor = (seat: Seat, board: readonly PlacedTile[], mustOpenWith: number | null, tiles: readonly Tile[]): Move[] => {
  const ends = boardEnds(board);
  if (!ends) {
    const openers = mustOpenWith === null ? tiles : tiles.filter((t) => t.id === mustOpenWith);
    return openers.map((t) => ({ type: 'play', seat, tileId: t.id, side: 'left' }));
  }
  const [left, right] = ends;
  const moves: Move[] = [];
  for (const t of tiles) {
    if (hasValue(t, left)) moves.push({ type: 'play', seat, tileId: t.id, side: 'left' });
    // Pontas iguais: jogar à esquerda ou à direita dá no mesmo, oferece só uma opção.
    if (hasValue(t, right) && left !== right) {
      moves.push({ type: 'play', seat, tileId: t.id, side: 'right' });
    }
  }
  return moves;
};

export const legalMoves = (match: MatchState, seat: Seat): Move[] => {
  const { hand } = match;
  if (match.winner !== null || hand.result || hand.turn !== seat) return [];
  const plays = playsFor(seat, hand.board, hand.mustOpenWith, hand.hands[seat]!);
  return plays.length ? plays : [{ type: 'pass', seat }];
};

const sameMove = (a: Move, b: Move): boolean =>
  a.type === b.type && a.seat === b.seat && (a.type === 'pass' || (b.type === 'play' && a.tileId === b.tileId && a.side === b.side));

/**
 * A jogada legal equivalente à pedida, ou null. Com as duas pontas iguais tanto faz o lado:
 * a lista de legais só oferece a esquerda, mas quem mandar a direita também vale.
 * Devolve sempre o objeto da lista de legais (só os campos da jogada, nada a mais do que veio de fora).
 */
export const canonicalMove = (match: MatchState, move: Move): Move | null => {
  const legal = legalMoves(match, move.seat);
  const exact = legal.find((m) => sameMove(m, move));
  if (exact) return exact;
  const ends = boardEnds(match.hand.board);
  if (move.type !== 'play' || !ends || ends[0] !== ends[1]) return null;
  return legal.find((m) => m.type === 'play' && m.tileId === move.tileId) ?? null;
};

export const isLegal = (match: MatchState, move: Move): boolean => canonicalMove(match, move) !== null;

const place = (board: PlacedTile[], tile: Tile, side: Side, seat: Seat): PlacedTile[] => {
  const ends = boardEnds(board);
  if (!ends) return [{ tile, left: tile.a, right: tile.b, seat }];
  if (side === 'left') {
    const right = ends[0];
    const left = tile.a === right ? tile.b : tile.a;
    return [{ tile, left, right, seat }, ...board];
  }
  const left = ends[1];
  const right = tile.a === left ? tile.b : tile.a;
  return [...board, { tile, left, right, seat }];
};

export const batidaKind = (tile: Tile, ends: [number, number]): BatidaKind => {
  const [left, right] = ends;
  const fitsBoth = hasValue(tile, left) && hasValue(tile, right);
  if (isDouble(tile)) return fitsBoth ? 'cruzada' : 'carroca';
  return fitsBoth && left !== right ? 'laelo' : 'simples';
};

const isBlocked = (hand: HandState): boolean => {
  const ends = boardEnds(hand.board);
  if (!ends) return false;
  return hand.hands.every((h) => !h.some((t) => hasValue(t, ends[0]) || hasValue(t, ends[1])));
};

const teamPips = (hand: HandState): [number, number] => [
  handPips(hand.hands[0]!) + handPips(hand.hands[2]!),
  handPips(hand.hands[1]!) + handPips(hand.hands[3]!),
];

const finishHand = (match: MatchState, hand: HandState, result: HandResult): MatchState => {
  const scores: [number, number] = [match.scores[0] + result.galo[0], match.scores[1] + result.galo[1]];
  if (result.team !== null) scores[result.team] += result.points;

  const target = match.config.targetScore;
  let winner: Team | null = null;
  if (scores[0] >= target || scores[1] >= target) {
    if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  }
  return { ...match, scores, winner, hand: { ...hand, result } };
};

export const applyMove = (match: MatchState, requested: Move): MatchState => {
  const move = canonicalMove(match, requested);
  if (!move) throw new Error(`Jogada inválida: ${JSON.stringify(requested)}`);
  const { hand, config } = match;
  const log = [...hand.log, move];

  if (move.type === 'pass') {
    const galo: [number, number] = [...hand.galo];
    const previous = hand.log[hand.log.length - 1];
    if (config.galo && previous?.type === 'play') galo[teamOf(previous.seat)] += GALO_POINTS[config.scoring];
    return { ...match, hand: { ...hand, log, galo, turn: nextSeat(move.seat) } };
  }

  const seat = move.seat;
  const tile = hand.hands[seat]!.find((t) => t.id === move.tileId)!;
  const hands = hand.hands.map((h, i) => (i === seat ? h.filter((t) => t.id !== tile.id) : h));
  const endsBefore = boardEnds(hand.board);
  const board = place(hand.board, tile, move.side, seat);
  const next: HandState = { ...hand, hands, board, log, mustOpenWith: null, turn: nextSeat(seat) };

  if (hands[seat]!.length === 0) {
    const team = teamOf(seat);
    const kind = endsBefore ? batidaKind(tile, endsBefore) : 'simples';
    const points = config.scoring === 'batida' ? BATIDA_POINTS[kind] : teamPips(next)[team === 0 ? 1 : 0];
    return finishHand(match, next, { type: 'batida', seat, team, kind, points, galo: next.galo });
  }

  if (isBlocked(next)) {
    const pips = teamPips(next);
    const team: Team | null = pips[0] === pips[1] ? null : pips[0] < pips[1] ? 0 : 1;
    const points = team === null ? 0 : config.scoring === 'batida' ? 1 : pips[team === 0 ? 1 : 0];
    return finishHand(match, next, { type: 'trancado', team, pips, points, galo: next.galo });
  }

  return { ...match, hand: next };
};

/** Quem sai na próxima mão: quem bateu; no trancado, o jogador da dupla vencedora com menos pontos na mão. */
const nextStarter = (hand: HandState): Seat => {
  const result = hand.result!;
  if (result.type === 'batida') return result.seat;
  if (result.team === null) return hand.starter;
  const [a, b] = SEATS.filter((s) => teamOf(s) === result.team) as [Seat, Seat];
  return handPips(hand.hands[b]!) < handPips(hand.hands[a]!) ? b : a;
};

export const startNextHand = (match: MatchState, rng?: Rng): MatchState => {
  if (!match.hand.result) throw new Error('A mão atual ainda não terminou');
  if (match.winner !== null) throw new Error('A partida já terminou');
  const number = match.hand.number + 1;
  const hands = dealHands(handSeed(match.seed, number), rng);
  return { ...match, hand: newHand(number, hands, nextStarter(match.hand), null) };
};
