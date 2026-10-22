import { describe, expect, it } from 'vitest';
import { applyMove, createMatch, createRng, findTile, getPlayerView, legalMoves } from '@domino/engine';
import type { MatchState } from '@domino/engine';
import { commentFor, deriveEvents, type KibitzEvent } from './kibitz';

const always = () => 0; // rng que sempre "decide comentar" e pega a primeira frase
const ctx = { names: ['Zé', 'Cota', 'Tião', 'Biluca'] };

describe('o que os perus percebem na mesa', () => {
  it('jogada, passe e fim de mão viram eventos', () => {
    let m: MatchState = createMatch({}, 21);
    const rng = createRng(3);
    let prev = getPlayerView(m, 0);
    const seen = new Set<string>();
    while (!m.hand.result) {
      const moves = legalMoves(m, m.hand.turn);
      m = applyMove(m, moves[Math.floor(rng() * moves.length)]!);
      const next = getPlayerView(m, 0);
      for (const e of deriveEvents(prev, next)) seen.add(e.type);
      prev = next;
    }
    expect(seen.has('play')).toBe(true);
    expect([...seen].some((t) => t === 'batida' || t === 'trancado')).toBe(true);
  });

  it('a primeira visão não gera comentário', () => {
    expect(deriveEvents(null, getPlayerView(createMatch({}, 1), 0))).toEqual([]);
  });

  it('passe registra as pontas que o jogador não tinha', () => {
    const m = createMatch({}, 5);
    const view = getPlayerView(m, 0);
    const next = {
      ...view,
      log: [...view.log, { type: 'pass' as const, seat: 1 as const }],
      ends: [3, 5] as [number, number],
    };
    expect(deriveEvents(view, next)).toEqual([{ type: 'pass', seat: 1, ends: [3, 5] }]);
  });
});

describe('o que os perus falam', () => {
  it('passe fala dos números que faltam, com o nome de quem passou', () => {
    expect(commentFor({ type: 'pass', seat: 2, ends: [3, 5] }, ctx, always)).toBe('Toc-toc! Tião não tem 3 nem 5.');
    expect(commentFor({ type: 'pass', seat: 1, ends: [4, 4] }, ctx, always)).toBe('Toc-toc! Cota tá seco de 4.');
  });

  it('cada batida tem sua comemoração', () => {
    const say = (kind: Extract<KibitzEvent, { type: 'batida' }>['kind']) => commentFor({ type: 'batida', seat: 0, kind }, ctx, always);
    expect(say('laelo')).toMatch(/Lá-e-ló/);
    expect(say('cruzada')).toMatch(/CRUZADA/);
    expect(say('carroca')).toMatch(/carroça/i);
    expect(say('simples')).toMatch(/Zé/);
  });

  it('avisa quando alguém fica com uma pedra só, e comenta a sena', () => {
    const t = findTile(6, 6);
    expect(commentFor({ type: 'play', seat: 3, a: 2, b: 4, left: 1 }, ctx, always)).toMatch(/Biluca/);
    expect(commentFor({ type: 'play', seat: 0, a: t.a, b: t.b, left: 6 }, ctx, always)).toMatch(/sena/);
  });

  it('às vezes ficam quietos', () => {
    expect(commentFor({ type: 'play', seat: 0, a: 1, b: 2, left: 5 }, ctx, () => 0.99)).toBeNull();
  });

  it('fim de partida cita a dupla que perdeu', () => {
    const rng = createRng(1);
    const lines = new Set(Array.from({ length: 60 }, () => commentFor({ type: 'match', winner: 0 }, ctx, rng)));
    expect([...lines].some((l) => l?.includes('Cota e Biluca'))).toBe(true);
  });
});
