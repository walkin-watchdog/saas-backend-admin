import { Request, Response, NextFunction } from 'express';
import { verifyAccess, UserRole, TokenClaims } from '../utils/jwt';
import { verifyImpersonationToken, ImpersonationTokenClaims } from '../utils/platformJwt';
import { getTenantPrisma, getTenantId } from './tenantMiddleware';
import { isIpAllowed } from '../utils/ipAllowlist';
import { realIp } from './rateLimit';
import { requestContext } from '../utils/logger';
import { authFailureCounter, hashTenantId } from '../utils/metrics';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  platformAdmin: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  impersonation?: {
    platformUserId: string;
    tenantId: string;
    scope: string;
    reason: string;
    grantId: string;
  };
}

const ROLE_ORDER: Record<UserRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      authFailureCounter.inc({ tenant: hashTenantId(getTenantId()) });
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
      const payload: TokenClaims = verifyAccess(token);
      const tenantId = getTenantId();
      if (payload.tenantId !== tenantId) {
        authFailureCounter.inc({ tenant: hashTenantId(tenantId) });
        return res.status(403).json({ error: 'Cross-tenant access forbidden.' });
      }

      const prisma = getTenantPrisma();
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, tokenVersion: true, platformAdmin: true },
      });
      if (!user || user.tokenVersion !== payload.tokenVersion) {
        authFailureCounter.inc({ tenant: hashTenantId(tenantId) });
        return res.status(401).json({ error: 'Invalid token.' });
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        platformAdmin: user.platformAdmin,
      };
      const store = requestContext.getStore();
      if (store) store.userId = user.id;
      return next();
    } catch {
      // not a regular tenant token, try impersonation token
      try {
        const payload: ImpersonationTokenClaims = verifyImpersonationToken(token, 'tenant-api');

        const tenantId = getTenantId();
        if (payload.tenantId !== tenantId) {
          authFailureCounter.inc({ tenant: hashTenantId(tenantId) });
          return res.status(403).json({ error: 'Cross-tenant access forbidden.' });
        }

        const { ImpersonationService } = await import('../services/impersonationService');
        const isValid = await ImpersonationService.validateGrant(payload.jti);
        if (!isValid) {
          authFailureCounter.inc({ tenant: hashTenantId(tenantId) });
          return res.status(401).json({ error: 'Impersonation grant expired or revoked' });
        }

        const allowlist = (process.env.IMPERSONATION_CIDR_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
        if (allowlist.length) {
          const clientIp = realIp(req);
          if (!isIpAllowed(clientIp, allowlist)) {
            authFailureCounter.inc({ tenant: hashTenantId(tenantId) });
            return res.status(403).json({ error: 'Access denied from this IP address' });
          }
        }

        const roleMap: Record<ImpersonationTokenClaims['scope'], UserRole> = {
          read_only: 'VIEWER',
          billing_support: 'EDITOR',
          full_tenant_admin: 'ADMIN',
        };

        req.user = {
          id: `impersonation:${payload.sub}`,
          email: `${payload.sub}@platform`,
          role: roleMap[payload.scope],
          platformAdmin: true,
        };

        req.impersonation = {
          platformUserId: payload.sub,
          tenantId: payload.tenantId,
          scope: payload.scope,
          reason: payload.reason,
          grantId: payload.grantId,
        };

        const store = requestContext.getStore();
        if (store) store.userId = req.user.id;
        return next();
      } catch {
        authFailureCounter.inc({ tenant: hashTenantId(getTenantId()) });
        return res.status(401).json({ error: 'Invalid token.' });
      }
    }
  } catch {
    authFailureCounter.inc({ tenant: hashTenantId(getTenantId()) });
    res.status(401).json({ error: 'Invalid token.' });
  }
};

export const authorize = (roleOrRoles: UserRole | UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (Array.isArray(roleOrRoles)) {
      if (!roleOrRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }
    } else {
      if (ROLE_ORDER[req.user.role] < ROLE_ORDER[roleOrRoles]) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }
    }
    next();
  };
};

export const requirePlatformAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.platformAdmin) {
    return res.status(403).json({ error: 'Platform admin required' });
  }
  next();
};
