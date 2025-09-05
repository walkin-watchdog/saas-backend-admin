import { PrismaClient } from '@prisma/client';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';
import { getRedisClient } from './redisClient';

export interface BlacklistEntry {
  tenantId: string;
  userId: string;
  jti: string;
  exp: Date;
}

export interface FamilyBlacklistEntry {
  tenantId: string;
  userId: string;
  familyId: string;
  exp: Date;
}

function prisma(): PrismaClient {
  return getTenantPrisma();
}

const mem = new Map<string, number>();
const key = (tenantId: string, userId: string, jti: string) => `${tenantId}:${userId}:${jti}`;
const familyKey = (tenantId: string, userId: string, fid: string) => `${tenantId}:${userId}:${fid}`;
const memFamily = new Map<string, number>();
const REFRESH_FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days default TTL

// Track last prune per-tenant to avoid running a prune on every request.
const lastPruneByTenant = new Map<string, number>();
const ONE_HOUR_MS = 60 * 60 * 1000;

function pruneMemNow() {
  const now = Date.now();
  for (const [k, expiresAt] of mem.entries()) {
    if (expiresAt <= now) mem.delete(k);
  }
  for (const [k, expiresAt] of memFamily.entries()) {
    if (expiresAt <= now) memFamily.delete(k);
  }
}

// Light periodic in-process prune to keep memory bounded (no tenant context needed)
setInterval(pruneMemNow, 5 * 60 * 1000).unref?.();

async function pruneDbIfDue(): Promise<void> {
  const tenantId = getTenantId();
  if (!tenantId) return; // No tenant context; skip.
  const now = Date.now();
  const last = lastPruneByTenant.get(tenantId) ?? 0;
  if (now - last < ONE_HOUR_MS) return;
  lastPruneByTenant.set(tenantId, now);
  // Uses @@index([exp]) for efficient pruning
  await prisma().refreshTokenBlacklist.deleteMany({
    where: { exp: { lt: new Date() } },
  });
  // Also prune memory map
  pruneMemNow();
}

export async function addToBlacklist(entry: BlacklistEntry): Promise<void> {
  await pruneDbIfDue();
  mem.set(key(entry.tenantId, entry.userId, entry.jti), entry.exp.getTime());
  if (entry.userId.startsWith('impersonation:')) {
    // Impersonation tokens don't have a corresponding user record, so the
    // foreign key would fail. We still track in-memory but skip the DB insert.
    return;
  }
  await prisma().refreshTokenBlacklist.create({ data: entry });
}

export async function isBlacklisted(tenantId: string, userId: string, jti: string): Promise<boolean> {
  await pruneDbIfDue();
  const k = key(tenantId, userId, jti);
  const expiresAt = mem.get(k);
  if (expiresAt) {
    if (expiresAt > Date.now()) return true;
    mem.delete(k);
  }
  const found = await prisma().refreshTokenBlacklist.findFirst({
    where: { tenantId, userId, jti, exp: { gt: new Date() } },
  });
  if (found) {
    mem.set(k, found.exp.getTime());
    return true;
  }
  return false;
}

/**
 * Mark an entire refresh family as blacklisted (e.g., on RT reuse).
 * Redis-backed with in-process fallback to keep behaviour consistent without Redis.
 */
export async function addFamilyToBlacklist(entry: FamilyBlacklistEntry): Promise<void> {
  const k = familyKey(entry.tenantId, entry.userId, entry.familyId);
  const ttlMs = Math.max(0, entry.exp.getTime() - Date.now());
  const exp = ttlMs > 0 ? ttlMs : REFRESH_FAMILY_TTL_MS;
  // mem fallback
  memFamily.set(k, Date.now() + exp);
  try {
    const client = await getRedisClient();
    if (client) {
      // value doesn't matter; use PX for TTL
      await client.set(`auth:rtfam:blacklist:${k}`, '1', { PX: exp });
    }
  } catch {
    // ignore; fallback already set
  }
}

export async function isFamilyBlacklisted(tenantId: string, userId: string, familyId: string): Promise<boolean> {
  const k = familyKey(tenantId, userId, familyId);
  const memExp = memFamily.get(k);
  if (memExp) {
    if (memExp > Date.now()) return true;
    memFamily.delete(k);
  }
  try {
    const client = await getRedisClient();
    if (client) {
      const v = await client.get(`auth:rtfam:blacklist:${k}`);
      if (v) return true;
    }
  } catch {
    // ignore
  }
  return false;
}