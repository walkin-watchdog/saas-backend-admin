type RedisClientType = any;
import { getRedisClient } from './redisClient';

// Sliding window settings
const WINDOW_SEC = Number(process.env.AUTH_FAIL_WINDOW_SEC || 900); // 15 minutes
const BACKOFF_THRESHOLD = Number(process.env.AUTH_BACKOFF_THRESHOLD || 5);
const BACKOFF_BASE_SEC = Number(process.env.AUTH_BACKOFF_BASE_SEC || 1);
const BACKOFF_MAX_SEC = Number(process.env.AUTH_BACKOFF_MAX_SEC || 60);
const SOFT_LOCK_THRESHOLD = Number(process.env.AUTH_SOFT_LOCK_THRESHOLD || 20);
const SOFT_LOCK_MS = Number(process.env.AUTH_SOFT_LOCK_MS || 5 * 60 * 1000);
const CAPTCHA_THRESHOLD = Number(process.env.AUTH_CAPTCHA_THRESHOLD || 3);

async function getClient(): Promise<RedisClientType | null> {
  return await getRedisClient();
}

function makeKey(tenantId: string, userKey: string, ip: string) {
  return `auth:fail:${tenantId}:${userKey}:${ip}`;
}

function makeUserKey(tenantId: string, userKey: string) {
  return `auth:fail:${tenantId}:${userKey}:_all`;
}

function lockKey(tenantId: string, userKey: string) {
  return `auth:lock:${tenantId}:${userKey}`;
}

export async function needsCaptcha(
  tenantId: string,
  userKey: string,
  ip: string,
): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  const keyIp = makeKey(tenantId, userKey, ip);
  const keyUser = makeUserKey(tenantId, userKey);
  const now = Date.now();
  const winMs = WINDOW_SEC * 1000;
  // prune both
  await client.zRemRangeByScore(keyIp, 0, now - winMs);
  await client.zRemRangeByScore(keyUser, 0, now - winMs);
  // Username-wide threshold (across IPs)
  const [userCount, ipCount] = await Promise.all([
    client.zCard(keyUser),
    client.zCard(keyIp),
  ]);
  return userCount >= CAPTCHA_THRESHOLD || ipCount >= CAPTCHA_THRESHOLD;
}

export async function checkSoftLock(tenantId: string, userKey: string): Promise<number | null> {
  const client = await getClient();
  if (!client) return null;
  const ttl = await client.pTTL(lockKey(tenantId, userKey));
  return ttl > 0 ? Math.ceil(ttl / 1000) : null;
}

export async function clearFailures(tenantId: string, userKey: string, ip: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  await client.del(makeKey(tenantId, userKey, ip));
  await client.del(makeUserKey(tenantId, userKey));
  await client.del(lockKey(tenantId, userKey));
}

export async function recordFailure(
  tenantId: string,
  userKey: string,
  ip: string
): Promise<{ delay: number; locked: boolean }> {
  const client = await getClient();
  if (!client) {
    // Without Redis, fall back to no-delay behaviour
    return { delay: 0, locked: false };
  }
  const key = makeKey(tenantId, userKey, ip);
  const keyUser = makeUserKey(tenantId, userKey);
  const now = Date.now();
  const winMs = WINDOW_SEC * 1000;
  const multi = client.multi();
  // update per-IP
  multi.zRemRangeByScore(key, 0, now - winMs);
  multi.zAdd(key, { score: now, value: now.toString() });
  multi.expire(key, WINDOW_SEC + 60);
  // update per-user (username-wide)
  multi.zRemRangeByScore(keyUser, 0, now - winMs);
  multi.zAdd(keyUser, { score: now, value: now.toString() });
  multi.expire(keyUser, WINDOW_SEC + 60);
  multi.zCard(keyUser);
  const res = await multi.exec();
  // zCard result index: last queued command (zCard on keyUser)
  let usernameCount: number;
  const lastResult = res?.[res.length - 1];
  if (typeof lastResult === 'number') {
    usernameCount = lastResult;
  } else {
    // Fallback to direct call if multi result is not a number
    usernameCount = await client.zCard(keyUser);
  }
  if (usernameCount >= SOFT_LOCK_THRESHOLD) {
    await client.set(lockKey(tenantId, userKey), '1', { PX: SOFT_LOCK_MS });
    return { delay: SOFT_LOCK_MS / 1000, locked: true };
  }
  if (usernameCount >= BACKOFF_THRESHOLD) {
    const excess = usernameCount - BACKOFF_THRESHOLD;
    const delay = Math.min(
      BACKOFF_MAX_SEC,
      BACKOFF_BASE_SEC * Math.pow(2, excess)
    );
    return { delay, locked: false };
  }
  return { delay: 0, locked: false };
}