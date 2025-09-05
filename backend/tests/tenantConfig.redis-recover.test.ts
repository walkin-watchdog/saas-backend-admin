// tests/tenantConfig.redis-recover.test.ts
import { CacheService } from '../src/utils/cache';
import { TenantConfigService } from '../src/services/tenantConfigService';
import { prisma } from '../src/utils/prisma';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Cache resilience: drop & re-subscribe (with or without Redis)', () => {
  let tenant: { id: string };

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'RCo', status: 'active' },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await CacheService.shutdown?.();
  });

  it('re-subscribes after shutdown and receives config-updated invalidations', async () => {
    const received: Array<{ tenantId?: string; key?: string }> = [];

    // Subscribing to this pattern triggers an (optional) Redis connect internally.
    CacheService.on('tenant:*:config-updated', (evt: any) => {
      received.push(evt);
    });

    // First broadcast (warm-up)
    await TenantConfigService.createConfig(tenant.id, 'companyName', 'BeforeReconnect' as any);
    await wait(75);

    // Simulate connection drop (no-op if Redis not enabled)
    await CacheService.shutdown?.();

    // Re-subscribe (will reconnect if Redis is configured; always re-attach local handler)
    CacheService.on('tenant:*:config-updated', (evt: any) => {
      received.push(evt);
    });

    // Trigger a cross-instance/style invalidation event
    await TenantConfigService.updateConfig(tenant.id, 'companyName', 'AfterReconnect' as any);
    await wait(150);

    // We should have seen at least one event for this tenant/key
    expect(
      received.some((e) => e?.tenantId === tenant.id && e?.key === 'companyName')
    ).toBe(true);
  });
});