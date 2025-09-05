describe('preflight breakersHealthy()', () => {
  it('returns false when any breaker remains open', async () => {
    jest.resetModules();

     // Mock default export of 'opossum' with a CircuitBreaker that supports .on()
    jest.doMock('opossum', () => ({
      __esModule: true,
      default: class CircuitBreaker {
        opened = false;
        constructor(_fn?: any, _opts?: any) {}
        on(_event: string, _handler: (...args: any[]) => void) {
          // no-op; test doesn't rely on events firing
          return this;
        }
        shutdown() {
          // no-op; matches code's dispose path
        }
      }
    }));

    const { getPreflightBreaker, breakersHealthy } = await import('../src/utils/preflight');
    const br: any = getPreflightBreaker('ds1');

    expect(breakersHealthy()).toBe(true);

    br.opened = true;
    expect(breakersHealthy()).toBe(false);
  });
});