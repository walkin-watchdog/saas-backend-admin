import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { PlatformUserService } from '../../services/platformUserService';
import { PlatformSessionService } from '../../services/platformSessionService';
import { AuditService } from '../../services/auditService';
import { authenticatePlatform, PlatformAuthRequest } from '../../middleware/platformAuth';
import totpRoutes from './totp';
import oauthRoutes from './oauth';
import { PlatformAuthService } from '../../services/platformAuthService';
import { allowedOriginsSet } from '../../utils/allowedOrigins';
import { platformLoginIpLimiter, platformLoginIdLimiter, platformRefreshLimiter } from '../../middleware/platformRateLimit';
import { realIp } from '../../middleware/rateLimit';
import { requirePlatformMfaFreshness, hasPlatformRecentReauth } from './totp';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../utils/platformEvents';
import { platformInviteAcceptLimiter } from '../../middleware/platformRateLimit';

const router = express.Router();
router.use('/2fa', totpRoutes);
router.use('/oauth', oauthRoutes);

// In-process per-IP sliding minute window for fast brute-force signaling (parity with tenant)
const ipFailures = new Map<string, number[]>();
const ipLastSignal = new Map<string, number>();
function trackIpFailure(ip: string) {
  const now = Date.now();
  const arr = ipFailures.get(ip) || [];
  const recent = arr.filter(ts => now - ts < 60_000);
  recent.push(now);
  ipFailures.set(ip, recent);
  if (recent.length >= 10) {
    const last = ipLastSignal.get(ip) || 0;
    if (now - last >= 60_000) {
      PlatformEventBus.publish(PLATFORM_EVENTS.AUTH_BRUTE_FORCE_DETECTED, { ip });
      ipLastSignal.set(ip, now);
    }
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  mfaCode: z.string().optional(),
  recoveryCode: z.string().optional(),
  captcha: z.string().optional(),
});

