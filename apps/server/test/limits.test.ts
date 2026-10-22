import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/limits';

describe('limite por janela', () => {
  it('deixa até o máximo na janela e libera quando ela passa', () => {
    const l = new RateLimiter(2, 1000);
    expect(l.take('a', 0)).toBe(true);
    expect(l.take('a', 100)).toBe(true);
    expect(l.take('a', 200)).toBe(false);
    // Outra chave não divide a conta.
    expect(l.take('b', 200)).toBe(true);
    // A primeira saiu da janela: cabe uma.
    expect(l.take('a', 1000)).toBe(true);
    expect(l.take('a', 1050)).toBe(false);
  });

  it('allows só olha; hit conta mesmo sem caber', () => {
    const l = new RateLimiter(1, 1000);
    expect(l.allows('a', 0)).toBe(true);
    expect(l.allows('a', 0)).toBe(true);
    l.hit('a', 0);
    expect(l.allows('a', 999)).toBe(false);
    expect(l.allows('a', 1000)).toBe(true);
  });

  it('recusa não estica a janela', () => {
    const l = new RateLimiter(1, 1000);
    l.take('a', 0);
    for (let t = 100; t < 1000; t += 100) expect(l.take('a', t)).toBe(false);
    expect(l.take('a', 1000)).toBe(true);
  });
});
