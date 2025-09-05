import express from 'express';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';
import { UserService } from '../services/userService';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { addToBlacklist, isBlacklisted, addFamilyToBlacklist, isFamilyBlacklisted } from '../utils/blacklist';
import { EmailService } from '../services/emailService';
import crypto from 'crypto';
import { signAccess, signRefresh, verifyRefresh, TokenClaims } from '../utils/jwt';
import { eventBus, AUTH_EVENTS } from '../utils/eventBus';
import { verifyCaptcha } from '../utils/captcha';
import { EncryptionService } from '../utils/encryption';
import { verifyTOTP } from '../utils/totp';
import oauthRoutes from './auth/oauth';
import totpRoutes, {
  require2FA,
  getRecent2FASecret,
  clearRecent2FASecret,
  requireMfaFreshness,
  hasRecentReauth,
} from './auth/totp';
import { TenantConfigService } from '../services/tenantConfigService';
import { getTenantId, getTenantPrisma } from '../middleware/tenantMiddleware';
import { allowedOriginsSet } from '../utils/allowedOrigins';
import {
  loginIpLimiter,
  loginIdLimiter,
  refreshLimiter,
  forgotIpLimiter,
  forgotEmailLimiter,
  realIp
} from '../middleware/rateLimit';
import { recordFailure, clearFailures, checkSoftLock, needsCaptcha } from '../utils/loginBackoff';
import { retryInteractiveTx } from '../utils/txRetry';
import { authLockoutCounter, hashTenantId } from '../utils/metrics';

const router = express.Router();
router.use('/oauth', oauthRoutes);
router.use('/2fa', authenticate, totpRoutes);

const ipFailures = new Map<string, number[]>();
function trackIpFailure(ip: string) {
  const now = Date.now();
  const arr = ipFailures.get(ip) || [];
  const recent = arr.filter(ts => now - ts < 60000);
  recent.push(now);
  ipFailures.set(ip, recent);
  if (recent.length >= 10) {
    eventBus.publish(AUTH_EVENTS.BRUTE_FORCE_DETECTED, { ip });
  }
}

const DUMMY_HASH = '$2b$12$CjwKCAjwjtOTBhAvEiwASG4b0JYkY9W7xI1kqlXr9F2j2PBpRPFfa';


const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  totp: z.string().optional(),
  recoveryCode: z.string().optional(),
  captcha: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword:     z.string().min(6)
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(6)
});

async function loadTenantAppConfig() {
  const tid = getTenantId();
  try {
    if (tid) {
      const cfg = await TenantConfigService.getConfig<any>(tid, 'companyName');
      return {
        companyName: cfg?.companyName || process.env.COMPANY_NAME,
      };
    }
  } catch {
  }
  return {
    companyName: process.env.COMPANY_NAME,
  };
}

