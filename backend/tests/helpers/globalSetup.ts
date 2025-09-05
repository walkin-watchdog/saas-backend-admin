import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
const inCI = process.env.CI === 'true';
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || '.env.test',
  override: !inCI,
});


const execAsync = promisify(exec);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForRedis(redisUrl: string) {
  // quick ping using redis-cli if available; fall back to node-redis
  try {
    await execAsync(`redis-cli -u ${redisUrl} ping`);
    return;
  } catch {
    // fallback: node-redis
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== 'PONG') throw new Error('Redis ping failed');
    } finally {
      try { await client.quit(); } catch {}
    }
  }
}

export default async function globalSetup(): Promise<void> {
  // Use DATABASE_URL if provided (e.g., CI on 5432); otherwise default to local docker-compose (5433).
  const defaultUrl = 'postgresql://test:test@localhost:5433/app_test';
  const effectiveUrl =
    process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
      ? process.env.DATABASE_URL
      : defaultUrl;

  // Ensure Prisma and the seed use the same URL in this process.
  process.env.DATABASE_URL = effectiveUrl;

  const { PrismaClient } = await import('@prisma/client');
  for (let i = 0; i < 20; i++) {
    const p = new PrismaClient({ datasources: { db: { url: effectiveUrl } } });
    try {
      await p.$queryRaw`SELECT 1`;
      await p.$disconnect();
      break;
    } catch (err) {
      await p.$disconnect().catch(() => {});
      if (i === 19) throw err;
      await sleep(1000);
    }
  }

  const defaultRedis = 'redis://localhost:6380';
  const redisUrl = process.env.REDIS_URL?.trim() || defaultRedis;
  process.env.REDIS_URL = redisUrl;

  for (let i = 0; i < 30; i++) {
    try { await waitForRedis(redisUrl); break; }
    catch (err) { if (i === 29) throw err; await sleep(1000); }
  }

  // Enable Redis usage in tests (we changed CacheService to honor this)
  process.env.CACHE_TEST_USE_REDIS = process.env.CACHE_TEST_USE_REDIS || 'true';

  // Run migrations with the effective DATABASE_URL
  await execAsync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: effectiveUrl },
  });

  // Seed minimal data
  await import('../../src/seedTest');
}