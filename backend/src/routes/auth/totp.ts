import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { generateSecret, otpauthURL, verifyTOTP } from '../../utils/totp';
import { EncryptionService } from '../../utils/encryption';
import { UserService } from '../../services/userService';
import { getTenantPrisma, TenantRequest } from '../../middleware/tenantMiddleware';
import type { NextFunction, Response } from 'express';
import { getRedisClient } from '../../utils/redisClient';
import { retryInteractiveTx } from '../../utils/txRetry';

const router = express.Router();

export const require2FA = new Set<string>();
// export const recent2FASecret = new Map<string, string>();

/**
 * Ephemeral cache for "just-verified" TOTP secrets to allow the very first
 * 2FA-gated login to succeed before eventual consistency writes are visible.
 * Items auto-expire after a short TTL (10 minutes).
 */
type EphemeralSecret = { secret: string; expiresAt: number };
export const recent2FASecret = new Map<string, EphemeralSecret>();
const RECENT_2FA_TTL_MS = 10 * 60 * 1000;

export function setRecent2FASecret(userId: string, secret: string, ttlMs = RECENT_2FA_TTL_MS): void {
  recent2FASecret.set(userId, { secret, expiresAt: Date.now() + ttlMs });
}

export function getRecent2FASecret(userId: string): string | null {
  const rec = recent2FASecret.get(userId);
  if (!rec) return null;
  if (rec.expiresAt <= Date.now()) {
    // Expired: clean up and treat as missing
    recent2FASecret.delete(userId);
    return null;
  }
  return rec.secret;
}

export function clearRecent2FASecret(userId: string): void {
  recent2FASecret.delete(userId);
}

type Pending2FA = { secret: string; expiresAt: number };
const PENDING_2FA_TTL_MS = 10 * 60 * 1000; // 10m
const pending2FA = new Map<string, Pending2FA>();
const k = (tenantId: string, userId: string) => `${tenantId}:${userId}`;

const REAUTH_TTL_MS = Number(process.env.TOTP_REAUTH_TTL_MS || 5 * 60 * 1000);
const reauthKey = (userId: string) => `auth:reauth:${userId}`;
const memReauth = new Map<string, number>(); // fallback when Redis is down

async function markReauth(userId: string): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.set(reauthKey(userId), '1', { PX: REAUTH_TTL_MS });
    return;
  }
  memReauth.set(userId, Date.now());
}

export async function hasRecentReauth(userId: string): Promise<boolean> {
  const client = await getRedisClient();
  if (client) {
    const ttl = await client.pTTL(reauthKey(userId));
    return ttl > 0;
  }
  const ts = memReauth.get(userId);
  if (!ts) return false;
  if (Date.now() - ts > REAUTH_TTL_MS) {
    memReauth.delete(userId);
    return false;
  }
  return true;
}

async function clearReauth(userId: string): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.del(reauthKey(userId));
  }
  memReauth.delete(userId);
}

