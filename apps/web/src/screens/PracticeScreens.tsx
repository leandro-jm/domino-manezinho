import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { BOT_LEVEL_IDS, BOT_LEVELS, type BotLevel } from '@domino/shared';
import type { MatchConfig } from '@domino/engine';
import { ScreenHeader } from '../components/ScreenHeader';
import { startOfflineGame, stopOfflineGame } from '../offline/controller';
import { load, save } from '../lib/storage';
import { useTable } from '../store/table';
import { GameScreen } from './GameScreen';

export const MATCH_PRESETS: { id: string; label: string; config: MatchConfig }[] = [
  { id: 'b6', label: 'Batida até 6 (clássico da praça)', config: { scoring: 'batida', targetScore: 6, galo: false } },
  { id: 'b10', label: 'Batida até 10', config: { scoring: 'batida', targetScore: 10, galo: false } },
  { id: 'p100', label: 'Contando pontos até 100', config: { scoring: 'pontos', targetScore: 100, galo: false } },
];

function LevelChoice({ label, value, onChange }: { label: string; value: BotLevel; onChange: (l: BotLevel) => void }) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      {BOT_LEVEL_IDS.map((level) => (
        <label key={level} className={`choice-option ${value === level ? 'is-selected' : ''}`}>
          <input type="radio" checked={value === level} onChange={() => onChange(level)} />
          <strong>{BOT_LEVELS[level].label}</strong>
          <small>{BOT_LEVELS[level].description}</small>
        </label>
      ))}
    </fieldset>
  );
}

export function PracticeSetupScreen() {
  const [, navigate] = useLocation();
  const defaults = { opponents: 'amador' as BotLevel, partner: 'amador' as BotLevel, preset: 'b6', galo: false };
  // Valor salvo pode ser null ou de outra versão: completa com o padrão.
  const last = { ...defaults, ...(load<Partial<typeof defaults> | null>('dm:practice-setup', null) ?? {}) };
  const [opponents, setOpponents] = useState<BotLevel>(last.opponents);
  const [partner, setPartner] = useState<BotLevel>(last.partner);
  const [preset, setPreset] = useState(last.preset);
  const [galo, setGalo] = useState(last.galo);

  const start = () => {
    save('dm:practice-setup', { opponents, partner, preset, galo });
    const config = { ...(MATCH_PRESETS.find((p) => p.id === preset) ?? MATCH_PRESETS[0]!).config, galo };
    startOfflineGame({ opponents, partner, config });
    navigate('/treino/jogo');
  };

  return (
    <main className="screen">
      <ScreenHeader title="Treino contra bots" />
      <div className="card">
        <LevelChoice label="Adversários" value={opponents} onChange={setOpponents} />
        <LevelChoice label="Teu parceiro" value={partner} onChange={setPartner} />
        <fieldset className="choice">
          <legend>Partida</legend>
          {MATCH_PRESETS.map((p) => (
            <label key={p.id} className={`choice-option ${preset === p.id ? 'is-selected' : ''}`}>
              <input type="radio" checked={preset === p.id} onChange={() => setPreset(p.id)} />
              <strong>{p.label}</strong>
            </label>
          ))}
          <label className="toggle">
            <input type="checkbox" checked={galo} onChange={(e) => setGalo(e.target.checked)} />
            Valer "galo" (passe do adversário logo depois da tua jogada dá ponto)
          </label>
        </fieldset>
        <button className="btn primary block" onClick={start}>
          Bora!
        </button>
      </div>
    </main>
  );
}

export function PracticeGameScreen() {
  const [, navigate] = useLocation();
  const mode = useTable((s) => s.mode);

  useEffect(() => {
    // Recarregou a página no meio do treino: retoma a partida salva.
    if (useTable.getState().mode !== 'offline' && !startOfflineGame('resume')) navigate('/treino', { replace: true });
    return () => {
      stopOfflineGame();
      useTable.getState().reset();
    };
  }, [navigate]);

  if (mode !== 'offline') return null;
  return <GameScreen onExit={() => navigate('/')} />;
}
