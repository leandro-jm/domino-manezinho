import { useSettings, type Channel } from './settings';

/**
 * Sons sintetizados na hora (Web Audio): sem arquivos para baixar e funciona offline.
 * Dá pra trocar por gravações reais da praça depois sem mexer em quem chama.
 */
let ctx: AudioContext | null = null;
let ambience: { stop: () => void } | null = null;

export const audio = (): AudioContext | null => {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // Sem gesto do usuário o Safari recusa (NotAllowedError): tenta de novo no próximo som.
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
};

export const noiseBuffer = (c: BaseAudioContext, seconds: number, brown = false): AudioBuffer => {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  return buf;
};

const buses = new Map<Channel, GainNode>();

/** Saída de um canal, com o volume escolhido nas configurações (mexer no volume vale na hora). */
export const channel = (c: AudioContext, name: Channel): GainNode => {
  let bus = buses.get(name);
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = useSettings.getState().volumes[name];
    bus.connect(c.destination);
    buses.set(name, bus);
  }
  return bus;
};

useSettings.subscribe((s) => {
  for (const [name, bus] of buses) bus.gain.value = s.volumes[name];
});

const knock = (c: AudioContext, at: number, freq: number, gain: number) => {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, at + 0.08);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
  osc.connect(g).connect(channel(c, 'effects'));
  osc.start(at);
  osc.stop(at + 0.13);
};

const enabled = () => useSettings.getState().sound;

export const sound = {
  /** Clack da pedra batendo na mesa de concreto. `strong` para a batida final. */
  clack(strong = false) {
    const c = enabled() ? audio() : null;
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.06);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400 + Math.random() * 600;
    band.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(strong ? 1.4 : 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(band).connect(g).connect(channel(c, 'effects'));
    src.start(t);
    knock(c, t, strong ? 140 : 190, strong ? 0.9 : 0.35);
  },

  /** Toc-toc na mesa: passei. */
  pass() {
    const c = enabled() ? audio() : null;
    if (!c) return;
    const t = c.currentTime;
    knock(c, t, 120, 0.7);
    knock(c, t + 0.16, 120, 0.7);
  },

  turn() {
    const c = enabled() ? audio() : null;
    if (!c) return;
    const t = c.currentTime;
    [660, 880].forEach((f, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.1 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.25);
      osc.connect(g).connect(channel(c, 'effects'));
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.3);
    });
  },

  fanfare(won: boolean) {
    const c = enabled() ? audio() : null;
    if (!c) return;
    const t = c.currentTime;
    const notes = won ? [523, 659, 784, 1046] : [392, 349, 311, 262];
    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.4);
      osc.connect(g).connect(channel(c, 'effects'));
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.45);
    });
  },

  /** Ambiente da praça: burburinho distante e passarinhos da figueira. */
  startAmbience() {
    const { sound: on, ambience: ambienceOn } = useSettings.getState();
    if (ambience || !on || !ambienceOn) return;
    const c = audio();
    if (!c) return;
    const master = c.createGain();
    master.gain.value = 0.06;
    master.connect(channel(c, 'ambience'));

    const crowd = c.createBufferSource();
    crowd.buffer = noiseBuffer(c, 4, true);
    crowd.loop = true;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 500;
    crowd.connect(low).connect(master);
    crowd.start();

    const chirp = () => {
      const t = c.currentTime;
      const base = 2500 + Math.random() * 2000;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const osc = c.createOscillator();
        const g = c.createGain();
        const at = t + i * 0.12;
        osc.frequency.setValueAtTime(base, at);
        osc.frequency.exponentialRampToValueAtTime(base * 1.4, at + 0.07);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        osc.connect(g).connect(master);
        osc.start(at);
        osc.stop(at + 0.1);
      }
    };
    const timer = setInterval(() => Math.random() < 0.5 && chirp(), 2500);
    ambience = {
      stop: () => {
        clearInterval(timer);
        crowd.stop();
        master.disconnect();
      },
    };
  },

  stopAmbience() {
    ambience?.stop();
    ambience = null;
  },
};

export const vibrate = (ms: number | number[]) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // sem vibração
  }
};
