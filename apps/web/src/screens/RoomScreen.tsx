import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useShallow } from 'zustand/react/shallow';
import type { Seat } from '@domino/engine';
import { BOT_LEVEL_IDS, BOT_LEVELS, type BotLevel, type PublicPlayer, type RoomSnapshot } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { useOnline } from '../store/online';
import { useProfile } from '../store/profile';
import { GameScreen } from './GameScreen';
import { RoomSettingsForm } from './LobbyScreen';

const SEAT_ORDER: Seat[] = [0, 1, 2, 3];

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.ceil((until - now) / 1000))}s</>;
}

function InviteFriends({ code }: { code: string }) {
  const [friends, setFriends] = useState<PublicPlayer[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.friends().then(setFriends).catch(() => undefined);
  }, []);
  if (!friends.length) return null;
  return (
    <div className="friends">
      <h3>Chamar quem já jogou contigo</h3>
      <ul>
        {friends.slice(0, 8).map((f) => (
          <li key={f.id}>
            <Avatar id={f.avatarId} size={32} />
            <span className="grow">{f.nickname}</span>
            <button
              className="btn small"
              disabled={sent.has(f.id)}
              onClick={() =>
                void api
                  .invite(code, f.id)
                  .then(() => setSent((prev) => new Set(prev).add(f.id)))
                  .catch(() => undefined)
              }
            >
              {sent.has(f.id) ? 'Chamado!' : 'Chamar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WaitingRoom({ room }: { room: RoomSnapshot }) {
  const me = useProfile((s) => s.profile?.id);
  const { sit, setBot, start, updateSettings } = useOnline(useShallow((s) => ({ sit: s.sit, setBot: s.setBot, start: s.start, updateSettings: s.updateSettings })));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwner = room.ownerId === me;
  const mySeat = room.seats.findIndex((s) => s?.kind === 'human' && s.player.id === me);
  const full = room.seats.every(Boolean);
  const link = `${location.origin}/sala/${room.code}`;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const share = async () => {
    const text = `Bora um dominó na Praça XV? Entra na minha mesa: ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Dominó Manezinho', text, url: link });
      else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        setCopied(true);
      }
    } catch {
      // compartilhamento cancelado
    }
  };

  const fillWithBots = async (level: BotLevel) => {
    for (const seat of SEAT_ORDER) if (!room.seats[seat]) await setBot(seat, level);
  };

  return (
    <main className="screen">
      <ScreenHeader title={`Mesa ${room.code}`} />
      {error && <p className="error">{error}</p>}

      {room.quick && room.fillAt && !full && (
        <p className="banner">
          Esperando o pessoal… em <Countdown until={room.fillAt} /> os bots completam a mesa.
        </p>
      )}

      <section className="card waiting-table" aria-label="Cadeiras">
        {SEAT_ORDER.map((seat) => {
          const occ = room.seats[seat];
          const team = seat % 2 === 0 ? 'Dupla A' : 'Dupla B';
          return (
            <div key={seat} className={`waiting-seat seat-${seat} ${seat === mySeat ? 'is-me' : ''}`}>
              <small className="team">{team}</small>
              {occ ? (
                <>
                  <Avatar id={occ.kind === 'human' ? occ.player.avatarId : occ.avatarId} size={52} />
                  <strong>{occ.kind === 'human' ? occ.player.nickname : occ.nickname}</strong>
                  <small>
                    {occ.kind === 'bot' ? `bot ${BOT_LEVELS[occ.level].label}` : occ.player.id === room.ownerId ? 'dono da mesa' : occ.connected ? 'na mesa' : 'caiu…'}
                  </small>
                  {occ.kind === 'bot' && isOwner && (
                    <button className="btn small" onClick={() => void run(() => setBot(seat, null))}>
                      Tirar bot
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="empty-seat">?</div>
                  <strong>Cadeira vazia</strong>
                  <div className="seat-actions">
                    <button className="btn small" onClick={() => void run(() => sit(seat))}>
                      Sentar aqui
                    </button>
                    {isOwner && (
                      <>
                        {BOT_LEVEL_IDS.map((level) => (
                          <button key={level} className="btn small" onClick={() => void run(() => setBot(seat, level))}>
                            + {BOT_LEVELS[level].short}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="waiting-felt" aria-hidden="true">
          Parceiros sentam frente a frente
        </div>
      </section>

      <section className="card">
        <button className="btn primary block" onClick={() => void share()}>
          📣 Chamar a turma
        </button>
        <p className="muted center">
          Código <strong className="code">{room.code}</strong> {copied && '· link copiado!'}
        </p>
        <InviteFriends code={room.code} />
      </section>

      {isOwner ? (
        <section className="card">
          <h2 className="section-title">Regras da mesa</h2>
          <RoomSettingsForm value={room.settings} onChange={(s) => void run(() => updateSettings(s))} />
          <div className="row-actions">
            {!full && (
              <button className="btn" onClick={() => void run(() => fillWithBots('amador'))}>
                Completar com bots
              </button>
            )}
            <button className="btn primary" disabled={!full} onClick={() => void run(start)}>
              {full ? (room.status === 'finished' ? 'Começar outra partida' : 'Começar partida') : 'Faltam cadeiras'}
            </button>
          </div>
        </section>
      ) : (
        <p className="muted center">Esperando o dono da mesa começar…</p>
      )}
    </main>
  );
}

/** Telas de mesa montadas agora (ver o efeito de saída no RoomScreen). */
let mountedRoomScreens = 0;

export function RoomScreen({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const token = useProfile((s) => s.token);
  const { connect, joinRoom, room, closedReason, connected } = useOnline(useShallow((s) => ({ connect: s.connect, joinRoom: s.joinRoom, room: s.room, closedReason: s.closedReason, connected: s.connected })));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!connect() || !connected) return;
    joinRoom(code).catch((err: Error) => setError(err.message));
  }, [code, connect, joinRoom, connected]);

  // Saiu da tela da mesa (voltar, outro link): larga a cadeira, senão ela fica presa e os eventos da mesa
  // continuam chegando. Efeito à parte para não sair a cada queda de conexão.
  useEffect(() => {
    mountedRoomScreens++;
    return () => {
      mountedRoomScreens--;
      // Espera um tick: o StrictMode desmonta e remonta na hora, e trocar de mesa (/sala/A → /sala/B) remonta
      // também. Só larga a cadeira se nenhuma tela de mesa ficou de pé (entrar noutra mesa já sai desta no servidor).
      setTimeout(() => {
        if (!mountedRoomScreens) useOnline.getState().leaveRoom();
      }, 0);
    };
  }, [code]);

  if (!token) {
    return (
      <main className="screen">
        <ScreenHeader title="Mesa" />
        <p className="card">Sem conexão com a praça agora. Tenta de novo daqui a pouco.</p>
      </main>
    );
  }

  if (closedReason || error) {
    return (
      <main className="screen">
        <ScreenHeader title={`Mesa ${code}`} />
        <div className="card">
          <p>{closedReason ?? error}</p>
          <Link href="/salas" className="btn primary">
            Ver outras mesas
          </Link>
        </div>
      </main>
    );
  }

  if (!room || room.code !== code) return <div className="center-screen">Puxando a cadeira…</div>;
  // Fim de partida com cadeira vazia (alguém caiu e não voltou): volta pra arrumação da mesa.
  if (room.status === 'waiting' || (room.status === 'finished' && room.seats.some((s) => !s))) return <WaitingRoom room={room} />;
  return <GameScreen onExit={() => navigate('/')} turnSeconds={room.settings.turnSeconds} />;
}
