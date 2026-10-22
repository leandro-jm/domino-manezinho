import { audio, channel } from './sound';
import { useSettings } from './settings';

/**
 * Música de fundo da mesa. Toca os arquivos de src/assets/musica/ (em sequência, embaralhados);
 * sem nenhum arquivo, um violão dedilhado sintetizado na hora faz as vezes.
 * Os arquivos são decodificados inteiros (AudioBuffer): o laço não tem emenda e não depende de
 * toque do usuário pra começar, só do AudioContext já destravado pelos outros sons.
 */
const TRACKS = Object.values(
  import.meta.glob<string>('../assets/musica/*.{mp3,m4a,ogg,opus}', { eager: true, query: '?url', import: 'default' }),
);

const FILE_LEVEL = 0.2;
const SYNTH_LEVEL = 0.09;
/** Quanto a música abaixa enquanto alguém fala. */
const DUCK = 0.35;

let playing: { bus: GainNode; level: number; stop: () => void } | null = null;
/** Cada vez que a música começa ou para; serve para descartar um carregamento que chegou tarde. */
let generation = 0;

const decoded = new Map<string, Promise<AudioBuffer | null>>();

const decode = (c: AudioContext, url: string) => {
  let p = decoded.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    decoded.set(url, p);
  }
  return p;
};

const shuffled = <T>(xs: readonly T[]): T[] => [...xs].sort(() => Math.random() - 0.5);

/** Toca as faixas uma atrás da outra, recomeçando a lista no fim. Devolve null se nenhuma decodificou. */
const playFiles = async (c: AudioContext, bus: GainNode, gen: number) => {
  const buffers = (await Promise.all(shuffled(TRACKS).map((u) => decode(c, u)))).filter((b): b is AudioBuffer => !!b);
  if (gen !== generation || !buffers.length) return null;
  let current: AudioBufferSourceNode | null = null;
  let i = 0;
  const next = () => {
    const src = c.createBufferSource();
    src.buffer = buffers[i++ % buffers.length]!;
    src.loop = buffers.length === 1;
    src.connect(bus);
    src.onended = () => current === src && next();
    src.start();
    current = src;
  };
  next();
  return () => {
    const src = current;
    current = null;
    src?.stop();
  };
};

// --- Violão sintetizado (Karplus-Strong) -----------------------------------------------------

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Corda dedilhada: ruído filtrado circulando numa linha de atraso que vai perdendo energia. */
const pluck = (c: BaseAudioContext, midi: number, seconds = 2.4): AudioBuffer => {
  const sr = c.sampleRate;
  const buf = c.createBuffer(1, Math.floor(sr * seconds), sr);
  const out = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / midiHz(midi)));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  // Suaviza o ataque: corda de náilon, não de aço.
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < period; i++) ring[i] = (ring[i]! + ring[i - 1]!) / 2;
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const nxt = (idx + 1) % period;
    const v = ring[idx]!;
    out[i] = v;
    ring[idx] = 0.997 * 0.5 * (v + ring[nxt]!);
    idx = nxt;
  }
  return buf;
};

interface Chord {
  bass: number;
  alt: number;
  triad: [number, number, number];
}

const C: Chord = { bass: 48, alt: 55, triad: [60, 64, 67] };
const Am: Chord = { bass: 45, alt: 52, triad: [60, 64, 69] };
const Dm: Chord = { bass: 50, alt: 45, triad: [62, 65, 69] };
const Em: Chord = { bass: 40, alt: 47, triad: [59, 64, 67] };
const F: Chord = { bass: 41, alt: 48, triad: [60, 65, 69] };
const G7: Chord = { bass: 43, alt: 50, triad: [59, 62, 65] };

/** Um compasso por acorde, toada de fim de tarde na praça. */
const PROGRESSION = [C, Am, Dm, G7, C, Em, F, G7];
/** Dedilhado em colcheias: baixo, cordas de cima, baixo alternado. */
const PATTERN: ('bass' | 'alt' | 0 | 1 | 2)[] = ['bass', 0, 1, 2, 'alt', 1, 0, 1];
const EIGHTH = 60 / 80 / 2;

let strings: Map<number, AudioBuffer> | null = null;

const playSynth = (c: AudioContext, bus: GainNode) => {
  if (!strings) {
    strings = new Map();
    for (const ch of PROGRESSION) for (const m of [ch.bass, ch.alt, ...ch.triad]) if (!strings.has(m)) strings.set(m, pluck(c, m));
  }
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  tone.connect(bus);

  let step = 0;
  let at = c.currentTime + 0.1;
  const note = (midi: number, when: number, gain: number) => {
    const src = c.createBufferSource();
    src.buffer = strings!.get(midi)!;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(tone);
    src.start(when);
  };
  const tick = () => {
    // Aba em segundo plano atrasa o timer: em vez de despejar as notas atrasadas, retoma do agora.
    if (at < c.currentTime) at = c.currentTime + 0.05;
    while (at < c.currentTime + 0.6) {
      const chord = PROGRESSION[Math.floor(step / PATTERN.length) % PROGRESSION.length]!;
      const slot = PATTERN[step % PATTERN.length]!;
      const humanize = (Math.random() - 0.5) * 0.02;
      if (slot === 'bass' || slot === 'alt') note(chord[slot], at + humanize, 0.9);
      else if (Math.random() > 0.08) note(chord.triad[slot], at + humanize, 0.45 + Math.random() * 0.2);
      at += EIGHTH;
      step++;
    }
  };
  tick();
  const timer = setInterval(tick, 200);
  return () => {
    clearInterval(timer);
    tone.disconnect();
  };
};

export const music = {
  start() {
    // `sound` é o mudo geral (botão da mesa); `music` é a preferência só da música.
    const { sound, music: on } = useSettings.getState();
    if (playing || !sound || !on) return;
    const c = audio();
    if (!c) return;
    const gen = ++generation;
    const bus = c.createGain();
    bus.connect(channel(c, 'music'));
    const state = { bus, level: TRACKS.length ? FILE_LEVEL : SYNTH_LEVEL, stop: () => bus.disconnect() };
    bus.gain.value = state.level;
    playing = state;

    const fallback = () => {
      state.level = SYNTH_LEVEL;
      bus.gain.setValueAtTime(SYNTH_LEVEL, c.currentTime);
      const stop = playSynth(c, bus);
      state.stop = () => (stop(), bus.disconnect());
    };
    if (!TRACKS.length) return fallback();
    void playFiles(c, bus, gen).then((stop) => {
      if (gen !== generation) return;
      if (!stop) return fallback();
      state.stop = () => (stop(), bus.disconnect());
    });
  },

  stop() {
    generation++;
    playing?.stop();
    playing = null;
  },

  /** Abaixa a música por `seconds` (alguém falando) e depois volta devagar. */
  duck(seconds: number) {
    const c = audio();
    if (!playing || !c) return;
    const { bus, level } = playing;
    const t = c.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(level * DUCK, t, 0.05);
    bus.gain.setTargetAtTime(level, t + seconds, 0.4);
  },
};
