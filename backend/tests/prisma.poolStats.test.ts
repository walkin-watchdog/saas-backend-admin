describe('prisma pool stats', () => {
  it('exposes shared and dedicated caps from env', async () => {
    jest.resetModules();
    process.env.PRISMA_POOL_MAX = '5';
    process.env.DEDICATED_PRISMA_POOL_MAX = '7';

    const { getPrismaPoolStats } = await import('../src/utils/prisma');
    const stats = getPrismaPoolStats();

    expect(stats.sharedCap).toBe(5);
    expect(stats.dedicatedCap).toBe(7);
    // dedicatedClients starts at 0 in a fresh process
    expect(typeof stats.dedicatedClients).toBe('number');
    expect(stats.dedicatedClients).toBeGreaterThanOrEqual(0);
  });
});