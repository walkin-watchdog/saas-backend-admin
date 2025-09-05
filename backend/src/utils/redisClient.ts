import { createClient } from 'redis';
type RedisClientType = any;
import { opMetrics } from './opMetrics';
import { logger } from './logger';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
let warnedMissingUrl = false;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (client) return client;
  if (connecting) return connecting;
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedMissingUrl) {
      logger.warn('redis.url_missing');
      opMetrics.inc('cacheFallback');
      warnedMissingUrl = true;
    }
    return null;
  }
  connecting = (async () => {
    try {
      const c = createClient({
        url,
        socket: {
          reconnectStrategy: (retries: number) => Math.min(retries * 50, 500)
        },
        RESP: 2
      });
      c.on('error', (err: Error) => {
        logger.error('redis.error', { err: (err as any)?.message });
      });
      await c.connect();
      client = c;
      return c;
    } catch (err) {
      logger.warn('redis.connect_failed', { error: (err as any)?.message });
      opMetrics.inc('cacheFallback');
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

export async function redisQuit(): Promise<void> {
  if (client) {
    try { await client.quit(); } catch {}
    client = null;
  }
}