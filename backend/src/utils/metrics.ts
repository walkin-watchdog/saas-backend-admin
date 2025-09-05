import { Histogram, Counter, Gauge } from 'prom-client';
import { promRegister } from './opMetrics';
import { createHash } from 'crypto';

export { promRegister };

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request latency in milliseconds',
  buckets: [50, 100, 300, 500, 1000, 3000, 5000],
  labelNames: ['route', 'status', 'tenant'],
  registers: [promRegister],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query latency in milliseconds',
  buckets: [10, 25, 50, 100, 200, 500, 1000],
  labelNames: ['tenant'],
  registers: [promRegister],
});

export const dbErrorCounter = new Counter({
  name: 'db_errors_total',
  help: 'Database query errors',
  labelNames: ['tenant'],
  registers: [promRegister],
});

export const authFailureCounter = new Counter({
  name: 'auth_failures_total',
  help: 'Authentication failures',
  labelNames: ['tenant'],
  registers: [promRegister],
});

export const authLockoutCounter = new Counter({
  name: 'auth_lockouts_total',
  help: 'Login lockouts',
  labelNames: ['tenant'],
  registers: [promRegister],
});

export const webhookFailureCounter = new Counter({
  name: 'webhook_failures_total',
  help: 'Webhook delivery failures',
  labelNames: ['provider'],
  registers: [promRegister],
});

export const webhookReplayCounter = new Counter({
  name: 'webhook_replays_total',
  help: 'Webhook replay attempts',
  labelNames: ['provider'],
  registers: [promRegister],
});

export const jobQueueDepth = new Gauge({
  name: 'job_queue_depth',
  help: 'Depth of background job queues',
  labelNames: ['job', 'tenant'],
  registers: [promRegister],
});

export const jobDuration = new Histogram({
  name: 'job_duration_ms',
  help: 'Background job duration in milliseconds',
  buckets: [10, 50, 100, 300, 1000, 3000, 10000],
  labelNames: ['job', 'tenant'],
  registers: [promRegister],
});

export const dunningRetryCounter = new Counter({
  name: 'dunning_retries_total',
  help: 'Dunning retry attempts',
  labelNames: ['tenant'],
  registers: [promRegister],
});

export const externalBreakerOpen = new Counter({
  name: 'external_breaker_open_total',
  help: 'External circuit breaker opened',
  labelNames: ['provider', 'tenant'],
  registers: [promRegister],
});

export const externalBreakerOpenGauge = new Gauge({
  name: 'external_breaker_open',
  help: 'External circuit breaker currently open (1=open,0=closed)',
  labelNames: ['provider', 'tenant'],
  registers: [promRegister],
});

export const externalBreakerHalfOpen = new Counter({
  name: 'external_breaker_half_open_total',
  help: 'External circuit breaker half-open',
  labelNames: ['provider', 'tenant'],
  registers: [promRegister],
});

export const externalBreakerClose = new Counter({
  name: 'external_breaker_close_total',
  help: 'External circuit breaker closed',
  labelNames: ['provider', 'tenant'],
  registers: [promRegister],
});

export const externalBreakerStillOpen = new Counter({
  name: 'external_breaker_still_open_total',
  help: 'External circuit breaker remained open after alert threshold',
  labelNames: ['provider', 'tenant'],
  registers: [promRegister],
});

export const prismaPoolGauge = new Gauge({
  name: 'prisma_pool_connections',
  help: 'Current number of Prisma DB connections',
  registers: [promRegister],
  async collect() {
    try {
      const { prisma } = await import('./prisma');
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'prisma-client'
      `;
      this.set(count);
    } catch {
      /* ignore errors during metric collection */
    }
  },
});

export const prismaSharedCapGauge = new Gauge({
  name: 'prisma_shared_connection_cap',
  help: 'Configured max connections for shared Prisma client',
  registers: [promRegister],
  async collect() {
    try {
      const { getPrismaPoolStats } = await import('./prisma');
      const { sharedCap } = getPrismaPoolStats();
      this.set(sharedCap);
    } catch {
      /* ignore */
    }
  },
});

export const prismaDedicatedCapGauge = new Gauge({
  name: 'prisma_dedicated_connection_cap',
  help: 'Configured max connections for dedicated Prisma clients',
  registers: [promRegister],
  async collect() {
    try {
      const { getPrismaPoolStats } = await import('./prisma');
      const { dedicatedCap } = getPrismaPoolStats();
      this.set(dedicatedCap);
    } catch {
      /* ignore */
    }
  },
});

export const prismaDedicatedClientsGauge = new Gauge({
  name: 'prisma_dedicated_clients',
  help: 'Number of dedicated Prisma clients currently alive',
  registers: [promRegister],
  async collect() {
    try {
      const { getPrismaPoolStats } = await import('./prisma');
      const { dedicatedClients } = getPrismaPoolStats();
      this.set(dedicatedClients);
    } catch {
      /* ignore */
    }
  },
});

export const pgbouncerClientActive = new Gauge({
  name: 'pgbouncer_clients_active',
  help: 'Active client connections reported by PgBouncer',
  registers: [promRegister],
  async collect() {
    try {
      const { getPgBouncerStats } = await import('./prisma');
      const stats = await getPgBouncerStats();
      if (stats) this.set(stats.cl_active);
    } catch {}
  },
});

export const pgbouncerClientWaiting = new Gauge({
  name: 'pgbouncer_clients_waiting',
  help: 'Waiting client connections reported by PgBouncer',
  registers: [promRegister],
  async collect() {
    try {
      const { getPgBouncerStats } = await import('./prisma');
      const stats = await getPgBouncerStats();
      if (stats) this.set(stats.cl_waiting);
    } catch {}
  },
});

export const pgbouncerServerActive = new Gauge({
  name: 'pgbouncer_servers_active',
  help: 'Active server connections reported by PgBouncer',
  registers: [promRegister],
  async collect() {
    try {
      const { getPgBouncerStats } = await import('./prisma');
      const stats = await getPgBouncerStats();
      if (stats) this.set(stats.sv_active);
    } catch {}
  },
});

export const pgbouncerServerIdle = new Gauge({
  name: 'pgbouncer_servers_idle',
  help: 'Idle server connections reported by PgBouncer',
  registers: [promRegister],
  async collect() {
    try {
      const { getPgBouncerStats } = await import('./prisma');
      const stats = await getPgBouncerStats();
      if (stats) this.set(stats.sv_idle);
    } catch {}
  },
});

async function fetchRevenueMetrics() {
  const { PlatformMetricsService } = await import('../services/platformMetricsService');
  return PlatformMetricsService.getRevenueMetrics('month');
}

export const platformMrrGauge = new Gauge({
  name: 'platform_mrr',
  help: 'Platform monthly recurring revenue in dollars',
  registers: [promRegister],
  async collect() {
    const { mrr } = await fetchRevenueMetrics();
    const totalMrr = Object.values(mrr).reduce((a, b) => a + b, 0);
    this.set(totalMrr);
  },
});

export const platformChurnRateGauge = new Gauge({
  name: 'platform_churn_rate',
  help: 'Platform churn rate percentage',
  registers: [promRegister],
  async collect() {
    const { churnRate } = await fetchRevenueMetrics();
    this.set(churnRate);
  },
});

export function hashTenantId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 8);
}