const inviteAcceptSchema = z.object({
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Invalid token'),
  name: z.string().min(1),
  password: z.string().min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

// Platform Admin Login
router.post('/login', platformLoginIpLimiter, platformLoginIdLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await PlatformAuthService.login(req as PlatformAuthRequest, body);
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    res.cookie('platform_rt', result.refresh, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    const csrf = crypto.randomBytes(20).toString('hex');
    res.cookie('platform_csrf', csrf, {
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({
      access: result.access,
      user: { ...result.user, status: result.user.status },
      csrfToken: csrf,
    });
  } catch (error) {
    const e = error as any;
    const message = (e as Error).message;
    // Signal per-IP failures for brute-force detection parity
    trackIpFailure(realIp(req));
    if (typeof e?.retryAfterSec === 'number') {
      res.setHeader('Retry-After', String(Math.ceil(e.retryAfterSec)));
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    }
    if (e?.status && typeof e.status === 'number') {
      return res.status(e.status).json({ error: message });
    }
    if (message === 'Captcha verification failed') return res.status(400).json({ error: message });
    if (message === 'Access denied from this IP address') return res.status(403).json({ error: message });
    if (['Invalid credentials', 'Invalid username', 'Account disabled', 'Invalid MFA code', 'Password not set. Please use invite link.'].includes(message)) {
      // On soft lock parity, surface 423 if provided
      if (e?.locked) return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
      return res.status(401).json({ error: message });
    }
    next(error);
  }
});

// Platform Admin Refresh Token
router.post('/refresh', platformRefreshLimiter, async (req, res) => {
  try {
    // Origin/Referer allowlist (defense-in-depth, mirrors tenant)
    const origin = req.headers.origin as string | undefined;
    const referer = req.headers.referer as string | undefined;
    if (origin && !allowedOriginsSet.has(origin)) {
      await AuditService.log({ action: 'platform.auth.refresh_denied', ipAddress: realIp(req), reason: 'bad_origin' });
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!origin && referer) {
      try {
        const r = new URL(referer);
        if (!allowedOriginsSet.has(`${r.protocol}//${r.host}`)) {
          await AuditService.log({ action: 'platform.auth.refresh_denied', ipAddress: realIp(req), reason: 'bad_referer' });
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch {
        await AuditService.log({ action: 'platform.auth.refresh_denied', ipAddress: realIp(req), reason: 'malformed_referer' });
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    // CSRF check (cookie vs header)
    const csrfCookie = req.cookies.platform_csrf;
    const csrfHeader = req.header('x-csrf-token');
    if (!csrfCookie || csrfCookie !== csrfHeader) {
      await AuditService.log({ action: 'platform.auth.refresh_failed', ipAddress: realIp(req), reason: 'csrf_mismatch' });
      return res.status(403).json({ error: 'Forbidden' });
    }
    const token = req.cookies.platform_rt;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }
    const { access, refresh } = await PlatformAuthService.refresh(token, realIp(req));
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    res.cookie('platform_rt', refresh, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // rotate CSRF alongside refresh
    const newCsrf = crypto.randomBytes(20).toString('hex');
    res.cookie('platform_csrf', newCsrf, {
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ access, csrfToken: newCsrf });
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
});

// Platform Admin Logout
router.post('/logout', authenticatePlatform, async (req: PlatformAuthRequest, res) => {
  // Origin/Referer allowlist and CSRF checks (align with refresh)
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin && !allowedOriginsSet.has(origin)) {
    await AuditService.log({ platformUserId: req.platformUser?.id, action: 'platform.auth.logout_denied', ipAddress: realIp(req), reason: 'bad_origin' });
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!origin && referer) {
    try {
      const r = new URL(referer);
      if (!allowedOriginsSet.has(`${r.protocol}//${r.host}`)) {
        await AuditService.log({ platformUserId: req.platformUser?.id, action: 'platform.auth.logout_denied', ipAddress: realIp(req), reason: 'bad_referer' });
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch {
      await AuditService.log({ platformUserId: req.platformUser?.id, action: 'platform.auth.logout_denied', ipAddress: realIp(req), reason: 'malformed_referer' });
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const csrfCookie = (req as any).cookies?.platform_csrf;
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || csrfCookie !== csrfHeader) {
    await AuditService.log({ platformUserId: req.platformUser?.id, action: 'platform.auth.logout_failed', ipAddress: realIp(req), reason: 'csrf_mismatch' });
    return res.status(403).json({ error: 'Forbidden' });
  }
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  
  res.clearCookie('platform_rt', {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure
  });

  res.clearCookie('platform_csrf', {
    httpOnly: false,
    sameSite: 'strict',
    secure: isSecure
  });

  if (req.platformSessionJti) {
    await PlatformSessionService.revoke(req.platformSessionJti);
  }

  await AuditService.log({
    platformUserId: req.platformUser?.id,
    action: 'platform.auth.logout',
    ipAddress: realIp(req)
  });

  res.status(204).send();
});

// Revoke all sessions for current user
router.post('/revoke-sessions', authenticatePlatform, async (req: PlatformAuthRequest, res) => {
  await PlatformSessionService.revokeAllForUser(req.platformUser!.id);
  res.status(204).send();
});

// Accept Platform Invite
router.post('/accept-invite', platformInviteAcceptLimiter, async (req, res, next) => {
  try {
    const { token, name, password } = inviteAcceptSchema.parse(req.body);
    
    const passwordHash = await PlatformUserService.hashPassword(password);
    const user = await PlatformUserService.acceptInvite(token, {
      name,
      passwordHash
    });

    await AuditService.log({
      platformUserId: user.id,
      action: 'platform.user.invite_accepted',
      ipAddress: realIp(req)
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    next(error);
  }
});

// Change Password (requires recent MFA reauth)
router.post('/change-password', authenticatePlatform, requirePlatformMfaFreshness, async (req: PlatformAuthRequest, res, next) => {
  try {
    // Defense-in-depth: re-check MFA freshness here again to avoid any accidental bypasses.
    // Mirrors tenant pattern; covers edge cases (middleware ordering, TTL visibility).
    const user = await PlatformUserService.findUserById(req.platformUser!.id);
    const enforced = Boolean((user as any)?.mfaEnabled ?? (user as any)?.mfaVerifiedAt);
    if (enforced && !(await hasPlatformRecentReauth(req.platformUser!.id))) {
      return res.status(401).json({ error: 'mfa_freshness_required' });
    }
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const u = user;
    if (!u || !u.passwordHash) {  
      return res.status(400).json({ error: 'Current password not set' });
    }

    const isCurrentValid = await PlatformUserService.verifyPassword(currentPassword, u.passwordHash);
    if (!isCurrentValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await PlatformUserService.hashPassword(newPassword);
    await PlatformUserService.updateUser(u.id, {
      passwordHash: newPasswordHash
    });

    // Revoke all sessions on password change (containment)
    await PlatformSessionService.revokeAllForUser(u.id);

    await AuditService.log({
      platformUserId: u.id,
      action: 'platform.auth.password_changed',
      ipAddress: realIp(req)
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Get current platform user
router.get('/me', authenticatePlatform, async (req: PlatformAuthRequest, res, next) => {
  try {
    const user = await PlatformUserService.findUserById(req.platformUser!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: req.platformUser!.roles,
      permissions: req.platformUser!.permissions,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (error) {
    next(error);
  }
});

export default router;