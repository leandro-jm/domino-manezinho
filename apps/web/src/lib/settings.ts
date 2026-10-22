import { create } from 'zustand';
import { load, save } from './storage';

/** '2d' troca a cena 3D pela mesa vista de cima em SVG (aparelho muito fraco). */
export type Quality = 'auto' | '2d' | 'baixa' | 'media' | 'alta';

/** Canais de som com volume próprio. */
export type Channel = 'effects' | 'ambience' | 'music' | 'voices';

export interface Settings {
  quality: Quality;
  /** Volume de cada canal, de 0 a 1 (o liga/desliga de cada um continua nos booleanos). */
  volumes: Record<Channel, number>;
  sound: boolean;
  ambience: boolean;
  music: boolean;
  voices: boolean;
  largeTiles: boolean;
  highContrast: boolean;
  topView: boolean;
  /** Jogadores silenciados neste aparelho: as frases deles não aparecem nem falam. */
  muted: string[];
}

const DEFAULTS: Settings = {
  quality: 'auto',
  volumes: { effects: 1, ambience: 1, music: 1, voices: 1 },
  sound: true,
  ambience: true,
  music: true,
  voices: true,
  largeTiles: false,
  highContrast: false,
  topView: false,
  muted: [],
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

const saved = load<Partial<Settings>>('dm:settings', {});

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  ...saved,
  // Configuração salva antes dos volumes existirem (ou com canal faltando) fica com o padrão.
  volumes: { ...DEFAULTS.volumes, ...saved.volumes },
  set: (patch) => {
    set(patch);
    const { set: _, ...rest } = { ...get(), ...patch };
    save('dm:settings', rest);
  },
}));

/** Qualidade efetiva: no automático, chuta pelo aparelho. */
export const resolveQuality = (q: Quality): Exclude<Quality, 'auto' | '2d'> => {
  if (q === '2d') return 'baixa';
  if (q !== 'auto') return q;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = matchMedia('(pointer: coarse)').matches;
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  if (cores <= 4 || memory <= 2) return 'baixa';
  return mobile ? 'media' : 'alta';
};

export const hasWebGL = (() => {
  let cached: boolean | null = null;
  return () => {
    if (cached === null) {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') ?? c.getContext('webgl');
        cached = !!gl;
        // Solta o contexto de teste: o navegador limita quantos contextos WebGL vivem ao mesmo tempo.
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        cached = false;
      }
    }
    return cached;
  };
})();
