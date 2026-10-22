import { avatarById, type AvatarVoice } from '@domino/shared';
import { music } from './music';
import { audio, channel, noiseBuffer } from './sound';
import { useSettings } from './settings';

/**
 * Vozes dos jogadores nas frases do chat rápido. Se existir gravação em
 * src/assets/falas/{avatarId}/{emoteId}.mp3, toca ela; senão o personagem "fala" num blablablá
 * sintetizado no tom dele, uma sílaba por vogal da frase (estilo Animal Crossing).
 */
const RECORDINGS = new Map(
  Object.entries(
    import.meta.glob<string>('../assets/falas/*/*.{mp3,m4a,ogg,opus,wav}', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.replace(/^.*\/falas\//, '').replace(/\.[^.]+$/, ''), url]),
);

const decoded = new Map<string, Promise<AudioBuffer | null>>();

const loadRecording = (avatarId: string, emoteId: string): Promise<AudioBuffer | null> => {
  const url = RECORDINGS.get(`${avatarId}/${emoteId}`);
  const c = url ? audio() : null;
  if (!url || !c) return Promise.resolve(null);
  let p = decoded.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    decoded.set(url, p);
  }
  return p;
};

type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

/** Formantes F1/F2 (Hz) de cada vogal, voz adulta média. */
const FORMANTS: Record<Vowel, [number, number]> = {
  a: [800, 1250],
  e: [480, 1900],
  i: [300, 2300],
  o: [500, 900],
  u: [330, 800],
};

/** Ditongo vira a vogal mais aberta: "queres" → e, e; "ou" → o. */
const OPENNESS: Record<Vowel, number> = { a: 0, e: 1, o: 1, i: 2, u: 2 };

/** Uma sílaba por grupo de vogais, guardando a vogal que manda no som. */
export const syllablesOf = (text: string): Vowel[] => {
  const groups = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[aeiou]+/g) ?? [];
  const vowels = groups.map((g) => [...g].sort((x, y) => OPENNESS[x as Vowel] - OPENNESS[y as Vowel])[0] as Vowel);
  return vowels.length ? vowels : ['a'];
};

/** Quanto tempo o blablablá dura, em segundos (a última sílaba arrasta um pouco). */
export const babbleDuration = (text: string, voice: AvatarVoice): number => (syllablesOf(text).length + 0.5) / voice.rate;

const babble = (c: AudioContext, out: AudioNode, text: string, voice: AvatarVoice): number => {
  const vowels = syllablesOf(text);
  const question = text.trim().endsWith('?');
  const exclaim = text.includes('!');
  const syl = 1 / voice.rate;
  const t0 = c.currentTime + 0.02;
  const total = babbleDuration(text, voice);

  // Fonte rica em harmônicos (dente de serra) passando por dois filtros de formante: soa como vogal.
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = voice.pitch;
  const f1 = c.createBiquadFilter();
  const f2 = c.createBiquadFilter();
  const body = c.createBiquadFilter();
  const [first1, first2] = FORMANTS[vowels[0]!];
  for (const [f, q, hz] of [
    [f1, 6, first1],
    [f2, 9, first2],
  ] as const) {
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.value = hz * voice.formant;
  }
  body.type = 'lowpass';
  body.frequency.value = 900 * voice.formant;
  const g1 = c.createGain();
  const g2 = c.createGain();
  const gBody = c.createGain();
  g1.gain.value = 1;
  g2.gain.value = 0.7;
  gBody.gain.value = 0.25;
  const env = c.createGain();
  env.gain.value = 0.0001;
  osc.connect(f1).connect(g1).connect(env);
  osc.connect(f2).connect(g2).connect(env);
  osc.connect(body).connect(gBody).connect(env);
  env.connect(out);

  const peak = exclaim ? 0.75 : 0.6;
  vowels.forEach((v, i) => {
    const last = i === vowels.length - 1;
    const at = t0 + i * syl;
    const len = syl * (last ? 1.5 : 0.75 + Math.random() * 0.2);
    // Entonação: vai caindo ao longo da frase; pergunta sobe no fim, exclamação começa lá em cima.
    let contour = 1.1 - (0.2 * i) / Math.max(1, vowels.length - 1);
    if (question && last) contour = 1.35;
    if (exclaim && i === 0) contour *= 1.15;
    const f0 = voice.pitch * contour * (0.94 + Math.random() * 0.12);
    osc.frequency.setTargetAtTime(f0, at, 0.015);
    const [a, b] = FORMANTS[v];
    f1.frequency.setTargetAtTime(a * voice.formant, at, 0.02);
    f2.frequency.setTargetAtTime(b * voice.formant, at, 0.02);
    env.gain.setTargetAtTime(peak, at, 0.012);
    env.gain.setTargetAtTime(0.0001, at + len * 0.8, 0.025);

    // Chiado curtinho no começo da sílaba, no lugar da consoante.
    if (i > 0 && Math.random() < 0.7) {
      const hiss = c.createBufferSource();
      hiss.buffer = noiseBuffer(c, 0.04);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const hg = c.createGain();
      hg.gain.setValueAtTime(0.12, at - 0.01);
      hg.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      hiss.connect(hp).connect(hg).connect(out);
      hiss.start(at - 0.01);
    }
  });
  osc.start(t0);
  osc.stop(t0 + total + 0.2);
  osc.onended = () => env.disconnect();
  return total;
};

export interface Line {
  avatarId: string;
  emoteId: string;
  text: string;
  /** -1 esquerda, 0 frente/eu, 1 direita. */
  pan?: number;
}

export const voice = {
  /** Deixa decodificadas as gravações de quem está na mesa, pra não ter atraso na primeira fala. */
  preload(avatarIds: string[], emoteIds: string[]) {
    for (const a of avatarIds) for (const e of emoteIds) void loadRecording(a, e);
  },

  /**
   * Fala a frase e devolve quanto tempo a fala dura, em segundos. Com as vozes desligadas não toca
   * nada, mas devolve a duração do mesmo jeito: o boneco ainda mexe a boca no tempo certo.
   */
  async say({ avatarId, emoteId, text, pan = 0 }: Line): Promise<number> {
    const profile = avatarById(avatarId).voice;
    const { sound, voices } = useSettings.getState();
    const c = sound && voices ? audio() : null;
    if (!c) return babbleDuration(text, profile);
    const out = c.createStereoPanner();
    out.pan.value = pan;
    const level = c.createGain();
    level.gain.value = 0.9;
    out.connect(level).connect(channel(c, 'voices'));

    const recording = await loadRecording(avatarId, emoteId);
    let seconds: number;
    if (recording) {
      const src = c.createBufferSource();
      src.buffer = recording;
      src.connect(out);
      src.onended = () => level.disconnect();
      src.start();
      seconds = recording.duration;
    } else {
      seconds = babble(c, out, text, profile);
      setTimeout(() => level.disconnect(), (seconds + 0.5) * 1000);
    }
    music.duck(seconds);
    return seconds;
  },
};
