import { Request, Response, NextFunction } from 'express';
import { verifyPlatformAccess, verifyImpersonationToken, PlatformTokenClaims } from '../utils/platformJwt';
import { PlatformUserService } from '../services/platformUserService';
import { logger, requestContext } from '../utils/logger';
import { AuditService } from '../services/auditService';
import { realIp } from './rateLimit';
import { isIpAllowed } from '../utils/ipAllowlist';
import { PlatformConfigService } from '../services/platformConfigService';
import { authFailureCounter, hashTenantId } from '../utils/metrics';

export interface PlatformAuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
}

export interface PlatformAuthRequest extends Request {
  platformUser?: PlatformAuthUser;
  impersonation?: {
    platformUserId: string;
    tenantId: string;
    scope: string;
    reason: string;
    grantId: string;
  };
  platformSessionJti?: string;
}

export const authenticatePlatform = async (req: PlatformAuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      authFailureCounter.inc({ tenant: hashTenantId('platform') });
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const clientIp = realIp(req);

    // Explicitly reject impersonation tokens on platform API (allowed only for tenant APIs)
    try {
      verifyImpersonationToken(token, 'platform-api');
      authFailureCounter.inc({ tenant: hashTenantId('platform') });
      return res.status(401).json({ error: 'Impersonation tokens are not valid for platform API' });
    } catch {
      // Not an impersonation token (or invalid) – proceed with normal platform access token
    }

    // Try platform access token
    let payload: PlatformTokenClaims;
    try {
      payload = verifyPlatformAccess(token);
    } catch {
      authFailureCounter.inc({ tenant: hashTenantId('platform') });
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await PlatformUserService.findUserById(payload.sub);
    if (!user || user.status !== 'active') {
      authFailureCounter.inc({ tenant: hashTenantId('platform') });
      return res.status(401).json({ error: 'Invalid token or user disabled' });
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
        authFailureCounter.inc({ tenant: hashTenantId('platform') });
        return res.status(403).json({ error: 'Access denied from this IP address' });
      }
    }

    const { PlatformSessionService } = await import('../services/platformSessionService');
    // Only require active session if a JTI is present
    if (payload.jti) {
      const active = await PlatformSessionService.isActive(payload.jti);
      if (!active) {
        authFailureCounter.inc({ tenant: hashTenantId('platform') });
        return res.status(401).json({ error: 'Session revoked' });
      }
    }

    req.platformUser = {
      id: user.id,
      email: user.email,
      roles: payload.roles,
      permissions: payload.permissions,
      mfaEnabled: Boolean((user as any).mfaEnabled ?? (user as any).mfaVerifiedAt)
    };
    const store = requestContext.getStore();
    if (store) store.userId = user.id;
    req.platformSessionJti = payload.jti;

    // Enforce platform-wide MFA requirement at the router root, excluding /auth, /oauth and /2fa
    try {
      const url = (req.originalUrl || '').toLowerCase();
      const isExempt = url.includes('/api/platform/auth') || url.includes('/oauth') || url.includes('/2fa');
      if (!isExempt) {
        const [globalRequired, userRequired] = await Promise.all([
          PlatformConfigService.getConfig<boolean>('platform_mfa_required', 'platform'),
          PlatformConfigService.getConfig<boolean>(`user:${user.id}:mfa_required`, 'platform'),
        ]);
        if (globalRequired || userRequired) {
          const enabled = Boolean((user as any)?.mfaEnabled ?? (user as any)?.mfaVerifiedAt);
          if (!enabled) {
            authFailureCounter.inc({ tenant: hashTenantId('platform') });
            return res.status(403).json({ error: 'MFA required', code: 'mfa_required' });
          }
        }
      }
    } catch (e) {
      logger.error('Error enforcing platform MFA at root', { error: (e as Error).message });
      return res.status(500).json({ error: 'Failed to enforce MFA requirement' });
    }

    next();
  } catch (error) {
    logger.error('Platform authentication failed', { error: (error as Error).message });
    authFailureCounter.inc({ tenant: hashTenantId('platform') });
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const requirePlatformPermissions = (requiredPermissions: string | string[]) => {
  return (req: PlatformAuthRequest, res: Response, next: NextFunction) => {
    if (!req.platformUser) {
      return res.status(401).json({ error: 'Platform authentication required' });
    }

    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const hasAllPermissions = permissions.every(perm => 
      req.platformUser!.permissions.includes(perm)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permissions,
        has: req.platformUser.permissions
      });
    }

    next();
  };
};

export const requirePlatformRole = (requiredRoles: string | string[]) => {
  return (req: PlatformAuthRequest, res: Response, next: NextFunction) => {
    if (!req.platformUser) {
      return res.status(401).json({ error: 'Platform authentication required' });
    }

    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    const hasAnyRole = roles.some(role => req.platformUser!.roles.includes(role));

    if (!hasAnyRole) {
      return res.status(403).json({ 
        error: 'Insufficient role',
        required: roles,
        has: req.platformUser.roles
      });
    }

    next();
  };
};

export const requireMfaEnabled = async (
  req: PlatformAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.platformUser) {
      return res.status(401).json({ error: 'Platform authentication required' });
    }
    const enforced = await PlatformConfigService.getConfig<boolean>(
      'platform_mfa_required',
      'platform',
    );
    if (!enforced) return next();
    if (req.platformUser.mfaEnabled) return next();
    const user = await PlatformUserService.findUserById(req.platformUser.id);
    const enabled = Boolean((user as any)?.mfaEnabled ?? (user as any)?.mfaVerifiedAt);
    if (!enabled) {
      return res.status(403).json({ error: 'MFA required', code: 'mfa_required' });
    }
    req.platformUser.mfaEnabled = true;
    return next();
  } catch (err) {
    logger.error('Error enforcing MFA requirement', { error: (err as Error).message });
    return res.status(500).json({ error: 'Failed to verify MFA status' });
  }
};
