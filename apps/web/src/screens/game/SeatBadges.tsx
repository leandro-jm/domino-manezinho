import { knownVoids, type PlayerView } from '@domino/engine';
import { Avatar } from '../../components/Avatar';
import { seatAt } from '../../game/seats';
import { useSettings } from '../../lib/settings';
import type { TableEmote, TableSeat } from '../../store/table';

/** "3", "3 e 5", "1, 3 e 5". */
const listValues = (values: number[]): string =>
  values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`;

/** Crachás dos outros três jogadores nas bordas da tela: direita, frente (parceiro) e esquerda. */
export function SeatBadges({
  view,
  seats,
  emotes,
  memory = false,
}: {
  view: PlayerView;
  seats: (TableSeat | null)[];
  emotes: TableEmote[];
  /** Mostra embaixo do nome os números que cada um já mostrou não ter (memória da mesa, só no treino). */
  memory?: boolean;
}) {
  const voids = memory ? knownVoids(view.log) : null;
  const muted = useSettings((s) => s.muted);
  const toggleMute = (id: string) =>
    useSettings.getState().set({ muted: muted.includes(id) ? muted.filter((x) => x !== id) : [...muted, id] });
  return (
    <>
      {([1, 2, 3] as const).map((rel) => {
        const seat = seatAt(view.seat, rel);
        const info = seats[seat] ?? null;
        const count = view.handCounts[seat];
        const emote = [...emotes].reverse().find((e) => e.seat === seat);
        const isTurn = !view.result && view.turn === seat;
        const missing = voids ? listValues([...voids[seat]!].sort((a, b) => a - b)) : '';
        return (
          <div
            key={rel}
            className={`seat-label seat-pos-${rel} ${isTurn ? 'is-turn' : ''} ${info && !info.connected ? 'is-away' : ''}`}
            data-seat={seat}
            aria-label={`${info?.nickname ?? 'Cadeira vazia'}, ${count} pedras${missing ? `, não tem ${missing}` : ''}${isTurn ? ', vez dele' : ''}`}
          >
            {emote && <div className="speech">{emote.text}</div>}
            <Avatar id={info?.avatarId ?? 'veterano'} size={rel === 2 ? 56 : 76} />
            <div className="seat-text">
              <div className="seat-name">{info?.nickname ?? 'Cadeira vazia'}</div>
              <div className="seat-meta">
                {rel === 2 ? 'parceiro · ' : ''}
                {count} {count === 1 ? 'pedra' : 'pedras'}
                {info && !info.connected ? ' · caiu' : ''}
              </div>
              {voids && <div className="seat-memory">{missing ? `sem ${missing}` : 'ainda não passou'}</div>}
            </div>
            {info?.playerId && (
              <button
                className={`seat-mute ${muted.includes(info.playerId) ? 'is-on' : ''}`}
                aria-pressed={muted.includes(info.playerId)}
                aria-label={muted.includes(info.playerId) ? `Voltar a ouvir ${info.nickname}` : `Silenciar ${info.nickname}`}
                title={muted.includes(info.playerId) ? 'Silenciado' : 'Silenciar frases'}
                onClick={() => toggleMute(info.playerId!)}
              >
                {muted.includes(info.playerId) ? '🔇' : '💬'}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
