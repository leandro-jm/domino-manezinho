import { create } from 'zustand';
import { teamOf, tileById, type BatidaKind, type PlayerView, type Rng, type Seat, type Team } from '@domino/engine';

/**
 * Os "perus" da mesa: quem fica em pé em volta só olhando e dando palpite.
 * Aqui fica a parte sem 3D: o que aconteceu na mesa e o que eles comentam sobre isso.
 */

export const PERUS = ['Seu Valmor', 'Dona Nilza', 'Tonho', 'Zeca', 'Seu Ademir'] as const;

export type KibitzEvent =
  | { type: 'play'; seat: Seat; a: number; b: number; left: number }
  | { type: 'pass'; seat: Seat; ends: [number, number] }
  | { type: 'batida'; seat: Seat; kind: BatidaKind }
  | { type: 'trancado'; team: Team | null }
  | { type: 'match'; winner: Team }
  | { type: 'newHand'; close: boolean }
  | { type: 'slow'; seat: Seat }
  /** A revisão do treino achou jogada bem pior que a do Monstro. */
  | { type: 'mistake'; seat: Seat; best: string }
  | { type: 'idle' };

/** O que mudou entre duas visões da mesa, do mais importante para o menos. */
export const deriveEvents = (prev: PlayerView | null, next: PlayerView): KibitzEvent[] => {
  if (!prev) return [];
  if (next.handNumber !== prev.handNumber) {
    const target = next.config.targetScore;
    return [{ type: 'newHand', close: next.scores.every((s) => s >= target - (next.config.scoring === 'batida' ? 1 : 15)) }];
  }
  if (next.winner !== null && prev.winner === null) return [{ type: 'match', winner: next.winner }];
  const r = next.result;
  if (r && !prev.result) {
    return [r.type === 'batida' ? { type: 'batida', seat: r.seat, kind: r.kind } : { type: 'trancado', team: r.team }];
  }
  const fresh = next.log.slice(prev.log.length);
  const last = fresh[fresh.length - 1];
  if (!last) return [];
  if (last.type === 'pass') return [{ type: 'pass', seat: last.seat, ends: next.ends ?? [0, 0] }];
  const t = tileById(last.tileId);
  return [{ type: 'play', seat: last.seat, a: t.a, b: t.b, left: next.handCounts[last.seat] }];
};

export interface KibitzContext {
  /** Apelido de quem está em cada cadeira. */
  names: string[];
}

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

const LINES = {
  carroca: ['Carroça de {a} na mesa!', 'Se livrou da carroça, esperto.', 'Olha a carroça de {a}!'],
  sena: ['Largou a sena, tava pesando no bolso!', 'Carroção de sena, ó-lhó-lhó!'],
  pesada: ['{n} se livrando dos pontos…', 'Largou pedra pesada, tá com medo de trancar.', 'Essa {a}-{b} pesava, hein?'],
  umaSo: ['Ó-lhó-lhó, {n} tá com uma só!', 'Segura {n} que vai bater!', 'Uma pedra só na mão de {n}… perigo!'],
  qualquer: ['Hmm, eu não jogava essa.', 'Boa, boa.', 'Essa foi de mestre.', 'Tás tolo? Jogou na ponta errada!', 'Pensou bem, hein.'],
  passouUm: ['Toc-toc! {n} tá seco de {a}.', 'Passou! Não tem {a}, eu vi!', 'Trancaram {n} no {a}!'],
  passouDois: ['Toc-toc! {n} não tem {a} nem {b}.', 'Passou! Tá sem o {a} e o {b}.', 'Ih, {n} passou. Guardem isso: sem {a} e sem {b}.'],
  simples: ['Bateu! {n} fechou a mão.', 'Batida simples, mas conta!', 'Bateu {n}, simplesinho.'],
  carrocaBatida: ['Bateu de carroça! Ó-lhó-lhó!', 'Carroção na batida, dois pontos!'],
  laelo: ['Lá-e-ló! Que beleza, meu!', 'Lá-e-ló! Essa eu quero ver de novo!', 'Lá-e-ló, três pontos na conta!'],
  cruzada: ['CRUZADA! Isso não se vê todo dia!', 'Cruzada! Vou contar pros guris lá na Lagoa!'],
  trancado: ['Trancou! Conta os pontinhos aí.', 'Trancado! Agora é na ponta do lápis.'],
  trancadoEmpate: ['Trancou e empatou! Ninguém leva.', 'Empate no trancado, tá vendo? Sai de novo.'],
  fim: ['Acabou! Quem perde paga o café.', 'Fim de jogo! Revanche, revanche!', 'É, hoje não foi dia de {perdedor}.'],
  pegado: ['Tá pegado esse jogo, hein!', 'Agora é mão de decisão, mané!'],
  novaMao: ['Mais uma mão, bora!', 'Embaralha direito aí!', 'Vamos ver quem sai agora.'],
  erro: ['Tás tolo? Tinha o {t} pra jogar!', 'Ó, {n}, eu jogava o {t}…', 'Essa doeu. O {t} era a pedra, {n}!'],
  demora: ['Joga logo, {n}!', 'Pensa não, joga!', '{n} tá contando as pedras do céu…', 'Mofas com a pomba na balaia, {n}!'],
  conversa: [
    'No meu tempo se jogava com pedra de osso.',
    'Esse vento sul tá chegando, ó.',
    'Alguém viu o jogo do Avaí ontem?',
    'Figueira ou Avaí? Briga boa.',
    'Vou ali no Mercado comer um pastel de camarão e já volto.',
    'Esses pombos não param quieto.',
    'Que calor, tá loco!',
    'A tainha esse ano veio boa, dizem.',
  ],
} as const;

