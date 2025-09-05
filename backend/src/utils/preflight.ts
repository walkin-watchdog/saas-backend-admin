import CircuitBreaker from 'opossum';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { LRUCache } from 'lru-cache';
import { logger } from './logger';
import { opMetrics } from './opMetrics';

// LRU-bounded cache for breakers keyed by datasource URL hash.
// Prevents unbounded growth when datasources rotate.
const breakers = new LRUCache<string, any>({
  max: Number(process.env.MAX_PREFLIGHT_BREAKERS ?? 100),
  ttl: Number(process.env.PREFLIGHT_BREAKER_TTL_MS ?? 5 * 60 * 1000),
  updateAgeOnGet: true,
  dispose: (breaker: any) => {
    try {
      // Ensure underlying timers are cleared
      (breaker as any).shutdown?.();
    } catch {}
  },
});

function hash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 8);
}

function createBreaker(key: string) {
  const breaker: any = new CircuitBreaker(
    async (client: PrismaClient) => {
      await client.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        await tx.$queryRaw`SELECT 1`;
      });
    },
    {
      timeout: 2500,
      errorThresholdPercentage: 50,
      resetTimeout: 10000,
    }
  );

  const hashed = hash(key);
  breaker.on('open', () => {
    logger.warn('preflight_breaker_open', { db: hashed });
    opMetrics.inc('breakerOpen');
  });
  breaker.on('close', () => {
    logger.info('preflight_breaker_close', { db: hashed });
    opMetrics.inc('breakerClose');
  });

  breakers.set(key, breaker);
  return breaker;
}

export function getPreflightBreaker(key: string): any {
  return breakers.get(key) ?? createBreaker(key);
}

export function breakersHealthy(): boolean {
  for (const b of breakers.values()) {
    const br: any = b;
    if (br.open || br.opened) return false;
  }
  return true;
}