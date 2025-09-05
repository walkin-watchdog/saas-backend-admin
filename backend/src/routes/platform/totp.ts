import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticatePlatform, PlatformAuthRequest } from '../../middleware/platformAuth';
import { generateSecret, otpauthURL, verifyTOTP } from '../../utils/totp';
import { EncryptionService } from '../../utils/encryption';
import { PlatformUserService } from '../../services/platformUserService';
import { getRedisClient } from '../../utils/redisClient';

const router = express.Router();

// Reauth TTL (platform)
const PLATFORM_REAUTH_TTL_MS = Number(process.env.PLATFORM_TOTP_REAUTH_TTL_MS || 5 * 60 * 1000);
const reauthKey = (userId: string) => `auth:reauth:platform:${userId}`;
const memReauth = new Map<string, number>(); // fallback when Redis is down
async function markReauth(userId: string): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.set(reauthKey(userId), '1', { PX: PLATFORM_REAUTH_TTL_MS });
    return;
  }
  memReauth.set(userId, Date.now());
}
export async function hasPlatformRecentReauth(userId: string): Promise<boolean> {
  const client = await getRedisClient();
  if (client) {
    const ttl = await client.pTTL(reauthKey(userId));
    return ttl > 0;
  }
  const ts = memReauth.get(userId);
  if (!ts) return false;
  if (Date.now() - ts > PLATFORM_REAUTH_TTL_MS) {
    memReauth.delete(userId);
    return false;
  }
  return true;
}
export const requirePlatformMfaFreshness = async (req: PlatformAuthRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const user = await PlatformUserService.findUserById(req.platformUser!.id);
    const enabled = Boolean((user as any)?.mfaEnabled ?? (user as any)?.mfaVerifiedAt);
    if (!enabled) return next();
    if (await hasPlatformRecentReauth(req.platformUser!.id)) return next();
    return res.status(401).json({ error: 'mfa_freshness_required' });
  } catch (e) {
    return next(e);
  }
};

// Generate a new secret and return otpauth url
router.post('/setup', authenticatePlatform, async (req: PlatformAuthRequest, res, next) => {
  try {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const user = await PlatformUserService.findUserById(req.platformUser!.id, { includePassword: true });
    if (!user?.passwordHash) return res.status(400).json({ error: 'password_required' });
    const ok = await PlatformUserService.verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });

    const secret = generateSecret();
    const enc = EncryptionService.encrypt(secret);
    await PlatformUserService.updateUser(req.platformUser!.id, { twoFaSecret: enc });
    const url = otpauthURL(user.email, secret, 'SaaS Platform');
    const qr = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(url)}`;
    res.json({ secret, qr });
  } catch (err) {
    next(err);
  }
});

// Step-up reauth endpoint: verify existing 2FA and mark freshness
router.post('/reauth', authenticatePlatform, async (req: PlatformAuthRequest, res, next) => {
  try {
    const { totp, recoveryCode } = z.object({ totp: z.string().optional(), recoveryCode: z.string().optional() }).parse(req.body || {});
    const user = await PlatformUserService.findUserById(req.platformUser!.id);
    if (!user || !(user as any).mfaEnabled) return res.status(400).json({ error: '2FA not enabled' });
    let ok = false;
    if (recoveryCode && user.twoFaRecoveryCodes) {
      for (const [idx, hash] of user.twoFaRecoveryCodes.entries()) {
        if (await bcrypt.compare(recoveryCode, hash)) {
          const updated = [...user.twoFaRecoveryCodes];
          updated.splice(idx, 1);
          await PlatformUserService.updateUser(req.platformUser!.id, { twoFaRecoveryCodes: updated });
          ok = true;
          break;
        }
      }
    }
    if (!ok && totp && user.twoFaSecret) {
      const secret = EncryptionService.decrypt(user.twoFaSecret);
      ok = verifyTOTP(totp, secret);
    }
    if (!ok) return res.status(401).json({ error: 'Invalid 2FA' });
    await markReauth(req.platformUser!.id);
    res.json({ ok: true, ttlSec: Math.ceil(PLATFORM_REAUTH_TTL_MS / 1000) });
  } catch (err) {
    next(err);
  }
});

router.post('/enable', authenticatePlatform, async (req: PlatformAuthRequest, res, next) => {
  try {
    const { totp } = z.object({ totp: z.string() }).parse(req.body);
    const user = await PlatformUserService.findUserById(req.platformUser!.id);
    if (!user?.twoFaSecret) return res.status(400).json({ error: 'setup_required' });
    const secret = EncryptionService.decrypt(user.twoFaSecret);
    if (!verifyTOTP(totp, secret)) return res.status(401).json({ error: 'Invalid 2FA' });

    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    const hashed = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
    await PlatformUserService.updateUser(req.platformUser!.id, {
      mfaEnabled: true,
      twoFaRecoveryCodes: hashed,
    });
    res.json({ recoveryCodes: codes });
  } catch (err) {
    next(err);
  }
});

router.post('/disable', authenticatePlatform, async (req: PlatformAuthRequest, res, next) => {
  try {
    const { password, totp, recoveryCode } = z
      .object({ password: z.string(), totp: z.string().optional(), recoveryCode: z.string().optional() })
      .parse(req.body);
    const user = await PlatformUserService.findUserById(req.platformUser!.id, { includePassword: true });
    if (!user?.passwordHash) return res.status(400).json({ error: 'password_required' });
    const ok = await PlatformUserService.verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });

    let verified = false;
    if (recoveryCode && user.twoFaRecoveryCodes) {
      for (const [idx, hash] of user.twoFaRecoveryCodes.entries()) {
        if (await bcrypt.compare(recoveryCode, hash)) {
          const updated = [...user.twoFaRecoveryCodes];
          updated.splice(idx, 1);
          await PlatformUserService.updateUser(req.platformUser!.id, { twoFaRecoveryCodes: updated });
          verified = true;
          break;
        }
      }
    }
    if (!verified && totp && user.twoFaSecret) {
      const secret = EncryptionService.decrypt(user.twoFaSecret);
      verified = verifyTOTP(totp, secret);
    }
    if (!verified) return res.status(401).json({ error: 'Invalid 2FA' });

    await PlatformUserService.updateUser(req.platformUser!.id, {
      mfaEnabled: false,
      twoFaSecret: null,
      twoFaRecoveryCodes: [],
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;