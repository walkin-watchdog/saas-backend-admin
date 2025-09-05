import { opMetrics } from '../../src/utils/opMetrics';

describe('opMetrics snapshot & counters', () => {
  test('counters and percentiles are computed', () => {
    opMetrics.inc('cacheHit', 2);
    opMetrics.inc('cacheMiss', 1);
    opMetrics.observePreflight(100);
    opMetrics.observePreflight(300);
    opMetrics.observePreflight(50);

    const snap = opMetrics.snapshot();
    expect(snap.cacheHit).toBeGreaterThanOrEqual(2);
    expect(snap.cacheMiss).toBeGreaterThanOrEqual(1);
    expect(snap.preflightMs.length).toBeGreaterThanOrEqual(3);
    expect(snap.preflightP50).toBeGreaterThanOrEqual(50);
    expect(snap.preflightP95).toBeGreaterThanOrEqual(100);
  });
});