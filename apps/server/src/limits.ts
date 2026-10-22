/** Acima disso o mapa joga fora as chaves que já saíram da janela (senão cresce sem fim). */
const PRUNE_ABOVE = 10_000;

/**
 * No máximo `max` vezes por chave a cada `windowMs` (janela deslizante), em memória.
 * Com `max` 1 é um intervalo mínimo entre duas vezes (cooldown).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Ainda cabe mais uma agora (não conta). */
  allows(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length < this.max;
  }

  /** Conta uma vez. */
  hit(key: string, now = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > PRUNE_ABOVE) {
      for (const [k, ts] of this.hits) if (ts.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
    }
  }

  /** Conta se couber; diz se coube. */
  take(key: string, now = Date.now()): boolean {
    if (!this.allows(key, now)) return false;
    this.hit(key, now);
    return true;
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
  }
}
