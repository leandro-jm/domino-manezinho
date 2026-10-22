import { useEffect, useMemo, useRef } from 'react';
import type { PlayerView } from '@domino/engine';
import { createRng, tileById, tileLabel } from '@domino/engine';
import { bubbleEls } from '../../game/bubbles';
import { PERUS, commentFor, deriveEvents, useKibitz, type KibitzEvent } from '../../game/kibitz';
import type { HandAnalysis, TableSeat } from '../../store/table';

/** Os perus comentam o jogo: depois dos lances, quando alguém demora, e de vez em quando jogam conversa fora. */
export function useKibitzers(view: PlayerView | null, seats: (TableSeat | null)[], count: number, analysis: HandAnalysis | null = null) {
  const prev = useRef<PlayerView | null>(null);
  const lastSaid = useRef(0);
  const names = useRef<string[]>([]);
  const rng = useMemo(() => createRng((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0), []);
  names.current = seats.map((s) => s?.nickname ?? 'o parceiro');
  const countRef = useRef(count);
  countRef.current = count;

  const speak = useRef((event: KibitzEvent) => {
    if (!countRef.current) return;
    const important = event.type === 'batida' || event.type === 'trancado' || event.type === 'match' || event.type === 'mistake';
    if (!important && Date.now() - lastSaid.current < 3500) return;
    const text = commentFor(event, { names: names.current }, rng);
    if (!text) return;
    const busy = new Set(useKibitz.getState().lines.map((l) => l.peru));
    const free = Array.from({ length: countRef.current }, (_, i) => i).filter((i) => !busy.has(i));
    if (!free.length) return;
    useKibitz.getState().say(free[Math.floor(rng() * free.length)]!, text);
    lastSaid.current = Date.now();
  }).current;
  useEffect(() => {
    if (!view) return;
    const [event] = deriveEvents(prev.current, view);
    prev.current = view;
    // pequena pausa: comentário vem depois do "clack" da pedra
    if (event) {
      const t = setTimeout(() => speak(event), 600);
      return () => clearTimeout(t);
    }
  }, [view, speak]);

  // O pior lance da mão, quando a revisão do treino chega.
  const worst = analysis && !analysis.pending ? analysis.mistakes[0] : undefined;
  useEffect(() => {
    if (!worst || worst.best.type !== 'play' || !view) return;
    speak({ type: 'mistake', seat: view.seat, best: tileLabel(tileById(worst.best.tileId)) });
  }, [worst, speak]);

  const myTurn = !!view && !view.result && view.turn === view.seat;
  useEffect(() => {
    if (!myTurn || !view) return;
    const seat = view.seat;
    const t = setTimeout(() => speak({ type: 'slow', seat }), 15_000);
    return () => clearTimeout(t);
  }, [myTurn, view?.log.length, view?.handNumber, speak]);

  useEffect(() => {
    const t = setInterval(() => speak({ type: 'idle' }), 24_000);
    return () => {
      clearInterval(t);
      useKibitz.getState().clear();
    };
  }, [speak]);
}

/** Balões dos perus. No 3D o projetor da cena os posiciona sobre a cabeça; no 2D ficam empilhados no topo. */
export function KibitzBubbles({ floating }: { floating: boolean }) {
  const lines = useKibitz((s) => s.lines);
  return (
    <div className={floating ? '' : 'kibitz-stack'}>
      {lines.map((l) => (
        <div
          key={l.key}
          className="kibitz-bubble"
          ref={(el) => {
            if (!floating) return;
            if (el) bubbleEls.set(l.peru, el);
            else if (bubbleEls.get(l.peru)?.dataset.key === String(l.key)) bubbleEls.delete(l.peru);
          }}
          data-key={l.key}
          style={floating ? { visibility: 'hidden' } : undefined}
          role="status"
        >
          <div className="kibitz-inner">
            <strong>{PERUS[l.peru]}</strong>
            {l.text}
          </div>
        </div>
      ))}
    </div>
  );
}
