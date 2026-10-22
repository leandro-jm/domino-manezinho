/** setTimeouts com nome: armar de novo com o mesmo nome troca o anterior. */
export class NamedTimers {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    /** Erro dentro de um timer não pode derrubar o processo: vai pro log. */
    private readonly onError: (name: string, err: unknown) => void,
    /** Timer que dispara com isso falso não roda (mesa fechada). */
    private readonly active: () => boolean = () => true,
  ) {}

  set(name: string, ms: number, fn: () => void): void {
    this.clear(name);
    const t = setTimeout(() => {
      this.timers.delete(name);
      if (!this.active()) return;
      try {
        fn();
      } catch (err) {
        this.onError(name, err);
      }
    }, Math.max(0, ms));
    this.timers.set(name, t);
  }

  clear(name: string): void {
    const t = this.timers.get(name);
    if (t) clearTimeout(t);
    this.timers.delete(name);
  }

  clearPrefix(prefix: string): void {
    for (const name of [...this.timers.keys()]) if (name.startsWith(prefix)) this.clear(name);
  }

  clearAll(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
