import { monitorEventLoopDelay } from 'node:perf_hooks';

type Labels = Record<string, string>;

/** Faixas (s) dos histogramas: ack de socket e resposta HTTP ficam quase sempre abaixo de 50 ms. */
const BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

const key = (labels: Labels = {}) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
    .join(',');

const series = (name: string, labels: string, value: number) => `${name}${labels ? `{${labels}}` : ''} ${value}`;

interface Histogram {
  counts: number[];
  sum: number;
  count: number;
}

/**
 * Métricas em memória no formato texto do Prometheus (sem dependência): contadores, histogramas e
 * medidas lidas na hora do scrape. Um processo só, como as mesas.
 */
export class Metrics {
  private readonly help = new Map<string, { type: 'counter' | 'gauge' | 'histogram'; text: string }>();
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly histograms = new Map<string, Map<string, Histogram>>();
  private readonly gauges = new Map<string, () => number>();
  private readonly loop = monitorEventLoopDelay({ resolution: 10 });

  constructor() {
    this.loop.enable();
    this.gauge('domino_event_loop_delay_p99_seconds', 'Atraso do event loop (p99 desde o último scrape)', () => {
      const p99 = this.loop.percentile(99) / 1e9;
      this.loop.reset();
      return p99;
    });
    this.gauge('domino_process_resident_memory_bytes', 'Memória do processo (RSS)', () => process.memoryUsage().rss);
    this.gauge('domino_process_heap_used_bytes', 'Heap do V8 em uso', () => process.memoryUsage().heapUsed);
  }

  counter(name: string, text: string): void {
    this.help.set(name, { type: 'counter', text });
    this.counters.set(name, new Map());
  }

  histogram(name: string, text: string): void {
    this.help.set(name, { type: 'histogram', text });
    this.histograms.set(name, new Map());
  }

  gauge(name: string, text: string, read: () => number): void {
    this.help.set(name, { type: 'gauge', text });
    this.gauges.set(name, read);
  }

  inc(name: string, labels?: Labels, by = 1): void {
    const values = this.counters.get(name);
    if (!values) throw new Error(`métrica não registrada: ${name}`);
    const k = key(labels);
    values.set(k, (values.get(k) ?? 0) + by);
  }

  observe(name: string, seconds: number, labels?: Labels): void {
    const values = this.histograms.get(name);
    if (!values) throw new Error(`métrica não registrada: ${name}`);
    const k = key(labels);
    let h = values.get(k);
    if (!h) values.set(k, (h = { counts: BUCKETS.map(() => 0), sum: 0, count: 0 }));
    BUCKETS.forEach((le, i) => {
      if (seconds <= le) h.counts[i]!++;
    });
    h.sum += seconds;
    h.count++;
  }

  render(): string {
    const out: string[] = [];
    for (const [name, { type, text }] of this.help) {
      out.push(`# HELP ${name} ${text}`, `# TYPE ${name} ${type}`);
      if (type === 'gauge') out.push(series(name, '', this.gauges.get(name)!()));
      if (type === 'counter') for (const [labels, v] of this.counters.get(name)!) out.push(series(name, labels, v));
      if (type === 'histogram') {
        for (const [labels, h] of this.histograms.get(name)!) {
          const prefix = labels ? `${labels},` : '';
          BUCKETS.forEach((le, i) => out.push(series(`${name}_bucket`, `${prefix}le="${le}"`, h.counts[i]!)));
          out.push(series(`${name}_bucket`, `${prefix}le="+Inf"`, h.count));
          out.push(series(`${name}_sum`, labels, h.sum), series(`${name}_count`, labels, h.count));
        }
      }
    }
    return `${out.join('\n')}\n`;
  }

  stop(): void {
    this.loop.disable();
  }
}
