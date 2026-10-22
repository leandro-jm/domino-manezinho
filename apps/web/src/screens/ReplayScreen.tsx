import { useEffect, useMemo, useState } from 'react';
import { replayMatch, teamOf, type MatchState } from '@domino/engine';
import type { MatchDetail } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { Board2D } from '../components/Board2D';
import { ScreenHeader } from '../components/ScreenHeader';
import { TileFace } from '../components/TileFace';
import { moveText, resultText } from '../game/describe';
import { layoutBoard } from '../game/layout';
import { seatAt } from '../game/seats';
import { api } from '../lib/api';
import { useProfile } from '../store/profile';
import { scoreLine } from './MatchesScreen';

const STEP_MS = 1100;

/** Refaz a partida; null se ela é de antes do histórico (sem as pedras dadas) ou não fecha com as jogadas. */
const replayOf = (m: MatchDetail): MatchState[][] | null => {
  if (!m.hands.length || m.hands.some((h) => !h.dealt)) return null;
  try {
    return replayMatch(
      m.config,
      m.hands.map((h) => ({ number: h.number, dealt: h.dealt!, moves: h.moves })),
    );
  } catch (err) {
    console.error('[replay] partida não fecha', err);
    return null;
  }
};

function HandReplay({ match, states }: { match: MatchDetail; states: MatchState[] }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const names = match.seats.map((s) => s.nickname);
  const mine = teamOf(match.mySeat);
  const last = states.length - 1;
  const state = states[step]!;
  const moves = states[last]!.hand.log;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(last, s + 1));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      else return;
      setPlaying(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const layout = useMemo(() => layoutBoard(state.hand.board, state.hand.log), [state]);
  const played = step > 0 ? moves[step - 1]! : null;
  const lastPlayedId = played?.type === 'play' ? played.tileId : null;
  const caption = played
    ? moveText(played, names[played.seat] ?? '?', states[step - 1]!.hand.board)
    : `Mão ${state.hand.number}: pedras na mão, ${names[state.hand.turn]} sai`;
  const go = (s: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, s)));
  };

  return (
    <>
      <div className="replay-board">
        <Board2D layout={layout} pickableSides={[]} onPickSide={() => undefined} lastPlayedId={lastPlayedId} />
      </div>
      <section className="replay-panel">
        <p className="replay-caption" aria-live="polite">
          {caption}
          {step === last && state.hand.result && <strong> · {resultText(state.hand.result, names, mine)}</strong>}
        </p>
        <p className="replay-meta">
          Placar: nós {state.scores[mine]} × {state.scores[mine === 0 ? 1 : 0]} eles · jogada {step} de {last}
        </p>
        <div className="replay-controls" role="group" aria-label="Controles do replay">
          <button className="btn icon" aria-label="Começo da mão" onClick={() => go(0)} disabled={step === 0}>
            ⏮
          </button>
          <button className="btn icon" aria-label="Jogada anterior" onClick={() => go(step - 1)} disabled={step === 0}>
            ◀
          </button>
          <button
            className="btn primary"
            onClick={() => (step >= last ? (setStep(0), setPlaying(true)) : setPlaying(!playing))}
            aria-pressed={playing}
          >
            {playing ? 'Pausar' : step >= last ? 'Ver de novo' : 'Tocar'}
          </button>
          <button className="btn icon" aria-label="Próxima jogada" onClick={() => go(step + 1)} disabled={step === last}>
            ▶
          </button>
          <button className="btn icon" aria-label="Fim da mão" onClick={() => go(last)} disabled={step === last}>
            ⏭
          </button>
        </div>
      </section>

      <section className="card replay-hands" aria-label="Pedras de cada um">
        {([0, 1, 2, 3] as const).map((rel) => {
          const seat = seatAt(match.mySeat, rel);
          const info = match.seats[seat]!;
          const turn = !state.hand.result && state.hand.turn === seat;
          return (
            <div key={seat} className={`replay-seat ${turn ? 'is-turn' : ''}`}>
              <Avatar id={info.avatarId} size={36} />
              <div className="grow">
                <strong>
                  {info.nickname}
                  {seat === match.mySeat ? ' (tu)' : rel === 2 ? ' (parceiro)' : ''}
                </strong>
                <div className="replay-tiles" aria-label={`${state.hand.hands[seat]!.length} pedras`}>
                  {state.hand.hands[seat]!.map((t) => (
                    <TileFace key={t.id} top={t.a} bottom={t.b} width={22} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <details className="card">
        <summary>Todas as jogadas da mão ({moves.length})</summary>
        <ol className="replay-moves">
          {moves.map((m, i) => (
            <li key={i}>
              <button className={i + 1 === step ? 'is-current' : ''} onClick={() => go(i + 1)}>
                {moveText(m, names[m.seat] ?? '?', states[i]!.hand.board)}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

/** Partida de antes do histórico: só dá pra listar como cada mão terminou. */
function HandsSummary({ match }: { match: MatchDetail }) {
  const names = match.seats.map((s) => s.nickname);
  const mine = teamOf(match.mySeat);
  return (
    <section className="card">
      <p className="muted">Essa partida é de antes do replay: dá pra ver as jogadas, mas não as pedras de cada um.</p>
      <ol className="replay-moves">
        {match.hands.map((h) => (
          <li key={h.number}>
            <details>
              <summary>
                Mão {h.number}: {h.winnerTeam === null ? 'empate' : `+${h.points} pra ${h.winnerTeam === mine ? 'nós' : 'eles'}`}
              </summary>
              <ol>
                {h.moves.map((m, i) => (
                  <li key={i}>{moveText(m, names[m.seat] ?? '?')}</li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReplayScreen({ id }: { id: string }) {
  const token = useProfile((s) => s.token);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handIdx, setHandIdx] = useState(0);
  const replays = useMemo(() => (match ? replayOf(match) : null), [match]);

  useEffect(() => {
    if (!token) return;
    setError(null);
    api
      .match(id)
      .then(setMatch)
      .catch((err: Error) => setError(err.message));
  }, [id, token]);

  const mine = match ? teamOf(match.mySeat) : 0;
  const won = match?.winnerTeam === mine;

  return (
    <main className="screen">
      <ScreenHeader title="Replay" back="/partidas" />
      {error && <p className="error">{error}</p>}
      {!match && !error && <p className="muted">Arrumando as pedras…</p>}
      {match && (
        <>
          <p className="replay-summary">
            <span className={`match-badge ${won ? 'is-win' : 'is-loss'}`}>{won ? 'Ganhamos' : 'Perdemos'}</span>
            {scoreLine(match)}
          </p>
          {replays ? (
            <>
              {replays.length > 1 && (
                <div className="tabs" role="tablist" aria-label="Mãos da partida">
                  {replays.map((_, i) => (
                    <button key={i} role="tab" aria-selected={handIdx === i} className={handIdx === i ? 'is-active' : ''} onClick={() => setHandIdx(i)}>
                      Mão {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <HandReplay key={handIdx} match={match} states={replays[handIdx]!} />
            </>
          ) : (
            <HandsSummary match={match} />
          )}
        </>
      )}
    </main>
  );
}
