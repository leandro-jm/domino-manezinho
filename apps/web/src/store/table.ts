import { create } from 'zustand';
import type { BotLevel } from '@domino/shared';
import type { Move, PlacedTile, PlayerView, Seat } from '@domino/engine';
import { emoteText } from '@domino/shared';

/** Quem está sentado em cada cadeira, do jeito que a mesa precisa mostrar. */
export interface TableSeat {
  nickname: string;
  avatarId: string;
  kind: 'human' | 'bot';
  level?: BotLevel;
  /** Id do jogador humano online (pra silenciar). */
  playerId?: string;
  connected: boolean;
}

export interface TableEmote {
  key: number;
  seat: Seat;
  emoteId: string;
  text: string;
}

/** Jogada do humano que rendeu bem menos que a do Monstro na mesma situação. */
export interface Mistake {
  played: Move;
  best: Move;
  /** Pontos esperados perdidos na mão. */
  loss: number;
  /** Mesa na hora da decisão (pra dizer a ponta). */
  boardBefore: PlacedTile[];
}

/** Revisão das jogadas do humano na mão que acabou (só no treino). */
export interface HandAnalysis {
  handNumber: number;
  /** O Monstro ainda está revendo. */
  pending: boolean;
  /** Decisões com mais de uma opção que foram revistas. */
  reviewed: number;
  /** Da pior pra menos pior. */
  mistakes: Mistake[];
}

/** O que a tela de jogo pode pedir, seja partida offline contra bots ou online. */
export interface TableActions {
  /** Devolve mensagem de erro, ou null se deu certo. */
  play: (move: Move) => Promise<string | null>;
  emote: (id: string) => void;
  /** Só no offline: começa a próxima mão sem esperar. */
  nextHand?: () => void;
  /** Só no treino: a jogada que o Monstro faria no meu lugar. */
  hint?: () => Promise<Move | null>;
  rematch?: () => Promise<string | null>;
  leave: () => void;
}

interface TableStore {
  mode: 'offline' | 'online' | null;
  view: PlayerView | null;
  seats: (TableSeat | null)[];
  turnDeadline: number | null;
  lastMove: { move: Move; key: number } | null;
  emotes: TableEmote[];
  /** Quem está com a boca mexendo agora: dura o tempo da fala, não o do balão. */
  speaking: Seat[];
  /** Só o dono da sala pode pedir revanche. */
  canRematch: boolean;
  actions: TableActions | null;
  analysis: HandAnalysis | null;
  setView: (view: PlayerView) => void;
  pushMove: (move: Move) => void;
  /** Frase do chat rápido pelo id; id desconhecido é ignorado. */
  pushEmote: (seat: Seat, emoteId: string) => void;
  setSpeaking: (seat: Seat, ms: number) => void;
  reset: () => void;
}

let counter = 0;
const speakingUntil: [number, number, number, number] = [0, 0, 0, 0];

export const useTable = create<TableStore>((set) => ({
  mode: null,
  view: null,
  seats: [null, null, null, null],
  turnDeadline: null,
  lastMove: null,
  emotes: [],
  speaking: [],
  canRematch: false,
  actions: null,
  analysis: null,
  setView: (view) => set({ view }),
  pushMove: (move) => set({ lastMove: { move, key: ++counter } }),
  pushEmote: (seat, emoteId) => {
    const text = emoteText(emoteId);
    if (!text) return;
    const key = ++counter;
    set((s) => ({ emotes: [...s.emotes.slice(-5), { key, seat, emoteId, text }] }));
    setTimeout(() => set((s) => ({ emotes: s.emotes.filter((e) => e.key !== key) })), 3500);
  },
  setSpeaking: (seat, ms) => {
    const until = Date.now() + ms;
    speakingUntil[seat] = Math.max(speakingUntil[seat], until);
    set((s) => (s.speaking.includes(seat) ? {} : { speaking: [...s.speaking, seat] }));
    setTimeout(() => {
      if (Date.now() >= speakingUntil[seat]) set((s) => ({ speaking: s.speaking.filter((x) => x !== seat) }));
    }, ms + 20);
  },
  reset: () =>
    set({
      mode: null,
      view: null,
      seats: [null, null, null, null],
      turnDeadline: null,
      lastMove: null,
      emotes: [],
      speaking: [],
      canRematch: false,
      actions: null,
      analysis: null,
    }),
}));
