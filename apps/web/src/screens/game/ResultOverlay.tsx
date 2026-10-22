import type { PlayerView } from '@domino/engine';
import { teamOf } from '@domino/engine';
import { BATIDA_LABELS } from '@domino/shared';
import { mistakeText, moveText } from '../../game/describe';
import type { HandAnalysis, TableSeat } from '../../store/table';

/** Como foi a mão, jogada por jogada (fechado: abre quem quiser). */
function HandMoves({ view, seats }: { view: PlayerView; seats: (TableSeat | null)[] }) {
  if (!view.log.length) return null;
  return (
    <details className="hand-moves">
      <summary>Como foi a mão ({view.log.length} jogadas)</summary>
      <ol>
        {view.log.map((m, i) => (
          <li key={i}>{moveText(m, seats[m.seat]?.nickname ?? '?')}</li>
        ))}
      </ol>
    </details>
  );
}

/** O que o Monstro achou das minhas jogadas nessa mão. */
function Analysis({ analysis }: { analysis: HandAnalysis }) {
  if (analysis.pending) return <p className="analysis muted">O Monstro tá revendo tuas jogadas…</p>;
  if (!analysis.reviewed) return null;
  if (!analysis.mistakes.length) {
    return (
      <p className="analysis ok">
        Mandou bem: nas {analysis.reviewed} {analysis.reviewed === 1 ? 'escolha' : 'escolhas'} da mão, nenhuma ficou longe da do Monstro.
      </p>
    );
  }
  return (
    <div className="analysis">
      <strong>Lances pra pensar</strong>
      <ul>
        {analysis.mistakes.map((m, i) => (
          <li key={i}>{mistakeText(m.played, m.best, m.boardBefore, m.loss)}</li>
        ))}
      </ul>
    </div>
  );
}

export function ResultOverlay({
  view,
  seats,
  canRematch,
  onNext,
  onRematch,
  onLeave,
  analysis = null,
}: {
  view: PlayerView;
  seats: (TableSeat | null)[];
  canRematch: boolean;
  onNext?: () => void;
  onRematch?: () => void;
  onLeave: () => void;
  /** Revisão das minhas jogadas (só no treino). */
  analysis?: HandAnalysis | null;
}) {
  const r = view.result!;
  const mine = teamOf(view.seat);
  const us = (team: 0 | 1 | null) => (team === null ? 'ninguém' : team === mine ? 'nós' : 'eles');
  const matchOver = view.winner !== null;
  const won = view.winner === mine;
  const galo = r.galo[0] + r.galo[1] > 0 ? ` (+ galo: nós ${r.galo[mine]}, eles ${r.galo[mine === 0 ? 1 : 0]})` : '';

  return (
    <div className="overlay" role="dialog" aria-label="Fim da mão" aria-live="polite">
      <div className="overlay-card">
        {matchOver ? (
          <>
            <h2 className={won ? 'win' : 'lose'}>{won ? 'Ganhamos, parceiro!' : 'Perdemos… vai pro pé da figueira chorar.'}</h2>
            <p className="big-score">
              Nós {view.scores[mine]} × {view.scores[mine === 0 ? 1 : 0]} Eles
            </p>
          </>
        ) : r.type === 'batida' ? (
          <>
            <h2>{BATIDA_LABELS[r.kind]}</h2>
            <p>
              {seats[r.seat]?.nickname ?? 'Alguém'} bateu: +{r.points} pra {us(r.team)}
              {galo}
            </p>
          </>
        ) : (
          <>
            <h2>Trancou!</h2>
            <p>
              Pontos na mão — nós {r.pips[mine]}, eles {r.pips[mine === 0 ? 1 : 0]}.{' '}
              {r.team === null ? 'Empatou, ninguém marca.' : `+${r.points} pra ${us(r.team)}`}
              {galo}
            </p>
          </>
        )}
        <HandMoves view={view} seats={seats} />
        {analysis && analysis.handNumber === view.handNumber && <Analysis analysis={analysis} />}
        {!matchOver && (
          <p className="muted">
            Placar: nós {view.scores[mine]} × {view.scores[mine === 0 ? 1 : 0]} eles · até {view.config.targetScore}
          </p>
        )}
        <div className="overlay-actions">
          {!matchOver && onNext && (
            <button className="btn primary" onClick={onNext}>
              Próxima mão
            </button>
          )}
          {!matchOver && !onNext && <p className="muted">A próxima mão já vem…</p>}
          {matchOver && canRematch && onRematch && (
            <button className="btn primary" onClick={onRematch}>
              Revanche!
            </button>
          )}
          {matchOver && !canRematch && <p className="muted">Esperando o dono da mesa pedir revanche…</p>}
          {matchOver && (
            <button className="btn" onClick={onLeave}>
              Sair da mesa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
