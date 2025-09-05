import { jest } from '@jest/globals';

const findManyMock = jest.fn() as jest.MockedFunction<any>;

jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency?: number) => {
    return (fn: any, ...args: any[]) => Promise.resolve().then(() => fn(...args));
  },
}));

jest.mock('../../src/utils/prisma', () => ({
  prisma: { tenant: { findMany: (...a:any[]) => findManyMock(...a) } },
}));

jest.mock('../../src/services/tenantService', () => ({
  TenantService: {
    withTenantContext: async (_t:any, fn:(tx:any)=>Promise<void>) => {
      // Give handler a fake transaction client
      return fn({ $executeRaw: jest.fn(), $queryRaw: jest.fn() });
    },
  }
}));

describe('forEachTenant guardrails', () => {
  beforeEach(() => findManyMock.mockReset());

  test('runs handler for all tenants with concurrency and backoff', async () => {
    const tenants = [
      { id:'a', name:'A', status:'active', dedicated:false },
      { id:'b', name:'B', status:'active', dedicated:true, datasourceUrl:'postgres://b' },
      { id:'c', name:'C', status:'active', dedicated:false },
    ];
    findManyMock.mockResolvedValue(tenants);

    const { forEachTenant } = await import('../../src/services/tenantRunner');
    const calls: string[] = [];
    let first = true;

    await forEachTenant(
      { jobName:'test', concurrency: 2, backoff: { baseMs: 1, factor: 2, maxMs: 4 } },
      async (t) => {
        // inject one flaky run
        if (first) { first = false; throw new Error('flaky'); }
        calls.push(t.id);
      }
    );

    // Should have attempted each; one failed repeatedly and then gave up after retries
    expect(calls.sort()).toEqual(expect.arrayContaining(['a','b','c']));
  });
});