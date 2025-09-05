const prismaMock = { $transaction: jest.fn() };
jest.mock('../src/utils/prisma', () => ({
  prisma: prismaMock,
  getDedicatedPrisma: jest.fn(() => prismaMock),
}));
jest.mock('../src/middleware/tenantMiddleware', () => ({
  tenantContext: { run: (_ctx: any, fn: any) => Promise.resolve(fn()) },
}));
jest.mock('prom-client', () => ({
  Counter: jest.fn(),
  Histogram: jest.fn(),
  Registry: jest.fn(),
  collectDefaultMetrics: jest.fn(),
}));

import { TenantService } from '../src/services/tenantService';

describe('TenantService.withTenantContext retry', () => {
  it('retries interactive transaction start timeouts', async () => {
    const txClient = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
    (prismaMock.$transaction as jest.Mock)
      .mockRejectedValueOnce(Object.assign(new Error('Timed out fetching a new connection'), { code: 'P2024' }))
      .mockImplementationOnce(async (cb: any) => cb(txClient));

    const fn = jest.fn().mockResolvedValue('ok');
    const tenant = { id: 't1', dedicated: false } as any;

    const result = await TenantService.withTenantContext(tenant, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });
});