import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { teamOf } from '@domino/engine';
import type { MatchSummary } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { useProfile } from '../store/profile';

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "Nós 6 × 4 Eles" do ponto de vista de quem jogou. */
export const scoreLine = (m: Pick<MatchSummary, 'scores' | 'mySeat'>): string | null => {
  if (!m.scores) return null;
  const mine = teamOf(m.mySeat);
  return `Nós ${m.scores[mine]} × ${m.scores[mine === 0 ? 1 : 0]} Eles`;
};

function MatchRow({ m }: { m: MatchSummary }) {
  const mine = teamOf(m.mySeat);
  const won = m.winnerTeam === mine;
  const partner = m.seats.find((s) => s.team === mine && s.seat !== m.mySeat);
  const rivals = m.seats.filter((s) => s.team !== mine);
  const delta = m.seats.find((s) => s.seat === m.mySeat)?.ratingDelta ?? 0;
  const score = scoreLine(m);
  return (
    <li>
      <Link href={`/partidas/${m.id}`} className="match-row">
        <span className={`match-badge ${won ? 'is-win' : 'is-loss'}`}>{won ? 'Ganhou' : 'Perdeu'}</span>
        <div className="grow">
          <strong>{score ?? `${m.handCount} ${m.handCount === 1 ? 'mão' : 'mãos'}`}</strong>
          <small>
            {partner && <>com {partner.nickname} · </>}
            contra {rivals.map((r) => r.nickname).join(' e ')}
          </small>
          <small>
            {when(m.endedAt)} · até {m.config.targetScore}
            {m.config.scoring === 'pontos' ? ' pts' : ''}
          </small>
        </div>
        <div className="match-side">
          <Avatar id={partner?.avatarId ?? 'veterano'} size={32} />
          {m.rated && (
            <span className={`value ${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}`}>
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export function MatchesScreen() {
  const token = useProfile((s) => s.token);
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (before?: string) => {
    setLoading(true);
    setError(null);
    api
      .matches(before)
      .then((page) => {
        setMatches((prev) => (before && prev ? [...prev, ...page.matches] : page.matches));
        setNext(page.next);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (token) load();
  }, [token]);

  return (
    <main className="screen">
      <ScreenHeader title="Minhas partidas" back="/perfil" />
      <p className="muted">Partidas online que terminaram. Toca numa pra rever mão a mão.</p>
      {!token && <p className="card">Conectando com a Praça…</p>}
      {error && <p className="error">{error}</p>}
      {token && !matches && !error && <p className="muted">Buscando as partidas…</p>}
      {matches?.length === 0 && <p className="card">Nenhuma partida online ainda. Chama a turma pra uma mesa!</p>}
      {matches && matches.length > 0 && (
        <ol className="ranking match-list">
          {matches.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </ol>
      )}
      {next && (
        <button className="btn block" disabled={loading} onClick={() => load(next)}>
          {loading ? 'Buscando…' : 'Mostrar mais antigas'}
        </button>
      )}
    </main>
  );
}
