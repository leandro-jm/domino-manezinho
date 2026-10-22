import { useEffect, useState } from 'react';
import { teamOf } from '@domino/engine';
import { moveText, resultText } from '../../game/describe';
import { useTable } from '../../store/table';

/**
 * Narração da mesa pra leitor de tela: cada jogada, as pontas que ficaram e quando é a minha vez.
 * A cena 3D não diz nada pra quem não enxerga; aqui fica o que acontece, em texto.
 */
export function Announcer() {
  const lastMove = useTable((s) => s.lastMove);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!lastMove) return;
    const { view, seats } = useTable.getState();
    if (!view) return;
    const names = seats.map((s, i) => (i === view.seat ? 'Tu' : (s?.nickname ?? 'Alguém')));
    const parts = [moveText(lastMove.move, names[lastMove.move.seat]!)];
    if (view.result) parts.push(resultText(view.result, names, teamOf(view.seat)));
    else {
      if (view.ends) parts.push(`Pontas ${view.ends[0]} e ${view.ends[1]}.`);
      parts.push(view.turn === view.seat ? 'Tua vez.' : `Vez de ${names[view.turn]}.`);
    }
    setText(parts.join('. ').replace(/\.\./g, '.'));
  }, [lastMove]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
