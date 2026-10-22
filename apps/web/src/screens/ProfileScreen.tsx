import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { INITIAL_RATING, PUSH_KINDS, avatarById, rankTitle, validateNickname, type PushKind, type TransferCode } from '@domino/shared';
import { Achievements } from '../components/Achievements';
import { AvatarPicker } from '../components/AvatarPicker';
import { SettingsForm } from '../components/SettingsForm';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { currentSubscription, disablePush, enablePush, pushNeedsInstall, pushSupported } from '../lib/push';
import { useIdentity, useProfile } from '../store/profile';

function Notifications() {
  const token = useProfile((s) => s.token);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void currentSubscription().then((s) => setOn(!!s));
  }, []);
  if (!pushSupported()) return <p className="muted">Esse navegador não suporta notificações.</p>;
  return (
    <div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={!token}
          onChange={async (e) => {
            setMsg(null);
            if (e.target.checked) {
              const err = await enablePush().catch((x: Error) => x.message);
              if (err) setMsg(err);
              else setOn(true);
            } else {
              await disablePush().catch((x: Error) => setMsg(x.message));
              setOn(false);
            }
          }}
        />
        Receber notificações neste aparelho
      </label>
      {on && <PushKinds />}
      {pushNeedsInstall() && <p className="muted">No iPhone, as notificações só funcionam com o app instalado na tela de início.</p>}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

const PUSH_LABELS: Record<PushKind, string> = {
  turn: 'Quando for minha vez',
  invite: 'Quando me chamarem pra uma mesa',
  full: 'Quando a mesa encher e a partida começar',
};

/** Quais avisos chegam (valem pra todos os aparelhos do jogador). */
function PushKinds() {
  const prefs = useProfile((s) => s.profile?.pushPrefs);
  const update = useProfile((s) => s.update);
  const [msg, setMsg] = useState<string | null>(null);
  if (!prefs) return null;
  return (
    <div className="push-kinds">
      {PUSH_KINDS.map((kind) => (
        <label key={kind} className="toggle">
          <input
            type="checkbox"
            checked={prefs[kind]}
            onChange={(e) => {
              setMsg(null);
              update({ pushPrefs: { [kind]: e.target.checked } }).catch((err: Error) => setMsg(err.message));
            }}
          />
          {PUSH_LABELS[kind]}
        </label>
      ))}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

/** Baixar tudo o que a Praça guarda sobre o jogador, ou apagar a conta (LGPD). */
function MyData() {
  const nickname = useProfile((s) => s.profile?.nickname ?? '');
  const deleteAccount = useProfile((s) => s.deleteAccount);
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const download = async () => {
    setMsg(null);
    try {
      const data = await api.exportMe();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'domino-manezinho-meus-dados.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div>
      <div className="row-actions">
        <button className="btn" onClick={() => void download()}>
          Baixar meus dados
        </button>
        {!confirming && (
          <button className="btn danger" onClick={() => setConfirming(true)}>
            Apagar minha conta
          </button>
        )}
      </div>
      {confirming && (
        <form
          className="danger-zone"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            deleteAccount()
              .then(() => navigate('/bem-vindo'))
              .catch((err: Error) => setMsg(err.message));
          }}
        >
          <p>
            Isso apaga teu apelido, rating, estatísticas e notificações. Nas partidas dos outros tu aparece como "jogador que saiu". Não dá
            pra desfazer.
          </p>
          <label className="field">
            <span>Pra confirmar, escreve teu apelido ({nickname})</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Deixa quieto
            </button>
            <button className="btn danger" disabled={typed.trim() !== nickname}>
              Apagar pra sempre
            </button>
          </div>
        </form>
      )}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

function Transfer() {
  const [code, setCode] = useState<TransferCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn"
        onClick={() =>
          api
            .transferCode()
            .then(setCode)
            .catch((e: Error) => setError(e.message))
        }
      >
        Levar perfil pra outro aparelho
      </button>
      {code && (
        <p>
          No outro aparelho, escolhe "Já jogo em outro aparelho" e digita <strong className="code">{code.code}</strong> (vale até{' '}
          {new Date(code.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function ProfileScreen() {
  const { profile, update, token } = useProfile();
  const identity = useIdentity();
  const [nickname, setNickname] = useState(identity.nickname);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stats = profile?.stats;
  // Só vitória online desbloqueia personagem (o servidor confere do mesmo jeito).
  const wins = stats?.wins ?? 0;
  const rating = profile?.rating ?? INITIAL_RATING;

  const save = async (body: { nickname?: string; avatarId?: string }) => {
    setMsg(null);
    try {
      await update(body);
      setMsg({ ok: true, text: 'Salvo!' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <main className="screen">
      <ScreenHeader title="Perfil" />

      <section className="card">
        <h2 className="section-title">
          {identity.nickname}
          {identity.tag && <span className="tag">#{identity.tag}</span>}
        </h2>
        <p className="muted">
          {rankTitle(rating)} · {rating} pts · {avatarById(identity.avatarId).name}
        </p>
        {stats && (
          <dl className="stats">
            <div>
              <dt>Partidas online</dt>
              <dd>
                {stats.wins}/{stats.games}
              </dd>
            </div>
            <div>
              <dt>Treino</dt>
              <dd>
                {stats.practiceWins}/{stats.practiceGames}
              </dd>
            </div>
            <div>
              <dt>Carroças</dt>
              <dd>{stats.carrocas}</dd>
            </div>
            <div>
              <dt>Lá-e-lós</dt>
              <dd>{stats.laelos}</dd>
            </div>
            <div>
              <dt>Cruzadas</dt>
              <dd>{stats.cruzadas}</dd>
            </div>
            <div>
              <dt>Melhor sequência</dt>
              <dd>{stats.bestStreak}</dd>
            </div>
          </dl>
        )}
        {stats && (
          <>
            <h3>Medalhas</h3>
            <Achievements stats={stats} />
          </>
        )}
        <Link href="/partidas" className="btn block">
          Minhas partidas e replays
        </Link>
      </section>

      <section className="card">
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
            const check = validateNickname(nickname);
            if (!check.ok) setMsg({ ok: false, text: check.error });
            else void save({ nickname: check.nickname });
          }}
        >
          <label className="field grow">
            <span>Apelido</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </label>
          <button className="btn primary">Salvar</button>
        </form>
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        <h3>Personagem</h3>
        <AvatarPicker value={identity.avatarId} onChange={(avatarId) => void save({ avatarId })} wins={wins} />
      </section>

      <section className="card">
        <h2 className="section-title">Notificações</h2>
        <Notifications />
      </section>

      <section className="card">
        <h2 className="section-title">Mesa e acessibilidade</h2>
        <SettingsForm />
      </section>

      {token && (
        <section className="card">
          <h2 className="section-title">Outro aparelho</h2>
          <Transfer />
        </section>
      )}

      {token && (
        <section className="card">
          <h2 className="section-title">Teus dados</h2>
          <MyData />
        </section>
      )}
    </main>
  );
}
