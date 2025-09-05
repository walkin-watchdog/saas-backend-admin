describe('external adapter circuit breaker', () => {
  jest.setTimeout(10000);
  afterEach(async () => {
    const { externalEvents } = await import('../src/utils/externalAdapter');
    externalEvents.removeAllListeners();
  });

  it('opens and closes circuit with events', async () => {
    const { externalCall, externalEvents } = await import('../src/utils/externalAdapter');
    const events: string[] = [];
    externalEvents.on('open', () => events.push('open'));
    externalEvents.on('half-open', () => events.push('half-open'));
    externalEvents.on('close', () => events.push('close'));

    await expect(
      externalCall('test', (_signal) => Promise.reject(new Error('boom')), {
        maxFailures: 1,
        resetMs: 50,
        timeoutMs: 20,
        retries: 0,
      })
    ).rejects.toThrow('boom');

    // Second call while open should throw immediately
    await expect(
      externalCall('test', (_signal) => Promise.resolve('ok'), {
        maxFailures: 1,
        resetMs: 50,
        timeoutMs: 20,
        retries: 0,
      })
    ).rejects.toThrow('Circuit breaker open');

    expect(events).toContain('open');

    // Wait for reset and ensure half-open/close after success
    await new Promise((r) => setTimeout(r, 60));
    await expect(
      externalCall('test', (_signal) => Promise.resolve('ok'), {
        maxFailures: 1,
        resetMs: 50,
        timeoutMs: 20,
        retries: 0,
      })
    ).resolves.toBe('ok');
    expect(events).toEqual(expect.arrayContaining(['half-open', 'close']));
  });

  it('isolates breakers per tenant', async () => {
    jest.resetModules();
    jest.doMock('../src/middleware/tenantMiddleware', () => ({
      getTenantId: jest.fn(() => 'A'),
    }));
    const { externalCall } = await import('../src/utils/externalAdapter');
    await expect(
      externalCall('test', (_s) => Promise.reject(new Error('boom')), {
        maxFailures: 1,
        resetMs: 1000,
        timeoutMs: 10,
        retries: 0,
      })
    ).rejects.toThrow('boom');

    jest.resetModules();
    jest.doMock('../src/middleware/tenantMiddleware', () => ({
      getTenantId: jest.fn(() => 'B'),
    }));
    const { externalCall: externalCall2 } = await import('../src/utils/externalAdapter');
    await expect(externalCall2('test', (_s) => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('times out when call ignores abort signal', async () => {
    const { externalCall } = await import('../src/utils/externalAdapter');
    await expect(
      externalCall(
        'test',
        () => new Promise((resolve) => setTimeout(resolve, 1000)),
        {
          timeoutMs: 20,
          retries: 0,
        },
      ),
    ).rejects.toThrow('Timeout');
  });
  it('logs when breaker remains open after alert window', async () => {
    jest.resetModules();
    jest.useFakeTimers();

    process.env.BREAKER_OPEN_ALERT_MS = '5';

    const errorMock = jest.fn();
    jest.doMock('../src/utils/logger', () => ({
      logger: { error: errorMock, info: jest.fn(), warn: jest.fn() },
    }));

    const { externalCall } = await import('../src/utils/externalAdapter');

    // Trip the breaker and keep it open beyond the alert window
    await expect(
      externalCall('prov', (_s) => Promise.reject(new Error('boom')), {
        maxFailures: 1, resetMs: 1000, timeoutMs: 1, retries: 0,
      }),
    ).rejects.toThrow('boom');

    jest.advanceTimersByTime(10);
    expect(errorMock).toHaveBeenCalledWith('breaker_still_open', expect.objectContaining({ provider: 'prov' }));
    jest.useRealTimers();
  });
});