// Login
router.post('/login', loginIpLimiter, loginIdLimiter, async (req: TenantRequest, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', issues: parsed.error.issues });
    }
    const { email, password, totp, recoveryCode, captcha } = parsed.data;
    const ip = realIp(req);
    const user = await UserService.findUserByEmail(email);
    const userKey = user ? user.id : email.toLowerCase();

    if (user) {
      const ttl = await checkSoftLock(req.tenantId!, user.id);
      if (ttl) {
        res.setHeader('Retry-After', String(ttl));
        return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
      }
    }

    const requireCaptcha = await needsCaptcha(req.tenantId!, userKey, ip);
    if (requireCaptcha) {
      const captchaOk = await verifyCaptcha(req.tenantId!, captcha);
      if (!captchaOk) {
        eventBus.publish(AUTH_EVENTS.LOGIN_FAILED, {
          tenantId: req.tenantId,
          userId: user?.id,
          reason: 'captcha_failed',
        });
        trackIpFailure(ip);
        if (user) {
          const prisma = getTenantPrisma();
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: { increment: 1 } }
          }).catch(() => {});
        }
        const { delay, locked } = await recordFailure(req.tenantId!, userKey, ip);
        if (locked) {
          eventBus.publish(AUTH_EVENTS.LOCKOUT_ENGAGED, {
            tenantId: req.tenantId,
            userId: user?.id,
            reason: 'soft_lock_threshold',
          });
          authLockoutCounter.inc({ tenant: hashTenantId(req.tenantId!) });
          res.setHeader('Retry-After', String(delay));
          return res
            .status(423)
            .json({ error: 'Account temporarily locked. Try again later.' });
        }
        if (delay > 0) {
          res.setHeader('Retry-After', String(delay));
          return res
            .status(429)
            .json({ error: 'Too many attempts, please try again later.' });
        }
        return res.status(400).json({ error: 'CAPTCHA verification failed' });
      }
    }

    if (!user) {
      eventBus.publish(AUTH_EVENTS.LOGIN_FAILED, { tenantId: req.tenantId, reason: 'user_not_found' });
      trackIpFailure(ip);
      await bcrypt.compare(password, DUMMY_HASH);
      const { delay, locked } = await recordFailure(req.tenantId!, userKey, ip);
      if (locked) {
        eventBus.publish(AUTH_EVENTS.LOCKOUT_ENGAGED, { tenantId: req.tenantId, userId: undefined, reason: 'soft_lock_threshold' });
        authLockoutCounter.inc({ tenant: hashTenantId(req.tenantId!) });
        res.setHeader('Retry-After', String(delay));
        return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
      }
      if (delay > 0) {
        res.setHeader('Retry-After', String(delay));
        return res.status(429).json({ error: 'Too many attempts, please try again later.' });
      }
      return res.status(401).json({ error: 'Invalid username' });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      const prisma = getTenantPrisma();
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } }
      }).catch(() => {});
      const { delay, locked } = await recordFailure(req.tenantId!, user.id, ip);
      eventBus.publish(AUTH_EVENTS.LOGIN_FAILED, { tenantId: req.tenantId, userId: user.id, reason: 'invalid_password' });
      trackIpFailure(ip);
      if (locked) {
        eventBus.publish(AUTH_EVENTS.LOCKOUT_ENGAGED, { tenantId: req.tenantId, userId: user.id, reason: 'soft_lock_threshold' });
        authLockoutCounter.inc({ tenant: hashTenantId(req.tenantId!) });
        res.setHeader('Retry-After', String(delay));
        return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
      }
      if (delay > 0) {
        res.setHeader('Retry-After', String(delay));
        return res.status(429).json({ error: 'Too many attempts, please try again later.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
    }

    const need2FA = user.twoFaEnabled || require2FA.has(user.id);
    if (need2FA) {
      let twoFaOk = false;
      if (recoveryCode) {
        for (const [idx, codeHash] of user.twoFaRecoveryCodes.entries()) {
          if (await bcrypt.compare(recoveryCode, codeHash)) {
            user.twoFaRecoveryCodes.splice(idx, 1);
            await UserService.updateUser(user.id, { twoFaRecoveryCodes: user.twoFaRecoveryCodes });
            twoFaOk = true;
            break;
          }
        }
      } else if (totp) {
        const secret =
          (user.twoFaSecret ? EncryptionService.decrypt(user.twoFaSecret) : null) ??
          getRecent2FASecret(user.id) ??
          null;
        if (secret) {
          twoFaOk = verifyTOTP(totp, secret);
        }
      }
      if (!twoFaOk) {
        const prisma = getTenantPrisma();
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: { increment: 1 } }
        }).catch(() => {});
        const { delay, locked } = await recordFailure(req.tenantId!, user.id, ip);
        eventBus.publish(AUTH_EVENTS.LOGIN_FAILED, { tenantId: req.tenantId, userId: user.id, reason: 'invalid_2fa' });
        trackIpFailure(ip);
        if (locked) {
          eventBus.publish(AUTH_EVENTS.LOCKOUT_ENGAGED, { tenantId: req.tenantId, userId: user.id, reason: 'soft_lock_threshold' });
          authLockoutCounter.inc({ tenant: hashTenantId(req.tenantId!) });
          res.setHeader('Retry-After', String(delay));
          return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
        }
        if (delay > 0) {
          res.setHeader('Retry-After', String(delay));
          return res.status(429).json({ error: 'Too many attempts, please try again later.' });
        }
        return res.status(401).json({ error: 'Invalid 2FA credentials' });
      }
    }

    if (user.failedLoginCount > 0 || user.lockoutUntil) {
      await UserService.updateUser(user.id, { failedLoginCount: 0, lockoutUntil: null });
      if (user.lockoutUntil) {
        eventBus.publish(AUTH_EVENTS.LOCKOUT_CLEARED, { tenantId: req.tenantId, userId: user.id, reason: 'successful_login' });
      }
    }

    if (need2FA) {
      require2FA.delete(user.id);
      clearRecent2FASecret(user.id);
    }
    await clearFailures(req.tenantId!, user.id, ip);
    // reset persisted counters like before so admin UI / audits remain meaningful
    const prisma = getTenantPrisma();
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockoutUntil: null }
    }).catch(() => {});
    const rfid = crypto.randomUUID();
    const accessClaims = {
      sub: user.id,
      tenantId: req.tenantId!,
      role: user.role,
      tokenVersion: user.tokenVersion,
      platformAdmin: user.platformAdmin,
    };
    const refreshClaims = { ...accessClaims, rfid };
    const jti = crypto.randomUUID();
    const access = signAccess(accessClaims, jti);
    const refresh = signRefresh(refreshClaims, jti);
    const csrfToken = crypto.randomBytes(20).toString('hex');

    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    res.cookie('rt', refresh, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.cookie('csrf', csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure: isSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({
      access,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        platformAdmin: user.platformAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', refreshLimiter, async (req: TenantRequest, res) => {
  // Explicit Origin / Referer check (defense-in-depth in addition to CORS)
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin && !allowedOriginsSet.has(origin)) {
    logger.warn('auth.refresh_denied', {
      tenantId: req.tenantId,
      reason: 'bad_origin',
      origin,
      ip: realIp(req),
    });
    return res.sendStatus(403);
  }
  if (!origin && referer) {
    try {
      const r = new URL(referer);
      if (!allowedOriginsSet.has(`${r.protocol}//${r.host}`)) {
        logger.warn('auth.refresh_denied', {
          tenantId: req.tenantId,
          reason: 'bad_referer',
          referer,
          ip: realIp(req),
        });
        return res.sendStatus(403);
      }
    } catch {
      // malformed referer → reject
      logger.warn('auth.refresh_denied', {
        tenantId: req.tenantId,
        reason: 'malformed_referer',
        referer,
        ip: realIp(req),
      });
      return res.sendStatus(403);
    }
  }
  const csrfCookie = req.cookies.csrf;
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || csrfCookie !== csrfHeader) {
    logger.warn('auth.refresh_failed', {
      tenantId: req.tenantId,
      reason: 'csrf_mismatch',
      ip: realIp(req),
    });
    return res.sendStatus(403);
  }

  const token = req.cookies.rt;
  if (!token) {
    logger.warn('auth.refresh_failed', {
      tenantId: req.tenantId,
      reason: 'no_refresh_cookie',
      ip: realIp(req),
    });
    return res.sendStatus(401);
  }

  let payload: TokenClaims;
  try {
    payload = verifyRefresh(token);
  } catch {
    logger.warn('auth.refresh_failed', {
      tenantId: req.tenantId,
      reason: 'invalid_refresh_jwt',
      ip: realIp(req),
    });
    return res.sendStatus(401);
  }

  if (payload.tenantId !== req.tenantId) {
    logger.warn('auth.refresh_failed', {
      tenantId: req.tenantId,
      userId: payload.sub,
      reason: 'tenant_mismatch',
      ip: realIp(req),
    });
    return res.sendStatus(403);
  }

  // If the whole family is revoked, block immediately
  if (payload.rfid && await isFamilyBlacklisted(req.tenantId!, payload.sub, payload.rfid)) {
    logger.info('auth.refresh_rejected_family_blacklisted', {
      tenantId: req.tenantId,
      userId: payload.sub,
      rfid: payload.rfid,
      ip: realIp(req),
    });
    return res.sendStatus(401);
  }

  const black = await isBlacklisted(req.tenantId!, payload.sub, payload.jti);
  if (black) {
    // Refresh token reuse detected → revoke entire family (only when rfid present)
    if (payload.rfid) {
      const expMs = Math.max(0, (payload.exp! * 1000) - Date.now());
      await addFamilyToBlacklist({
        tenantId: req.tenantId!,
        userId: payload.sub,
        familyId: payload.rfid,
        exp: new Date(Date.now() + (expMs || 30 * 24 * 60 * 60 * 1000)),
      }).catch(() => {});
    }
    logger.info('auth.refresh_rejected_blacklisted', {
      tenantId: req.tenantId,
      userId: payload.sub,
      jti: payload.jti,
      rfid: payload.rfid,
      reason: 'jti_blacklisted',
      ip: realIp(req),
    });
    return res.sendStatus(401);
  }

  if (payload.impersonation) {
    const { ImpersonationService } = await import('../services/impersonationService');
    const valid = await ImpersonationService.validateGrant(payload.impersonation.jti);
    if (!valid) {
      logger.warn('auth.refresh_failed', {
        tenantId: req.tenantId,
        userId: payload.sub,
        reason: 'impersonation_grant_invalid',
        ip: realIp(req),
      });
      return res.sendStatus(401);
    }
  } else {
    const user = await UserService.findUserById(payload.sub);
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      logger.warn('auth.refresh_failed', {
        tenantId: req.tenantId,
        userId: payload.sub,
        reason: !user ? 'user_not_found' : 'token_version_mismatch',
        ip: realIp(req),
      });
      return res.sendStatus(401);
    }
  }

  if (!payload.sub.startsWith('impersonation:')) {
    await addToBlacklist({
      tenantId: req.tenantId!,
      userId: payload.sub,
      jti: payload.jti,
      exp: new Date(payload.exp! * 1000),
    });
  }

  const newJti = crypto.randomUUID();
  const rfid = payload.rfid ?? crypto.randomUUID();
  const accessClaims = {
    sub: payload.sub,
    tenantId: req.tenantId!,
    role: payload.role,
    tokenVersion: payload.tokenVersion,
    platformAdmin: payload.platformAdmin,
    impersonation: payload.impersonation,
  };
  const refreshClaims = { ...accessClaims, rfid };
  const access = signAccess(accessClaims, newJti);
  const newRefresh = signRefresh(refreshClaims, newJti);
  const newCsrf = crypto.randomBytes(20).toString('hex');

  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  res.cookie('rt', newRefresh, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.cookie('csrf', newCsrf, {
    httpOnly: false,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ access, csrfToken: newCsrf });
  logger.info('auth.refresh_success', {
    tenantId: req.tenantId,
    userId: payload.sub,
    jti: newJti,
    ip: realIp(req),
  });
});  

