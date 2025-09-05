import path from 'path';

jest.setTimeout(30_000);

// Use real Redis
process.env.CACHE_TEST_USE_REDIS = 'true';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

async function waitFor(assertFn: () => void, timeoutMs = 1500, stepMs = 25) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      assertFn();
      return;
    } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await new Promise((r) => setTimeout(r, stepMs));
    }
  }
}

function loadCacheServiceIsolated() {
  let CacheService: any;
  jest.isolateModules(() => {
    const mod = require(path.join('..', 'src', 'utils', 'cache'));
    CacheService = mod.CacheService;
  });
  return CacheService;
}

describe('TenantConfig cache invalidation across instances (real Redis)', () => {
  let A: any;
  let B: any;

  let shutdowns: Array<() => Promise<void>> = [];
  beforeEach(() => {
    jest.resetModules();
    A = loadCacheServiceIsolated();
    B = loadCacheServiceIsolated();

    // Subscribe so ensureRedis() connects in each instance
    A.on('tenant:*:config-updated', () => {});
    B.on('tenant:*:config-updated', () => {});
    shutdowns = [() => A.shutdown?.() ?? Promise.resolve(), () => B.shutdown?.() ?? Promise.resolve()];
  });

  afterEach(() => {
    A.clear();
    B.clear();
  });

  afterAll(async () => {
    for (const s of shutdowns) {
      try { await s(); } catch {}
    }
  });

  it('instance B drops its cache when A updates a config', async () => {
    const tenantId = 't_cache_demo';
    const key = 'companyName';

    // Seed both caches with the same value
    A.setTenantConfig(tenantId, key, 'OldCo');
    B.setTenantConfig(tenantId, key, 'OldCo');

    expect(A.getTenantConfig(tenantId, key)).toBe('OldCo');
    expect(B.getTenantConfig(tenantId, key)).toBe('OldCo');

    // A updates -> publishes invalidation to Redis (broadcast=true)
    A.setTenantConfig(tenantId, key, 'NewCo', { broadcast: true });

    // Wait for pub/sub delivery
    await waitFor(() => {
      expect(A.getTenantConfig(tenantId, key)).toBeNull();
      expect(B.getTenantConfig(tenantId, key)).toBeNull();
    });
  });

  it('reverse direction: A drops cache when B updates', async () => {
    const tenantId = 't_cache_demo_rev';
    const key = 'companyName';
    A.setTenantConfig(tenantId, key, 'OldCo');
    B.setTenantConfig(tenantId, key, 'OldCo');
    B.setTenantConfig(tenantId, key, 'NewCo', { broadcast: true });
    await waitFor(() => {
      expect(A.getTenantConfig(tenantId, key)).toBeNull();
      expect(B.getTenantConfig(tenantId, key)).toBeNull();
    });
  });

  it('tenant scoping: invalidation for T1 does not evict T2', async () => {
    const T1 = 't1';
    const T2 = 't2';
    const key = 'companyName';
    A.setTenantConfig(T1, key, 'Co1');
    A.setTenantConfig(T2, key, 'Co2');
    B.setTenantConfig(T1, key, 'Co1');
    B.setTenantConfig(T2, key, 'Co2');
    // Update only T1
    A.setTenantConfig(T1, key, 'Co1-new', { broadcast: true });
    await waitFor(() => {
      expect(A.getTenantConfig(T1, key)).toBeNull();
      expect(B.getTenantConfig(T1, key)).toBeNull();
    });
    // T2 untouched
    expect(A.getTenantConfig(T2, key)).toBe('Co2');
    expect(B.getTenantConfig(T2, key)).toBe('Co2');
  });

  it('key-level eviction: updating companyName does not evict logoUrl', async () => {
    const tenantId = 't_key_level';
    A.setTenantConfig(tenantId, 'companyName', 'Name1');
    A.setTenantConfig(tenantId, 'logoUrl', 'https://cdn/logo1.png');
    B.setTenantConfig(tenantId, 'companyName', 'Name1');
    B.setTenantConfig(tenantId, 'logoUrl', 'https://cdn/logo1.png');
    // Update only companyName
    A.setTenantConfig(tenantId, 'companyName', 'Name2', { broadcast: true });
    await waitFor(() => {
      expect(A.getTenantConfig(tenantId, 'companyName')).toBeNull();
      expect(B.getTenantConfig(tenantId, 'companyName')).toBeNull();
    });
    // logoUrl remains cached
    expect(A.getTenantConfig(tenantId, 'logoUrl')).toBe('https://cdn/logo1.png');
    expect(B.getTenantConfig(tenantId, 'logoUrl')).toBe('https://cdn/logo1.png');
  });

  it('no-Redis fallback: when CACHE_TEST_USE_REDIS=false, cross-instance invalidation does not occur', async () => {
    // Create two fresh isolated module instances with Redis disabled
    process.env.CACHE_TEST_USE_REDIS = 'false';
    let A2: any; let B2: any;
    jest.isolateModules(() => { A2 = require(path.join('..','src','utils','cache')).CacheService; });
    jest.isolateModules(() => { B2 = require(path.join('..','src','utils','cache')).CacheService; });
    A2.on('tenant:*:config-updated', () => {});
    B2.on('tenant:*:config-updated', () => {});
    const tenantId = 't_no_redis';
    const key = 'companyName';
    A2.setTenantConfig(tenantId, key, 'Old', { /* no broadcast since Redis is off anyway */ });
    B2.setTenantConfig(tenantId, key, 'Old');
    // Even with broadcast flag, ensureRedis short-circuits; no cross-eviction
    A2.setTenantConfig(tenantId, key, 'New', { broadcast: true });
    // Wait a tick
    await new Promise(r => setTimeout(r, 50));
    expect(B2.getTenantConfig(tenantId, key)).toBe('Old'); // not evicted
    await A2.shutdown?.(); await B2.shutdown?.();
  });
});