router.post('/setup', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const user = await UserService.findUserById(req.user!.id, { includePassword: true });
    if (!user) return res.sendStatus(404);
    if (!user.password) {
      return res.status(400).json({ error: 'password_required' });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    await markReauth(req.user!.id);
    const secret = generateSecret();
    const enc = EncryptionService.encrypt(secret);
    await retryInteractiveTx(() =>
      UserService.updateUserCommitted(req.user!.id, { twoFaSecret: enc })
    );
    if (req.tenantId && req.user?.id) {
      pending2FA.set(k(req.tenantId, req.user.id), { secret, expiresAt: Date.now() + PENDING_2FA_TTL_MS });
    }
    const url = otpauthURL(req.user!.email, secret, 'SaaS');
    const qr = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(url)}`;
    res.json({ secret, qr });
  } catch (err) {
    next(err);
  }
});

/**
 * Step-up reauth endpoint: verify user's existing 2FA to mark freshness window.
 */
router.post('/reauth', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { totp, recoveryCode } = z
      .object({ totp: z.string().optional(), recoveryCode: z.string().optional() })
      .parse(req.body || {});
    const prisma = getTenantPrisma();
    const u = await prisma.user.findFirst({
      where: { id: req.user!.id, tenantId: req.tenantId! },
      select: { twoFaEnabled: true, twoFaSecret: true, twoFaRecoveryCodes: true },
    });
    if (!u?.twoFaEnabled) {
      return res.status(400).json({ error: '2FA not enabled' });
    }
    let ok = false;
    if (recoveryCode && Array.isArray(u.twoFaRecoveryCodes)) {
      for (const [idx, codeHash] of u.twoFaRecoveryCodes.entries()) {
        if (await bcrypt.compare(recoveryCode, codeHash)) {
          const updated = [...u.twoFaRecoveryCodes];
          updated.splice(idx, 1);
          await prisma.user.update({
            where: { id: req.user!.id },
            data: { twoFaRecoveryCodes: updated },
          });
          ok = true;
          break;
        }
      }
    }
    if (!ok && totp && u.twoFaSecret) {
      const secret = EncryptionService.decrypt(u.twoFaSecret);
      ok = verifyTOTP(totp, secret);
    }
    if (!ok) return res.status(401).json({ error: 'Invalid 2FA' });
    await markReauth(req.user!.id);
    res.json({ ok: true, ttlSec: Math.ceil(REAUTH_TTL_MS / 1000) });
  } catch (err) {
    next(err);
  }
});

/**
 * Require that the user has a recent MFA reauth if their account has 2FA enabled.
 */
export const requireMfaFreshness = async (req: AuthRequest & TenantRequest, res: Response, next: NextFunction) => {
  try {
    const prisma = getTenantPrisma();
    const user = await prisma.user.findFirst({
      where: { id: req.user!.id, tenantId: req.tenantId! },
      select: { twoFaEnabled: true },
    });
    if (!user?.twoFaEnabled) return next();
    if (await hasRecentReauth(req.user!.id)) return next();
    return res.status(401).json({ error: 'mfa_freshness_required' });
  } catch (e) {
    next(e);
  }
};

router.post('/verify', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    
    let inSetup = false;
    if (req.tenantId && req.user?.id) {
      const rec = pending2FA.get(k(req.tenantId, req.user.id));
      inSetup = !!(rec && rec.expiresAt > Date.now());
    }
    if (!(await hasRecentReauth(req.user!.id)) && !inSetup) {
      return res.status(401).json({ error: 'reauth_required' });
    }

    const { token } = z.object({ token: z.string() }).parse(req.body);
    const prisma = getTenantPrisma();
    const u = await prisma.user.findFirst({
      where: { id: req.user!.id, tenantId: req.tenantId! },
      select: { twoFaSecret: true },
    });
    let secret: string | null = null;
    if (u?.twoFaSecret) {
      secret = EncryptionService.decrypt(u.twoFaSecret);
    } else {
      if (req.tenantId && req.user?.id) {
        const rec = pending2FA.get(k(req.tenantId, req.user.id));
        if (rec && rec.expiresAt > Date.now()) {
          secret = rec.secret;
        } else {
          // clean up expired/missing
          pending2FA.delete(k(req.tenantId, req.user.id));
          secret = null;
        }
      } else {
        secret = null;
      }
      if (!secret) return res.status(400).json({ error: '2FA not initialized' });
    }
    if (!verifyTOTP(token, secret)) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const recovery = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    const hashed = await Promise.all(recovery.map((c) => bcrypt.hash(c, 12)));
    await retryInteractiveTx(() =>
      UserService.updateUserCommitted(
        req.user!.id,
        { twoFaEnabled: true, twoFaRecoveryCodes: hashed },
        true,
      )
    );
    require2FA.add(req.user!.id);
    setRecent2FASecret(req.user!.id, secret);
    await clearReauth(req.user!.id);
    if (req.tenantId && req.user?.id) pending2FA.delete(k(req.tenantId, req.user.id));
    res.json({ recoveryCodes: recovery });
  } catch (err) {
    next(err);
  }
});

export default router;