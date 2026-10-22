import { useSettings, type Channel, type Quality, type Settings } from '../lib/settings';

type SoundToggle = 'sound' | 'ambience' | 'music' | 'voices';

/** Liga/desliga de cada som com o volume do canal dele (o volume só vale com o som ligado). */
const SOUNDS: { key: SoundToggle; channel: Channel; label: string }[] = [
  { key: 'sound', channel: 'effects', label: 'Sons das pedras' },
  { key: 'ambience', channel: 'ambience', label: 'Som ambiente da praça' },
  { key: 'music', channel: 'music', label: 'Música de fundo' },
  { key: 'voices', channel: 'voices', label: 'Vozes dos jogadores (sintéticas, geradas por IA)' },
];

const VIEW: { key: keyof Pick<Settings, 'largeTiles' | 'highContrast' | 'topView'>; label: string }[] = [
  { key: 'largeTiles', label: 'Pedras grandes na mão' },
  { key: 'highContrast', label: 'Alto contraste' },
  { key: 'topView', label: 'Mesa vista de cima' },
];

/** Cenário, sons e acessibilidade: no Perfil e na engrenagem da mesa. */
export function SettingsForm() {
  const settings = useSettings();
  // "Sons das pedras" é também o mudo geral: desligado, nenhum outro som toca.
  const muted = !settings.sound;
  return (
    <>
      <label className="field">
        <span>Qualidade do cenário</span>
        <select value={settings.quality} onChange={(e) => settings.set({ quality: e.target.value as Quality })}>
          <option value="auto">Automática</option>
          <option value="2d">Mesa 2D (sem 3D, pra aparelho bem fraco)</option>
          <option value="baixa">Baixa (celular simples, economiza bateria)</option>
          <option value="media">Média</option>
          <option value="alta">Alta (sombras e pombos)</option>
        </select>
      </label>
      {SOUNDS.map(({ key, channel, label }) => {
        const on = settings[key] && (key === 'sound' || !muted);
        return (
          <div key={key} className="sound-row">
            <label className="toggle">
              <input type="checkbox" checked={settings[key]} onChange={(e) => settings.set({ [key]: e.target.checked })} />
              {label}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.volumes[channel] * 100)}
              disabled={!on}
              aria-label={`Volume: ${label}`}
              onChange={(e) => settings.set({ volumes: { ...settings.volumes, [channel]: Number(e.target.value) / 100 } })}
            />
          </div>
        );
      })}
      {VIEW.map(({ key, label }) => (
        <label key={key} className="toggle">
          <input type="checkbox" checked={settings[key]} onChange={(e) => settings.set({ [key]: e.target.checked })} />
          {label}
        </label>
      ))}
    </>
  );
}
