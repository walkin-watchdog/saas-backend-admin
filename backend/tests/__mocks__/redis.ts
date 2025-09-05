import { broker } from './redis-broker';

/**
 * Minimal in-memory Redis mock that supports:
 * - pub/sub used by CacheService: publish, pSubscribe
 * - KV + TTL used by loginBackoff: set(PX), del, pTTL
 * - Sorted sets used by loginBackoff: zAdd, zRemRangeByScore, zCard
 * - Simple multi/exec pipeline returning results array
 */
type ZItem = { score: number; value: string };

const kv = new Map<string, { value: string; expiresAt?: number }>();
const zsets = new Map<string, ZItem[]>();
const zttl = new Map<string, number>(); // expire() for zsets (seconds -> ms)

function now() { return Date.now(); }

function cleanExpiredKey(key: string) {
  const entry = kv.get(key);
  if (entry?.expiresAt && entry.expiresAt <= now()) {
    kv.delete(key);
  }
}

function cleanExpiredZKey(key: string) {
  const exp = zttl.get(key);
  if (typeof exp === 'number' && exp <= now()) {
    zsets.delete(key);
    zttl.delete(key);
  }
}

function zensure(key: string): ZItem[] {
  cleanExpiredZKey(key);
  let arr = zsets.get(key);
  if (!arr) {
    arr = [];
    zsets.set(key, arr);
  }
  return arr;
}

export const createClient = () => {
  const client = {
    // ---- lifecycle / events
    on: () => void 0,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),

    // ---- pub/sub (used by CacheService)
    publish: jest.fn((channel: string, message: string) => {
      broker.publish(channel, message);
      return Promise.resolve(undefined);
    }),
    pSubscribe: jest.fn((pattern: string, handler: (msg: string, ch: string) => void) => {
      broker.pSubscribe(pattern, handler);
      return Promise.resolve(undefined);
    }),

    // ---- KV + TTL (used by loginBackoff soft-lock)
    async set(key: string, value: string, opts?: { PX?: number }) {
      const entry: { value: string; expiresAt?: number } = { value };
      if (opts?.PX && opts.PX > 0) {
        entry.expiresAt = now() + opts.PX;
      }
      kv.set(key, entry);
      return 'OK' as const;
    },

    async del(key: string) {
      const hadKv = kv.delete(key) ? 1 : 0;
      const hadZ = zsets.delete(key) ? 1 : 0;
      zttl.delete(key);
      return hadKv + hadZ;
    },

    async pTTL(key: string) {
      cleanExpiredKey(key);
      const entry = kv.get(key);
      if (!entry) return -2; // key does not exist
      if (!entry.expiresAt) return -1; // exists, no TTL
      const remaining = entry.expiresAt - now();
      return remaining > 0 ? remaining : -2;
    },

    // ---- Sorted sets (used by loginBackoff sliding window)
    async zAdd(key: string, item: { score: number; value: string }) {
      const arr = zensure(key);
      // replace existing value if present
      const idx = arr.findIndex((i: any) => i.value === item.value);
      if (idx >= 0) {
        arr[idx] = { score: item.score, value: item.value };
      } else {
        arr.push({ score: item.score, value: item.value });
      }
      return 1;
    },

    async zRemRangeByScore(key: string, min: number, max: number) {
      const arr = zensure(key);
      const before = arr.length;
      // keep only items with score < min or > max
      const kept = arr.filter((i: any) => i.score < min || i.score > max);
      zsets.set(key, kept);
      return before - kept.length;
    },

    async zCard(key: string) {
      cleanExpiredZKey(key);
      const arr = zsets.get(key);
      return arr ? arr.length : 0;
    },

    async expire(key: string, seconds: number) {
      if (zsets.has(key)) {
        zttl.set(key, now() + seconds * 1000);
        return 1;
      }
      // emulate Redis semantics: EXPIRE on non-existing key returns 0
      return 0;
    },

    // ---- Simple MULTI/EXEC pipeline
    multi() {
      const results: Array<() => Promise<any>> = [];

      const pipe = {
        zRemRangeByScore: (key: string, min: number, max: number) => {
          results.push(() => client.zRemRangeByScore(key, min, max));
          return pipe;
        },
        zAdd: (key: string, item: { score: number; value: string }) => {
          results.push(() => client.zAdd(key, item));
          return pipe;
        },
        expire: (key: string, seconds: number) => {
          results.push(() => client.expire(key, seconds));
          return pipe;
        },
        zCard: (key: string) => {
          results.push(() => client.zCard(key));
          return pipe;
        },
        exec: async () => {
          const out: any[] = [];
          for (const fn of results) {
            // run sequentially to preserve order
            // eslint-disable-next-line no-await-in-loop
            out.push(await fn());
          }
          return out;
        },
      };

      return pipe;
    },
  };

  return client;
};