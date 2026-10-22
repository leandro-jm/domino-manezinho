import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_ROOM_SETTINGS, type LobbyRoom, type RoomSettings, type TurnSeconds } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { useOnline } from '../store/online';
import { useProfile } from '../store/profile';
import { MATCH_PRESETS } from './PracticeScreens';

export function RoomSettingsForm({ value, onChange }: { value: RoomSettings; onChange: (s: RoomSettings) => void }) {
  const preset = MATCH_PRESETS.find((p) => p.config.scoring === value.config.scoring && p.config.targetScore === value.config.targetScore)?.id ?? 'b6';
  return (
    <div className="settings-form">
      <label className="field">
        <span>Quem pode entrar</span>
        <select value={value.visibility} onChange={(e) => onChange({ ...value, visibility: e.target.value as RoomSettings['visibility'] })}>
          <option value="private">Só quem tiver o código/link</option>
          <option value="public">Mesa aberta (aparece na lista)</option>
        </select>
      </label>
      <label className="field">
        <span>Partida</span>
        <select
          value={preset}
          onChange={(e) => {
            const p = MATCH_PRESETS.find((x) => x.id === e.target.value)!;
            onChange({ ...value, config: { ...p.config, galo: value.config.galo } });
          }}
        >
          {MATCH_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tempo por jogada</span>
        <select value={value.turnSeconds} onChange={(e) => onChange({ ...value, turnSeconds: Number(e.target.value) as TurnSeconds })}>
          <option value={15}>15 segundos (ligeiro)</option>
          <option value={30}>30 segundos</option>
          <option value={60}>60 segundos (com calma)</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={value.config.galo} onChange={(e) => onChange({ ...value, config: { ...value.config, galo: e.target.checked } })} />
        Valer "galo"
      </label>
    </div>
  );
}

export function LobbyScreen() {
  const [, navigate] = useLocation();
  const token = useProfile((s) => s.token);
  const { connect, listRooms, createRoom, connected } = useOnline(useShallow((s) => ({ connect: s.connect, listRooms: s.listRooms, createRoom: s.createRoom, connected: s.connected })));
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connect()) return;
    const refresh = () => void listRooms().then(setRooms).catch(() => undefined);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [connect, listRooms, connected]);

  if (!token) {
    return (
      <main className="screen">
        <ScreenHeader title="Jogar com a turma" />
        <p className="card">Pra jogar online, teu perfil precisa estar registrado na praça. Confere tua conexão e volta pro início.</p>
      </main>
    );
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      navigate(`/sala/${await createRoom(settings)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <ScreenHeader title="Jogar com a turma" />
      {error && <p className="error">{error}</p>}

      <form
        className="card row-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4) navigate(`/sala/${code.trim().toUpperCase()}`);
        }}
      >
        <label className="field grow">
          <span>Entrar com código</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="ABCDE" autoCapitalize="characters" />
        </label>
        <button className="btn primary">Entrar</button>
      </form>

      <section className="card">
        <h2 className="section-title">Montar minha mesa</h2>
        <RoomSettingsForm value={settings} onChange={setSettings} />
        <button className="btn primary block" onClick={create} disabled={busy || !connected}>
          {connected ? 'Criar sala' : 'Conectando…'}
        </button>
      </section>

      <section className="card">
        <h2 className="section-title">Mesas abertas</h2>
        {rooms.length === 0 ? (
          <p className="muted">Nenhuma mesa aberta agora. Cria a tua e chama a turma!</p>
        ) : (
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.code}>
                <Avatar id={r.ownerAvatarId} size={40} />
                <div className="grow">
                  <strong>Mesa do {r.ownerNickname}</strong>
                  <small>
                    {r.humans} {r.humans === 1 ? 'pessoa' : 'pessoas'} · {r.freeSeats} {r.freeSeats === 1 ? 'cadeira livre' : 'cadeiras livres'} ·{' '}
                    {r.settings.config.scoring === 'batida' ? `batida até ${r.settings.config.targetScore}` : `pontos até ${r.settings.config.targetScore}`}
                  </small>
                </div>
                <button className="btn primary" onClick={() => navigate(`/sala/${r.code}`)}>
                  Sentar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
