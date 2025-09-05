describe('redisClient missing REDIS_URL warns once and increments fallback metric', () => {
  it('warns once and bumps cacheFallback only once across repeated calls', async () => {
    jest.resetModules();

    const warn = jest.fn();
    const inc = jest.fn();

    jest.doMock('../src/utils/logger', () => ({
      logger: { warn, error: jest.fn(), info: jest.fn() },
    }));
    jest.doMock('../src/utils/opMetrics', () => ({
      opMetrics: { inc },
    }));

    delete process.env.REDIS_URL;

    const { getRedisClient } = await import('../src/utils/redisClient');

    const c1 = await getRedisClient();
    const c2 = await getRedisClient();

    expect(c1).toBeNull();
    expect(c2).toBeNull();

    // Warn only once even if called repeatedly
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('redis.url_missing');

    // cacheFallback should be bumped only once for the missing URL case
    const names = inc.mock.calls.map((args: any[]) => args[0]);
    expect(names.filter((n: string) => n === 'cacheFallback')).toHaveLength(1);
  });
});