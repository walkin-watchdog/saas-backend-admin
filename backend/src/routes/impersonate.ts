import express from 'express';
import crypto from 'crypto';
import { verifyImpersonationToken, ImpersonationTokenClaims } from '../utils/platformJwt';
import { UserRole, signAccess, signRefresh } from '../utils/jwt';
import { ImpersonationService } from '../services/impersonationService';

const router = express.Router();

router.get('/:token', async (req, res, next) => {
  try {
    const raw = req.params.token;
    const payload: ImpersonationTokenClaims = verifyImpersonationToken(raw, 'tenant-api');

    const valid = await ImpersonationService.validateGrant(payload.jti);
    if (!valid) {
      return res.status(400).json({ error: 'INVALID_TOKEN' });
    }

    const roleMap: Record<ImpersonationTokenClaims['scope'], UserRole> = {
      read_only: 'VIEWER',
      billing_support: 'EDITOR',
      full_tenant_admin: 'ADMIN',
    };

    const rfid = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const accessClaims = {
      sub: `impersonation:${payload.sub}`,
      tenantId: payload.tenantId,
      role: roleMap[payload.scope],
      tokenVersion: 0,
      platformAdmin: true,
      impersonation: {
        platformUserId: payload.sub,
        scope: payload.scope,
        reason: payload.reason,
        grantId: payload.grantId,
        jti: payload.jti,
      },
    } as const;
    const refreshClaims = { ...accessClaims, rfid };
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
        id: `impersonation:${payload.sub}`,
        email: `${payload.sub}@platform`,
        role: roleMap[payload.scope],
        platformAdmin: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;