/** Chance de alguém comentar cada tipo de lance. */
const CHANCE: Record<KibitzEvent['type'], number> = {
  play: 0.3,
  pass: 0.5,
  batida: 0.9,
  trancado: 0.85,
  match: 0.95,
  newHand: 0.35,
  slow: 0.7,
  mistake: 0.85,
  idle: 0.4,
};

/** Frase de um peru sobre o lance, ou null se ficarem quietos dessa vez. */
export const commentFor = (event: KibitzEvent, ctx: KibitzContext, rng: Rng): string | null => {
  if (rng() > CHANCE[event.type]) return null;
  const name = (seat: Seat) => ctx.names[seat] ?? 'o parceiro';
  switch (event.type) {
    case 'play': {
      const vars = { n: name(event.seat), a: event.a, b: event.b };
      if (event.left === 1) return fill(pick(LINES.umaSo, rng), vars);
      if (event.a === event.b) return fill(pick(event.a === 6 ? LINES.sena : LINES.carroca, rng), vars);
      if (event.a + event.b >= 10) return fill(pick(LINES.pesada, rng), vars);
      return rng() < 0.4 ? pick(LINES.qualquer, rng) : null;
    }
    case 'pass': {
      const [a, b] = event.ends;
      const vars = { n: name(event.seat), a, b };
      return fill(pick(a === b ? LINES.passouUm : LINES.passouDois, rng), vars);
    }
    case 'batida': {
      const list = { simples: LINES.simples, carroca: LINES.carrocaBatida, laelo: LINES.laelo, cruzada: LINES.cruzada }[event.kind];
      return fill(pick(list, rng), { n: name(event.seat) });
    }
    case 'trancado':
      return pick(event.team === null ? LINES.trancadoEmpate : LINES.trancado, rng);
    case 'match': {
      const losers = ([0, 1, 2, 3] as Seat[]).filter((s) => teamOf(s) !== event.winner).map(name);
      return fill(pick(LINES.fim, rng), { perdedor: losers.join(' e ') });
    }
    case 'newHand':
      return pick(event.close ? LINES.pegado : LINES.novaMao, rng);
    case 'slow':
      return fill(pick(LINES.demora, rng), { n: name(event.seat) });
    case 'mistake':
      return fill(pick(LINES.erro, rng), { n: name(event.seat), t: event.best });
    case 'idle':
      return pick(LINES.conversa, rng);
  }
};

// ---------- quem está falando agora (lido pela cena 3D e pelos balões) ----------

export interface KibitzLine {
  key: number;
  peru: number;
  text: string;
}

interface KibitzStore {
  lines: KibitzLine[];
  say: (peru: number, text: string) => void;
  clear: () => void;
}

export const KIBITZ_LINE_MS = 4200;
let counter = 0;

export const useKibitz = create<KibitzStore>((set) => ({
  lines: [],
  say: (peru, text) => {
    const key = ++counter;
    set((s) => ({ lines: [...s.lines.filter((l) => l.peru !== peru), { key, peru, text }] }));
    setTimeout(() => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })), KIBITZ_LINE_MS);
  },
  clear: () => set({ lines: [] }),
}));
