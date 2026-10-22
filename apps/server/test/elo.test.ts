import { createMatch, legalMoves, type HandResult } from '@domino/engine';
import { describe, expect, it } from 'vitest';
import { BOT_LEVELS } from '@domino/shared';
import { ELO_K, eloDeltas, expectedScore, teamRating } from '../src/elo';
import { countBatidas, isEligible, isRated, RATED_RULES, type HandRecord } from '../src/persistence';
import { weekStart } from '../src/ranking';
import { heaviestMove } from '../src/rooms/moves';
import { parseRoomSettings } from '../src/rooms/settings';

const batida = (seat: 0 | 1 | 2 | 3, kind: 'simples' | 'carroca' | 'laelo' | 'cruzada'): HandRecord => ({
  number: 1,
  log: [],
  result: { type: 'batida', seat, team: (seat % 2) as 0 | 1, kind, points: 1, galo: [0, 0] } satisfies HandResult,
});

describe('elo', () => {
  it('duplas iguais: vencedor ganha K/2 e perdedor perde K/2', () => {
    expect(eloDeltas([1000, 1000], 0)).toEqual([16, -16]);
    expect(eloDeltas([1000, 1000], 1)).toEqual([-16, 16]);
  });

  it('zebra rende mais que favorito', () => {
    const [fav] = eloDeltas([1400, 1000], 0);
    const [, zebra] = eloDeltas([1400, 1000], 1);
    expect(fav).toBe(3);
    expect(zebra).toBe(29);
    expect(fav + zebra).toBeLessThanOrEqual(ELO_K);
  });

  it('expectativa é simétrica', () => {
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1);
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('rating da dupla é a média, bots com rating fixo', () => {
    expect(teamRating([1000, BOT_LEVELS.amador.rating])).toBe(950);
    expect(teamRating([1100, BOT_LEVELS.monstro.rating])).toBe(1250);
  });

  it('nunca devolve -0', () => {
    const [a, b] = eloDeltas([3000, 0], 0);
    expect(Object.is(a, -0)).toBe(false);
    expect(b).toBe(0);
  });
});

describe('persistência', () => {
  it('conta batidas especiais por cadeira', () => {
    const hands = [batida(0, 'carroca'), batida(0, 'laelo'), batida(2, 'cruzada'), batida(1, 'simples'), batida(0, 'carroca')];
    hands.push({ number: 6, log: [], result: { type: 'trancado', team: 1, pips: [10, 4], points: 1, galo: [0, 0] } });
    const c = countBatidas(hands);
    expect(c[0]).toEqual({ carrocas: 2, laelos: 1, cruzadas: 0 });
    expect(c[2]).toEqual({ carrocas: 0, laelos: 0, cruzadas: 1 });
    expect(c[1]).toEqual({ carrocas: 0, laelos: 0, cruzadas: 0 });
  });

  it('vale ranking só com dois humanos elegíveis ou mais', () => {
    const seat = (s: 0 | 1 | 2 | 3, playerId: string | null) => ({ seat: s, playerId, botLevel: playerId ? null : ('amador' as const) });
    const all = new Set(['a', 'b']);
    expect(isRated([seat(0, 'a'), seat(1, null), seat(2, null), seat(3, null)], all)).toBe(false);
    expect(isRated([seat(0, 'a'), seat(1, 'b'), seat(2, null), seat(3, null)], all)).toBe(true);
    // b é conta recém-criada: não conta.
    expect(isRated([seat(0, 'a'), seat(1, 'b'), seat(2, null), seat(3, null)], new Set(['a']))).toBe(false);
  });

  it('elegível com conta de um dia ou com partidas online suficientes', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const ago = (ms: number) => ({ createdAt: new Date(now.getTime() - ms) });
    expect(isEligible(ago(60_000), 0, now)).toBe(false);
    expect(isEligible(ago(RATED_RULES.minAccountAgeMs), 0, now)).toBe(true);
    expect(isEligible(ago(60_000), RATED_RULES.minMatches, now)).toBe(true);
  });
});

describe('semana do ranking', () => {
  it('começa segunda 00:00 de Brasília', () => {
    expect(weekStart(new Date('2026-10-21T12:00:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(weekStart(new Date('2026-10-19T03:00:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('domingo à noite em Floripa ainda é a semana anterior', () => {
    expect(weekStart(new Date('2026-10-19T02:30:00Z')).toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
});

describe('configuração da mesa', () => {
  it('completa com o padrão e valida', () => {
    expect(parseRoomSettings({ visibility: 'public' })).toEqual({
      visibility: 'public',
      turnSeconds: 30,
      config: { scoring: 'batida', targetScore: 6, galo: false },
    });
    expect(parseRoomSettings({ turnSeconds: 45 })).toBeNull();
    expect(parseRoomSettings({ config: { scoring: 'pontos', targetScore: 5 } })).toBeNull();
    expect(parseRoomSettings({ config: { scoring: 'pontos', targetScore: 100 } })?.config.targetScore).toBe(100);
    expect(parseRoomSettings('nada')).toBeNull();
  });
});

describe('jogada automática', () => {
  it('na saída joga a carroça de sena (única legal)', () => {
    const match = createMatch({}, 42);
    const seat = match.hand.turn;
    expect(heaviestMove(match, seat)).toEqual(legalMoves(match, seat)[0]);
  });
});
