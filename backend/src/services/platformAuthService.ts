import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PlatformUserService } from './platformUserService';
import { PlatformSessionService } from './platformSessionService';
import { signPlatformAccess, signPlatformRefresh, verifyPlatformRefresh } from '../utils/platformJwt';
import { AuditService } from './auditService';
import { verifyCaptcha } from '../utils/captcha';
import { isIpAllowed } from '../utils/ipAllowlist';
import { verifyTOTP } from '../utils/totp';
import { EncryptionService } from '../utils/encryption';
import { realIp } from '../middleware/rateLimit';
import { PlatformAuthRequest } from '../middleware/platformAuth';
import { needsCaptcha, recordFailure, clearFailures, checkSoftLock } from '../utils/loginBackoff';

export class PlatformAuthService {
  static async login(req: PlatformAuthRequest, body: {
    email: string;
    password: string;
    mfaCode?: string;
    recoveryCode?: string;
    captcha?: string;
  }) {
    const { email, password, mfaCode, recoveryCode, captcha } = body;
    const clientIp = realIp(req);

    const user = await PlatformUserService.findUserByEmail(email, { includePassword: true });
    const userKey = user ? user.id : email.toLowerCase();
    // Soft lock parity
    const lockTtl = await checkSoftLock('platform', userKey);
    if (lockTtl) {
      await AuditService.log({ action: 'platform.auth.login_failed', ipAddress: clientIp, reason: 'soft_lock_threshold', changes: { email } });
      const err: any = new Error('Too many attempts, please try again later.');
      err.status = 423;
      err.retryAfterSec = lockTtl;
      err.locked = true;
      throw err;
    }
    if (!user) {
      // Timing equalization
      const DUMMY_HASH = '$2b$12$CjwKCAjwjtOTBhAvEiwASG4b0JYkY9W7xI1kqlXr9F2j2PBpRPFfa';
      await bcrypt.compare(password, DUMMY_HASH);
      await AuditService.log({ action: 'platform.auth.login_failed', ipAddress: clientIp, reason: 'user_not_found', changes: { email } });
      const { delay, locked } = await recordFailure('platform', userKey, clientIp);
      const err: any = new Error('Invalid credentials');
      if (locked) {
        err.status = 423;
        err.retryAfterSec = delay;
        err.locked = true;
      } else if (delay > 0) {
        err.status = 429;
        err.retryAfterSec = delay;
      } else {
        err.status = 401;
      }
      throw err;
    }
    if (user.status !== 'active') {
      await AuditService.log({
        platformUserId: user.id,
        action: 'platform.auth.login_failed',
        ipAddress: clientIp,
        reason: 'User disabled'
      });
      throw new Error('Account disabled');
    }
    if (!user.passwordHash) {
      throw new Error('Password not set. Please use invite link.');
    }

    // Adaptive CAPTCHA
    const requireCaptcha = await needsCaptcha('platform', userKey, clientIp);
    if (requireCaptcha) {
      const captchaOk = await verifyCaptcha('platform', captcha);
      if (!captchaOk) {
        await recordFailure('platform', userKey, clientIp);
        throw new Error('Captcha verification failed');
      }
    }

    const passwordValid = await PlatformUserService.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await AuditService.log({ platformUserId: user.id, action: 'platform.auth.login_failed', ipAddress: clientIp, reason: 'invalid_password' });
      const { delay, locked } = await recordFailure('platform', user.id, clientIp);
      const err: any = new Error('Invalid credentials');
      if (locked) {
        err.status = 423;
        err.retryAfterSec = delay;
        err.locked = true;
      } else if (delay > 0) {
        err.status = 429;
        err.retryAfterSec = delay;
      } else {
        err.status = 401;
      }
      throw err;
    }

    // IP allowlist check
    if (user.ipAllowlist && user.ipAllowlist.length > 0) {
      if (!isIpAllowed(clientIp, user.ipAllowlist)) {
        await AuditService.log({
          platformUserId: user.id,
          action: 'platform.auth.ip_denied',
          ipAddress: clientIp,
          reason: 'IP not in allowlist',
        });
        throw new Error('Access denied from this IP address');
      }
    }

    // MFA check
    if (user.mfaEnabled) {
      let twoFaOk = false;
      if (recoveryCode && user.twoFaRecoveryCodes) {
        for (const [idx, hash] of user.twoFaRecoveryCodes.entries()) {
          if (await bcrypt.compare(recoveryCode, hash)) {
            const updated = [...user.twoFaRecoveryCodes];
            updated.splice(idx, 1);
            await PlatformUserService.updateUser(user.id, { twoFaRecoveryCodes: updated });
            twoFaOk = true;
            break;
          }
        }
      } else if (mfaCode && user.twoFaSecret) {
        const secret = EncryptionService.decrypt(user.twoFaSecret);
        twoFaOk = verifyTOTP(mfaCode, secret);
      }
      if (!twoFaOk) {
        const { delay, locked } = await recordFailure('platform', user.id, clientIp);
        const err: any = new Error('Invalid MFA code');
        if (locked) {
          err.status = 423;
          err.retryAfterSec = delay;
          err.locked = true;
        } else if (delay > 0) {
          err.status = 429;
          err.retryAfterSec = delay;
        } else {
          err.status = 401;
        }
        throw err;
      }
    }

    const { roles, permissions } = await PlatformUserService.getUserRolesAndPermissions(user.id);

    const jti = crypto.randomUUID();
    const accessClaims = { sub: user.id, email: user.email, roles, permissions };
    const access = signPlatformAccess(accessClaims, jti);
    const refresh = signPlatformRefresh(accessClaims, jti);
    await PlatformSessionService.create(user.id, jti);
    await PlatformUserService.touchLastLogin(user.id);
    // Success: clear adaptive counters
    await clearFailures('platform', user.id, clientIp);

    await AuditService.log({
      platformUserId: user.id,
      action: 'platform.auth.login_success',
      ipAddress: clientIp,
    });

    return {
      access,
      refresh,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions,
      },
    };
  }

  static async refresh(token: string, clientIp?: string) {
    const payload = verifyPlatformRefresh(token);
    const active = await PlatformSessionService.isActive(payload.jti);
    if (!active) {
      // Reuse/rotated token — contain by revoking all sessions
      await PlatformSessionService.revokeAllForUser(payload.sub);
      await AuditService.log({ platformUserId: payload.sub, action: 'platform.auth.rt_reuse_detected', ipAddress: clientIp });
      throw new Error('Session revoked');
    }
    const user = await PlatformUserService.findUserById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new Error('Invalid token or user disabled');
    }
    const { roles, permissions } = await PlatformUserService.getUserRolesAndPermissions(user.id);
    const newJti = crypto.randomUUID();
    const accessClaims = { sub: user.id, email: user.email, roles, permissions };
    const access = signPlatformAccess(accessClaims, newJti);
    const newRefresh = signPlatformRefresh(accessClaims, newJti);
    await PlatformSessionService.rotate(payload.jti, newJti);
    return { access, refresh: newRefresh };
  }
}