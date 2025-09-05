// tests/tenantConfig.redis-down.test.ts
// Make the test deterministic: force redis connect() to reject immediately.
jest.mock('redis', () => {
  return {
    createClient: () => ({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      publish: jest.fn().mockResolvedValue(undefined),
      pSubscribe: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

import { prisma } from '../src/utils/prisma';
import { TenantService } from '../src/services/tenantService';
import { TenantConfigService } from '../src/services/tenantConfigService';
import { CacheService } from '../src/utils/cache';
import { logger } from '../src/utils/logger';

async function waitFor(assertFn: () => void, timeoutMs = 2000, stepMs = 50) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { assertFn(); return; }
    catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await new Promise(r => setTimeout(r, stepMs));
    }
  }
}

describe('Cache / Redis down fallback', () => {
  let tenant: any;
  const ORIGINAL_ENV = { ...process.env };
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'RedisDown Co', status: 'active', dedicated: false } as any,
    });
  });

  beforeEach(async () => {
    await CacheService.shutdown?.(); // ensure ensureRedis() will run fresh
    process.env.NODE_ENV = 'test';
    process.env.CACHE_TEST_USE_REDIS = 'true'; // force CacheService.ensureRedis() path in tests
    process.env.REDIS_URL = 'redis://127.0.0.1:6399'; // irrelevant now; we mock redis anyway
    warnSpy = jest.spyOn(logger, 'warn').mockReturnValue(logger as any);
    CacheService.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    warnSpy.mockRestore();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await CacheService.shutdown?.();
  });

  it('falls back to DB and logs a warning when Redis is unavailable', async () => {
    // Seed only in DB
    await TenantService.withTenantContext(tenant, async () => {
      await TenantConfigService.createConfig(tenant.id, 'companyName', 'RedisDown Co');
    });

    // Warm up cache -> triggers CacheService.ensureRedis() which will reject immediately (mocked)
    await TenantConfigService.warmUpCache(tenant.id);

    // Wait until the warning appears (don’t assume it’s arg[0])
    await waitFor(() => {
      const sawWarn = warnSpy.mock.calls.some(call =>
        call.some((arg: string | string[]) => typeof arg === 'string'
          && arg.includes('CacheService: Redis unavailable, using in-memory only'))
      );
      expect(sawWarn).toBe(true);
    });

    // Clear cache to force a DB read and ensure things still work without Redis
    CacheService.clear();

    const value = await TenantService.withTenantContext(tenant, async () => {
      return TenantConfigService.getConfig(tenant.id, 'companyName');
    });

    expect(value).toBe('RedisDown Co'); // came from DB, not cache
  });
});