router.post('/logout', async (req: TenantRequest, res) => {
  // Origin/Referer allowlist (defense-in-depth, aligns with /refresh)
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin && !allowedOriginsSet.has(origin)) {
    logger.warn('auth.logout_denied', {
      tenantId: req.tenantId,
      reason: 'bad_origin',
      origin,
      ip: realIp(req),
    });
    return res.sendStatus(403);
  }
  if (!origin && referer) {
    try {
      const r = new URL(referer);
      if (!allowedOriginsSet.has(`${r.protocol}//${r.host}`)) {
        logger.warn('auth.logout_denied', {
          tenantId: req.tenantId,
          reason: 'bad_referer',
          referer,
          ip: realIp(req),
        });
        return res.sendStatus(403);
      }
    } catch {
      logger.warn('auth.logout_denied', {
        tenantId: req.tenantId,
        reason: 'malformed_referer',
        referer,
        ip: realIp(req),
      });
      return res.sendStatus(403);
    }
  }
  const csrfCookie = req.cookies.csrf;
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || csrfCookie !== csrfHeader) {
    logger.warn('auth.logout_failed', {
      tenantId: req.tenantId,
      reason: 'csrf_mismatch',
      ip: realIp(req),
    });
    return res.sendStatus(403);
  }
  const token = req.cookies.rt;
  if (token) {
    const { jti, exp, sub } = verifyRefresh(token);
    if (!sub.startsWith('impersonation:')) {
      try {
        await addToBlacklist({
          tenantId: req.tenantId!,
          userId: sub,
          jti,
          exp: new Date(exp! * 1000),
        });
      } catch (err) {
        if (
          (err as any).name === 'PrismaClientKnownRequestError' &&
          (err as any).code === 'P2002'
        ) {
          // duplicate jti, ignore
        } else {
          throw err;
        }
      }
    }
  }
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  res.clearCookie('rt', { httpOnly: true, sameSite: 'strict', secure: isSecure });
  res.clearCookie('csrf', { httpOnly: false, sameSite: 'strict', secure: isSecure });
  res.sendStatus(204);
});

