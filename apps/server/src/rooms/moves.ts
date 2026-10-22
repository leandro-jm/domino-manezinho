import { legalMoves, tileById, type MatchState, type Move, type Seat } from '@domino/engine';

/** Jogada automática quando o tempo estoura: a pedra mais pesada, senão passa. */
export const heaviestMove = (match: MatchState, seat: Seat): Move => {
  const moves = legalMoves(match, seat);
  let best: Move | undefined;
  let bestPips = -1;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const t = tileById(m.tileId);
    if (t.a + t.b > bestPips) {
      best = m;
      bestPips = t.a + t.b;
    }
  }
  return best ?? moves[0] ?? { type: 'pass', seat };
};

/** Normaliza a jogada do cliente; a cadeira sempre é a do socket. */
export const sanitizeMove = (raw: unknown, seat: Seat): Move | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'pass') return { type: 'pass', seat };
  if (m.type !== 'play' || !Number.isInteger(m.tileId) || (m.side !== 'left' && m.side !== 'right')) return null;
  return { type: 'play', seat, tileId: m.tileId as number, side: m.side };
};
