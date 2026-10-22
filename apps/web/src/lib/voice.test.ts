import { describe, expect, it } from 'vitest';
import { AVATARS, EMOTES } from '@domino/shared';
import { babbleDuration, syllablesOf } from './voice';

describe('blablablá das falas', () => {
  it('uma sílaba por grupo de vogais, ficando com a mais aberta', () => {
    expect(syllablesOf('Ó-lhó-lhó!')).toEqual(['o', 'o', 'o']);
    expect(syllablesOf('Tás tolo?')).toEqual(['a', 'o', 'o']);
    expect(syllablesOf('Queres')).toEqual(['e', 'e']);
  });

  it('frase sem vogal ainda faz algum som', () => {
    expect(syllablesOf('!!!')).toEqual(['a']);
  });

  it('nenhuma fala passa do tempo do balão', () => {
    for (const a of AVATARS) for (const e of EMOTES) expect(babbleDuration(e.text, a.voice)).toBeLessThan(3.5);
  });
});