// Forgot Password
router.post('/forgot-password', forgotIpLimiter, forgotEmailLimiter, async (req: TenantRequest, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    const user = await UserService.findUserByEmail(email);

    if (!user) {
      await bcrypt.compare(email, DUMMY_HASH);
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }

    // Generate reset token
    const resetTokenPlain  = crypto.randomBytes(32).toString('hex');
    const resetToken       = crypto.createHash('sha256').update(resetTokenPlain).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token (you might want to add these fields to User model)
    await UserService.updateUser(user.id, {
        resetToken,
        resetTokenExpiry
    });

    // Send reset email
    const { companyName } = await loadTenantAppConfig();
    const resetUrl = `${process.env.ADMIN_URL}/reset-password?token=${resetTokenPlain}`;
    try {
      await EmailService.sendEmail({
        to: email,
        subject: `Password Reset Request - ${companyName} Admin`,
        template: 'password-reset',
        context: {
          name: user.name,
          resetUrl,
          companyName: companyName
        }
      });
    } catch (err: any) {
      if (err?.code === 'SMTP_CONFIG_MISSING') {
        return res.status(412).json({
          code: 'SMTP_CONFIG_MISSING',
          message: 'Set SMTP in Settings → Integrations'
        });
      }
      throw err;
    }

    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
});

