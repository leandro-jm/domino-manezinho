import { useEffect, useState } from 'react';
import { avatarById, rankTitle, type PublicProfile, type RankingBoard, type RankingEntry } from '@domino/shared';
import { Achievements } from '../components/Achievements';
import { Avatar } from '../components/Avatar';
import { Dialog } from '../components/Dialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { useProfile } from '../store/profile';

const BOARDS: { id: RankingBoard; label: string; unit: string; hint: string }[] = [
  { id: 'geral', label: 'Geral', unit: 'pts', hint: 'Rating das partidas online com gente de verdade.' },
  { id: 'semanal', label: 'Semana', unit: 'pts', hint: 'Quem mais subiu desde segunda-feira.' },
  { id: 'amigos', label: 'Amigos', unit: 'pts', hint: 'Tu e quem já sentou na mesa contigo.' },
  {
    id: 'treino',
    label: 'Treino',
    unit: 'vitórias',
    hint: 'Vitórias contra os bots. Ranking informal: o resultado do treino é informado pelo próprio aparelho.',
  },
];

export function RankingScreen() {
  const me = useProfile((s) => s.profile?.id);
  const token = useProfile((s) => s.token);
  const [board, setBoard] = useState<RankingBoard>('geral');
  const [entries, setEntries] = useState<RankingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<RankingEntry | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const info = BOARDS.find((b) => b.id === board)!;

  useEffect(() => {
    setEntries(null);
    setError(null);
    setMine(null);
    api
      .ranking(board)
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
    if (token) api.rankingPosition(board).then(setMine).catch(() => undefined);
  }, [board, token]);

  // Fora da lista: mostra a posição embaixo, pra ninguém ficar sem saber onde está.
  const outside = mine && entries && !entries.some((e) => e.player.id === mine.player.id) ? mine : null;
  const row = (e: RankingEntry) => (
    <li key={e.player.id} className={e.player.id === me ? 'is-me' : ''}>
      <button className="ranking-row" onClick={() => setCard(e.player.id)} aria-label={`Ver o perfil de ${e.player.nickname}`}>
        <span className={`pos pos-${e.position}`}>{e.position}º</span>
        <Avatar id={e.player.avatarId} size={40} />
        <div className="grow">
          <strong>
            {e.player.nickname}
            <span className="tag">#{e.player.tag}</span>
          </strong>
          <small>
            {board !== 'treino' && `${rankTitle(e.player.rating)} · `}
            {e.wins}/{e.games} vitórias
          </small>
        </div>
        <span className="value">
          {board === 'semanal' && e.value > 0 ? '+' : ''}
          {e.value} <small>{info.unit}</small>
        </span>
      </button>
    </li>
  );

  return (
    <main className="screen">
      <ScreenHeader title="Ranking" />
      <div className="tabs" role="tablist">
        {BOARDS.map((b) => (
          <button key={b.id} role="tab" aria-selected={board === b.id} className={board === b.id ? 'is-active' : ''} onClick={() => setBoard(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      <p className="muted">{info.hint}</p>
      {error && <p className="error">{error}</p>}
      {!entries && !error && <p className="muted">Contando as pedras…</p>}
      {entries?.length === 0 && <p className="card">Ninguém por aqui ainda. Bora jogar e estrear o ranking!</p>}
      {entries && entries.length > 0 && (
        <ol className="ranking">
          {entries.map(row)}
        </ol>
      )}
      {outside && (
        <>
          <p className="muted center">Tua posição</p>
          <ol className="ranking">{row(outside)}</ol>
        </>
      )}
      {card && <PlayerCard id={card} onClose={() => setCard(null)} />}
    </main>
  );
}

/** Cartão de um jogador do ranking: personagem, título e números. */
function PlayerCard({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .player(id)
      .then(setP)
      .catch((err: Error) => setError(err.message));
  }, [id]);
  return (
    <Dialog label="Perfil do jogador" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {!p && !error && <p className="muted">Buscando…</p>}
      {p && (
        <>
          <Avatar id={p.avatarId} size={88} />
          <h2>
            {p.nickname}
            <span className="tag">#{p.tag}</span>
          </h2>
          <p className="muted">
            {p.title} · {p.rating} pts · {avatarById(p.avatarId).name}
          </p>
          <dl className="stats">
            <div>
              <dt>Partidas online</dt>
              <dd>
                {p.stats.wins}/{p.stats.games}
              </dd>
            </div>
            <div>
              <dt>Treino</dt>
              <dd>
                {p.stats.practiceWins}/{p.stats.practiceGames}
              </dd>
            </div>
            <div>
              <dt>Carroças</dt>
              <dd>{p.stats.carrocas}</dd>
            </div>
            <div>
              <dt>Lá-e-lós</dt>
              <dd>{p.stats.laelos}</dd>
            </div>
            <div>
              <dt>Cruzadas</dt>
              <dd>{p.stats.cruzadas}</dd>
            </div>
            <div>
              <dt>Melhor sequência</dt>
              <dd>{p.stats.bestStreak}</dd>
            </div>
          </dl>
          <Achievements stats={p.stats} onlyDone />
        </>
      )}
      <div className="overlay-actions">
        <button className="btn primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Dialog>
  );
}
