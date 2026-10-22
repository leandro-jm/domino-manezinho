import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementProgress, AVATARS, BOT_LEVEL_IDS, BOT_LEVELS, BOT_PERSONAS, EMOTES, avatarById, isAvatarUnlocked, isBotLevel, quickFillLevel, rankTitle, validateNickname } from '../src';

describe('apelido', () => {
  it('aceita nomes com acento e normaliza espaços', () => {
    expect(validateNickname('  João   da Ilha ')).toEqual({ ok: true, nickname: 'João da Ilha' });
  });

  it.each(['a', 'x'.repeat(21), 'nome<script>', 'seu merda', 'p0rra', 'porraloka', 'Porrrra', 'm.e.r.d.a', 'Мané', '..', "-'_"])('recusa "%s"', (nick) => {
    expect(validateNickname(nick).ok).toBe(false);
  });

  it('não confunde palavra inocente com palavrão', () => {
    expect(validateNickname('Cuca').ok).toBe(true);
    for (const ok of ['Computador', 'Desviado', 'Zé 10', 'Ana-Lú', "D'Ávila", 'Cururu']) expect(validateNickname(ok).ok).toBe(true);
  });
});

describe('catálogos', () => {
  it('ids de avatares e frases são únicos', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(EMOTES.length);
  });

  it('bots usam avatares existentes e liberados desde o começo', () => {
    for (const bot of BOT_PERSONAS) expect(isAvatarUnlocked(avatarById(bot.avatarId), 0)).toBe(true);
  });

  it('avatar desconhecido cai no padrão', () => {
    expect(avatarById('nao-existe').id).toBe('veterano');
  });
});

describe('títulos', () => {
  it('sobe de Tanso a Rei da Praça XV', () => {
    expect(rankTitle(800)).toBe('Tanso');
    expect(rankTitle(1000)).toBe('Mané');
    expect(rankTitle(1400)).toBe('Rei da Praça XV');
  });
});

describe('níveis de bot', () => {
  it('reconhece só os níveis do catálogo', () => {
    for (const level of BOT_LEVEL_IDS) expect(isBotLevel(level)).toBe(true);
    for (const bad of ['', 'facil', 'toString', null, 3]) expect(isBotLevel(bad)).toBe(false);
  });

  it('mesa rápida põe o bot mais forte que a média da mesa alcança', () => {
    expect(quickFillLevel(1000)).toBe('amador');
    expect(quickFillLevel(BOT_LEVELS.praca.quickFillFrom)).toBe('praca');
    expect(quickFillLevel(BOT_LEVELS.monstro.quickFillFrom)).toBe('monstro');
    expect(quickFillLevel(1600)).toBe('monstro');
  });

  it('catálogo vai do mais fraco ao mais forte', () => {
    const ratings = BOT_LEVEL_IDS.map((l) => BOT_LEVELS[l].rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
  });
});

describe('conquistas', () => {
  const zero = { games: 0, wins: 0, practiceGames: 0, practiceWins: 0, carrocas: 0, laelos: 0, cruzadas: 0, streak: 0, bestStreak: 0 };

  it('ids únicos e objetivos positivos', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.goal).toBeGreaterThan(0);
  });

  it('conta o progresso sem passar do objetivo', () => {
    expect(achievementProgress(zero).every((a) => !a.done && a.current === 0)).toBe(true);
    const p = achievementProgress({ ...zero, games: 30, wins: 2, cruzadas: 1 });
    const by = Object.fromEntries(p.map((a) => [a.id, a]));
    expect(by.estreia).toMatchObject({ done: true, current: 1 });
    expect(by.cruzada!.done).toBe(true);
    expect(by.fregues).toMatchObject({ done: true, current: 25 });
    expect(by.veterano).toMatchObject({ done: false, current: 30 });
  });
});
