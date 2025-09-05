import { jest } from '@jest/globals';

// Mock PrismaClient so no real DB connections occur
const disconnectMock = jest.fn() as jest.MockedFunction<() => Promise<void>>;
disconnectMock.mockResolvedValue(undefined);
const prismaCtor = jest.fn(() => ({ $disconnect: disconnectMock, $use: jest.fn() }));

jest.mock('@prisma/client', () => {
  // Provide a minimal Prisma.dmmf so tenant-guard computation doesn't crash
  return {
    PrismaClient: prismaCtor,
    Prisma: {
      dmmf: {
        datamodel: {
          models: [
            { name: 'Tenant', fields: [{ name: 'id' }] },
            { name: 'User', fields: [{ name: 'tenantId' }, { name: 'id' }] },
          ],
        },
      },
    },
  };
});

describe('Dedicated Prisma cache + eviction', () => {
  const URL1 = 'postgresql://u:p@h:5432/db1';
  const URL2 = 'postgresql://u:p@h:5432/db2';

  beforeEach(() => {
    jest.resetModules();
    disconnectMock.mockReset();
    disconnectMock.mockResolvedValue(undefined);
    prismaCtor.mockClear();
  });

  test('getDedicatedPrisma caches by URL and evicts on explicit call', async () => {
    const mod = await import('../../src/utils/prisma');
    const { getDedicatedPrisma, evictDedicatedClient } = mod as any;

    const c1a = getDedicatedPrisma(URL1);
    const c1b = getDedicatedPrisma(URL1);
    expect(c1a).toBe(c1b);
    expect(prismaCtor).toHaveBeenCalledTimes(1);

    evictDedicatedClient(URL1, 'test');
    expect(disconnectMock).toHaveBeenCalledTimes(1);

    const c1c = getDedicatedPrisma(URL1);
    expect(c1c).not.toBe(c1a);
    expect(prismaCtor).toHaveBeenCalledTimes(2);
  });

  test('DATASOURCE_CHANGED event evicts previous URL, not new', async () => {
    const mod = await import('../../src/utils/prisma');
    const { getDedicatedPrisma } = mod as any;

    const c1 = getDedicatedPrisma(URL1);
    expect(c1).toBeDefined();

    const { eventBus, TENANT_EVENTS } = await import('../../src/utils/eventBus');
    eventBus.publish(TENANT_EVENTS.DATASOURCE_CHANGED, {
      tenantId: 't1',
      before: { dedicated: true, datasourceUrl: URL1 },
      after: { dedicated: true, datasourceUrl: URL2 },
      changedAt: new Date().toISOString(),
      reason: 'admin_update',
    });

    // Allow listener microtask to run and eviction to occur
    await new Promise(r => setTimeout(r, 0));

    // Grabbing the URL1 client again should create a NEW instance (old one evicted)
    const c1After = getDedicatedPrisma(URL1);
    expect(c1After).toBeDefined();
    expect(c1After).not.toBe(c1);
  });
});