// Reset Password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const userWithToken = await UserService.findUserByResetToken(hashedToken);

    if (!userWithToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await UserService.clearResetTokenAndSetPassword(userWithToken.id, hashedPassword);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/validate-reset-token', async (req, res) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(req.query);
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await UserService.findUserByResetToken(hashed);
  return user ? res.sendStatus(200) : res.sendStatus(404);
});

router.post(
  '/change-password',
  authenticate,
  requireMfaFreshness,
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      // Defense-in-depth: re-check MFA freshness to avoid any accidental bypasses
      // (e.g., tenant scoping race or Redis TTL visibility edge cases).
      const prisma = getTenantPrisma();
      const u = await prisma.user.findFirst({
        where: { id: req.user!.id, tenantId: req.tenantId! },
        select: { twoFaEnabled: true },
      });
      if (u?.twoFaEnabled && !(await hasRecentReauth(req.user!.id))) {
        return res.status(401).json({ error: 'mfa_freshness_required' });
      }
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const user = await UserService.findUserById(req.user!.id, { includePassword: true });

      if (!user) {
        return res.sendStatus(404);
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await retryInteractiveTx(() =>
        UserService.updateUserCommitted(req.user!.id, { password: hashed })
      ),
      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/register-first', async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const userCount = await UserService.countUsers();
    if (userCount > 0) {
      return res.status(403).json({ error: 'Initial registration is closed.' });
    }

    const { email, password, name, role } = registerSchema.parse(req.body);

    const existingUser = await UserService.findUserByEmail(email);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await UserService.createUser({
        email,
        password: hashedPassword,
        name,
        role: role || 'VIEWER'
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// Register (Admin only)
router.post('/register', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can create users' });
    }

    const { email, password, name, role } = registerSchema.parse(req.body);

    const existingUser = await UserService.findUserByEmail(email);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await UserService.createUser({
        email,
        password: hashedPassword,
        name,
        role: role || 'VIEWER'
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const user = await UserService.findUserById(req.user!.id);

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Get all users (Admin only)
router.get('/users', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { role } = z.object({
      role: z.enum(['ADMIN','EDITOR','VIEWER']).optional()
    }).parse(req.query);

    const where: any = {};
    if (role) where.role = role;

    const users = await UserService.findManyUsers(where);

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Get user by ID (Admin only)
router.get('/users/:id', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const user = await UserService.findUserById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user (Admin only)
router.put('/users/:id', authenticate, authorize(['ADMIN']), requireMfaFreshness, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { name, role, password } = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['ADMIN','EDITOR','VIEWER']).optional(),
      password: z.string().min(6).optional()
    }).parse(req.body);

    // Check if trying to modify own role
    if (req.params.id === req.user?.id && role && role !== req.user.role) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    // Create update data
    const updateData: any = {
      ...(name ? { name } : {}),
      ...(role ? { role } : {}),
      ...(password ? { password: await bcrypt.hash(password, 12) } : {})
    };

    const updatedUser = await UserService.updateUser(req.params.id, updateData);

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

// Delete user (Admin only)
router.delete('/users/:id', authenticate, authorize(['ADMIN']), requireMfaFreshness, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    // Check if trying to delete yourself
    if (req.params.id === req.user?.id) {
      return res.status(403).json({ error: 'You cannot delete your own account' });
    }

    await UserService.deleteUser(req.params.id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;