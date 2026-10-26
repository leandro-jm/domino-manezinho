import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { INITIAL_RATING, rankTitle } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { SobreProjetoBotao } from '../components/SobreProjetoBotao';
import { savedOfflineGame, startOfflineGame } from '../offline/controller';
import { useInstall } from '../lib/install';
import { isIOS, isStandalone } from '../lib/push';
import { useOnline } from '../store/online';
import { useIdentity, useProfile } from '../store/profile';

export function HomeScreen() {
  const identity = useIdentity();
  const profile = useProfile((s) => s.profile);
  const token = useProfile((s) => s.token);
  const online = useProfile((s) => s.online);
  const install = useInstall();
  const quickPlay = useOnline((s) => s.quickPlay);
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const saved = savedOfflineGame();
  const rating = profile?.rating ?? INITIAL_RATING;

  const quick = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await quickPlay();
      navigate(`/sala/${code}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canOnline = !!token && online;

  return (
    <main className="screen home">
      <section className="home-hero">
        <div className="home-title">
          <p className="kicker">Praça XV de Novembro · Floripa</p>
          <h1>Dominó Manezinho</h1>
        </div>
        <Link href="/perfil" className="me-card">
          <Avatar id={identity.avatarId} size={56} />
          <div>
            <strong>
              {identity.nickname}
              {identity.tag && <span className="tag">#{identity.tag}</span>}
            </strong>
            <span>
              {rankTitle(rating)} · {rating} pts
            </span>
          </div>
        </Link>
      </section>

      {!online && <p className="banner">Sem conexão com a praça — dá pra treinar contra os bots offline.</p>}
      {error && <p className="error">{error}</p>}

      <section className="home-actions">
        <button className="action-card primary" onClick={quick} disabled={!canOnline || busy}>
          <span className="action-icon">⚡</span>
          <strong>{busy ? 'Procurando mesa…' : 'Jogo rápido'}</strong>
          <small>Senta numa mesa aberta; se faltar gente, os bots completam.</small>
        </button>
        <Link href="/salas" className={`action-card ${canOnline ? '' : 'is-disabled'}`} aria-disabled={!canOnline}>
          <span className="action-icon">🪑</span>
          <strong>Jogar com a turma</strong>
          <small>Monta tua sala e chama os amigos, ou entra numa mesa aberta.</small>
        </Link>
        <Link href="/treino" className="action-card">
          <span className="action-icon">🤖</span>
          <strong>Treinar contra bots</strong>
          <small>Do Amador ao "É um monstro". Funciona até sem internet.</small>
        </Link>
        {saved && (
          <button
            className="action-card"
            onClick={() => {
              startOfflineGame('resume');
              navigate('/treino/jogo');
            }}
          >
            <span className="action-icon">↻</span>
            <strong>Continuar treino</strong>
            <small>
              Mão {saved.match.hand.number} · nós {saved.match.scores[0]} × {saved.match.scores[1]} eles
            </small>
          </button>
        )}
      </section>

      <nav className="home-links">
        <Link href="/ranking" className="btn">
          🏆 Ranking
        </Link>
        <Link href="/perfil" className="btn">
          👤 Perfil
        </Link>
        <Link href="/como-jogar" className="btn">
          📖 Como se joga
        </Link>
        <SobreProjetoBotao />
        {install.prompt && (
          <button className="btn" onClick={() => void install.install()}>
            📲 Instalar app
          </button>
        )}
        {!install.prompt && isIOS() && !isStandalone() && (
          <button className="btn" onClick={() => setIosHelp(!iosHelp)}>
            📲 Instalar no iPhone
          </button>
        )}
      </nav>
      {iosHelp && (
        <p className="card">
          No Safari, toca em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Assim o
          dominó abre em tela cheia e consegue te avisar quando for tua vez.
        </p>
      )}
    </main>
  );
}
