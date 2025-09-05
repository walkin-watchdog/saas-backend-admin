import { EventEmitter } from 'events';
import { getTenantId } from '../middleware/tenantMiddleware';
import {
  hashTenantId,
  externalBreakerOpen,
  externalBreakerClose,
  externalBreakerHalfOpen,
  externalBreakerOpenGauge,
  externalBreakerStillOpen,
} from './metrics';
import { logger } from './logger';

interface BreakerOptions {
  timeoutMs?: number;
  maxFailures?: number;
  resetMs?: number;
  retries?: number;
  key?: string; // additional scope key e.g. credential hash
}

type ResolvedBreakerOptions = Required<Omit<BreakerOptions, 'key'>> & Pick<BreakerOptions, 'key'>;

interface BreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  nextAttempt: number; // timestamp ms
  opts: ResolvedBreakerOptions;
}

interface BreakerEvent {
  provider: string;
  tenantId: string;
  key?: string;
}

type BreakerEvents = {
  open: [BreakerEvent];
  'half-open': [BreakerEvent];
  close: [BreakerEvent];
};

const DEFAULT_OPTS: ResolvedBreakerOptions = {
  timeoutMs: 5000,
  maxFailures: 5,
  resetMs: 30_000,
  retries: 2,
};

const states = new Map<string, BreakerState>();
const OPEN_ALERT_MS = Number(process.env.BREAKER_OPEN_ALERT_MS ?? 60_000);

export const externalEvents = new EventEmitter<BreakerEvents>();

externalEvents.on('open', ({ provider, tenantId, key: stateKey }) => {
  const labels = { provider, tenant: hashTenantId(tenantId) };
  externalBreakerOpen.inc(labels);
  externalBreakerOpenGauge.set(labels, 1);
  setTimeout(() => {
    const st = stateKey ? states.get(stateKey) : undefined;
    if (st?.state === 'open') {
      externalBreakerStillOpen.inc(labels);
      logger.error('breaker_still_open', { provider, tenantId });
    }
  }, OPEN_ALERT_MS);
});
externalEvents.on('half-open', ({ provider, tenantId }) => {
  const labels = { provider, tenant: hashTenantId(tenantId) };
  externalBreakerHalfOpen.inc(labels);
  externalBreakerOpenGauge.set(labels, 0);
});
externalEvents.on('close', ({ provider, tenantId }) => {
  const labels = { provider, tenant: hashTenantId(tenantId) };
  externalBreakerClose.inc(labels);
  externalBreakerOpenGauge.set(labels, 0);
});

export async function externalCall<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: BreakerOptions = {},
): Promise<T> {
  const tenantId = getTenantId() || 'unknown';
  const key = [name, tenantId, options.key].filter(Boolean).join(':');

  let state = states.get(key);
  if (!state) {
    state = { state: 'closed', failures: 0, nextAttempt: 0, opts: { ...DEFAULT_OPTS, ...options } };
    states.set(key, state);
  } else {
    state.opts = { ...DEFAULT_OPTS, ...options };
  }
  const { timeoutMs, maxFailures, resetMs, retries } = state.opts;

  if (state.state === 'open') {
    if (Date.now() < state.nextAttempt) {
      const err = new Error('Circuit breaker open');
      (err as any).provider = name;
      (err as any).tenantId = tenantId;
      throw err;
    }
    state.state = 'half-open';
    externalEvents.emit('half-open', { provider: name, tenantId });
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Timeout'));
      }, timeoutMs);
    });
    const call = fn(controller.signal);
    call.catch(() => {});
    try {
      const result = await Promise.race([call, timeoutPromise]);
      if (timer) clearTimeout(timer);
      state.failures = 0;
      if (state.state !== 'closed') {
        state.state = 'closed';
        externalEvents.emit('close', { provider: name, tenantId });
      }
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastErr = err;
      state.failures++;
      if (state.failures >= maxFailures) {
        state.state = 'open';
        state.nextAttempt = Date.now() + resetMs;
        externalEvents.emit('open', { provider: name, tenantId, key });
      }
      if (attempt < retries) continue;
      break;
    }
  }
  const error = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  (error as any).provider = name;
  (error as any).tenantId = tenantId;
  throw error;
}

