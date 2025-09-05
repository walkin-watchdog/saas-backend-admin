import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

interface OpCounters {
  cacheHit: number;
  cacheMiss: number;
  cacheEvict: number;
  evictReason: Record<string, number>;
  breakerOpen: number;
  breakerClose: number;
  dbUnavailable: number;
  cacheFallback: number;
}

interface OpHistograms {
  preflightMs: number[];
}

interface OpMetrics {
  counters: OpCounters;
  histograms: OpHistograms;
  inc(name: keyof OpCounters, by?: number, labels?: Record<string, string>): void;
  observePreflight(ms: number): void;
  snapshot(): OpCounters & { preflightMs: number[]; preflightP50: number; preflightP95: number };
}

// Prometheus registry and metrics
export const promRegister = new Registry();
if (process.env.COLLECT_DEFAULT_METRICS === 'true' || process.env.NODE_ENV === 'production') {
  collectDefaultMetrics({ register: promRegister });
}

const promCounters: Record<string, any> = {
  cacheHit: new Counter({ name: 'cache_hit_total', help: 'Cache hits', registers: [promRegister] }),
  cacheMiss: new Counter({ name: 'cache_miss_total', help: 'Cache misses', registers: [promRegister] }),
  cacheEvict: new Counter({ name: 'cache_evict_total', help: 'Cache evictions', registers: [promRegister] }),
  breakerOpen: new Counter({ name: 'breaker_open_total', help: 'Breaker opened', registers: [promRegister] }),
  breakerClose: new Counter({ name: 'breaker_close_total', help: 'Breaker closed', registers: [promRegister] }),
  dbUnavailable: new Counter({
    name: 'db_unavailable_total',
    help: 'DB unavailable',
    labelNames: ['tenantId'],
    registers: [promRegister]
  }),
  cacheFallback: new Counter({ name: 'cache_fallback_total', help: 'Cache fallback operations', registers: [promRegister] }),
};

const promEvictReason: any = new Counter({
  name: 'cache_evictions_total',
  help: 'Cache evictions by reason',
  labelNames: ['reason'],
  registers: [promRegister],
});

const promPreflight: any = new Histogram({
  name: 'preflight_latency_ms',
  help: 'Preflight latency in milliseconds',
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
  registers: [promRegister],
});

const PREFLIGHT_MAX_SAMPLES = Number(process.env.PREFLIGHT_HIST_SIZE ?? 1000);

export const opMetrics: OpMetrics = {
  counters: {
    cacheHit: 0,
    cacheMiss: 0,
    cacheEvict: 0,
    evictReason: {} as Record<string, number>,
    breakerOpen: 0,
    breakerClose: 0,
    dbUnavailable: 0,
    cacheFallback: 0,
  },
  histograms: {
    preflightMs: [] as number[],
  },
  inc(name: keyof OpCounters, by = 1, labels?: Record<string, string>) {
    if (name === 'evictReason' && labels?.reason) {
      opMetrics.counters.evictReason[labels.reason] =
        (opMetrics.counters.evictReason[labels.reason] || 0) + by;
      promEvictReason.inc({ reason: labels.reason }, by);
      return;
    }
    (opMetrics.counters[name] as number) += by;
    const counter = promCounters[name];
    if (labels && Object.keys(labels).length) {
      counter?.inc(labels, by);
    } else {
      counter?.inc(by);
    }
  },
  observePreflight(ms: number) {
    const arr = opMetrics.histograms.preflightMs;
    arr.push(ms);
    if (arr.length > PREFLIGHT_MAX_SAMPLES) arr.shift();
    promPreflight.observe(ms);
  },
  snapshot() {
    const samples = [...opMetrics.histograms.preflightMs];
    const pct = (p: number) => {
      if (!samples.length) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      const idx = Math.floor(p * (sorted.length - 1));
      return sorted[idx];
    };
    return {
      ...opMetrics.counters,
      preflightMs: samples,
      preflightP50: pct(0.5),
      preflightP95: pct(0.95),
    };
  },
};