import { Request, Response, NextFunction, Router } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantService, TenantContext } from '../services/tenantService';
import { logger, requestContext } from '../utils/logger';
import { verifyAccess } from '../utils/jwt';
import { verifyImpersonationToken, ImpersonationTokenClaims } from '../utils/platformJwt';
import { AuditService } from '../services/auditService';
import { opMetrics } from '../utils/opMetrics';
import { hashTenantId } from '../utils/metrics';
import { getPreflightBreaker } from '../utils/preflight';

// AsyncLocalStorage to store tenant context
export const tenantContext = new AsyncLocalStorage<{
  tenant: TenantContext;
  prisma: PrismaClient;
}>();

export interface TenantRequest extends Request {
  tenant?: TenantContext;
  tenantId?: string;
}

// very light per-tenant rate-limit for unavailable audits (1/min)
const lastAuditAt = new Map<string, number>();
function shouldAuditUnavailable(tenantId: string): boolean {
  const now = Date.now(); const prev = lastAuditAt.get(tenantId) || 0;
  if (now - prev > 60_000) { lastAuditAt.set(tenantId, now); return true; }
  return false;
}

/**
 * Middleware to resolve tenant and set up tenant-specific Prisma client
 */
export const resolveTenant = async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    // Skip tenant resolution for health check and webhook endpoints
    if (req.path === '/api/health') {
      return next();
    }

    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const isAuth = req.path.startsWith('/api/auth');
    let tenant: TenantContext | undefined;
    let jwtTenant: TenantContext | undefined;
    let headerTenant: TenantContext | undefined;
    let skipHeaderTenant = false;
    try {
        // 0) Prefer Authorization: Bearer <jwt> when available (service-to-service / tests)
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
          const raw = auth.slice(7);
          let claimsTenantId: string | undefined;
          try {
            const claims = verifyAccess(raw); // throws on invalid signature/exp
            claimsTenantId = claims.tenantId;
            if (claims.impersonation) {
              skipHeaderTenant = true;
            }
          } catch {
            try {
              const imp: ImpersonationTokenClaims = verifyImpersonationToken(raw, 'tenant-api');
              // verify grant
              const { ImpersonationService } = await import('../services/impersonationService');
              const valid = await ImpersonationService.validateGrant(imp.jti);
              if (valid) {
                claimsTenantId = imp.tenantId;
                skipHeaderTenant = true;
              }
            } catch {
              // ignore
            }
          }
          if (claimsTenantId) {
            const t = await TenantService.getTenantById(claimsTenantId);
            if (t && t.status === 'active') {
              jwtTenant = t;
            }
          }
        }

      // 1) Fall back to API key or Origin/Host mapping
      if (!skipHeaderTenant) {
        headerTenant = await TenantService.fromOriginOrApiKey(req);
      }
    } catch (err) {
      if (isDev && isAuth && !req.headers['x-api-key'] && !req.headers.origin) {
        const devTenantId = process.env.DEV_TENANT_ID;
        tenant = devTenantId
          ? (await TenantService.getTenantById(devTenantId)) ?? undefined
          : await TenantService.getOrCreateDefaultTenant();
        if (tenant) {
          logger.warn('Using DEV fallback tenant for /api/auth', { tenantId: tenant.id });
        }
      } else {
        throw err;
      }
    }
    // If both sources are present and disagree, block the request (cross-tenant).
    if (jwtTenant && headerTenant && jwtTenant.id !== headerTenant.id) {
      logger.warn('Cross-tenant access attempt blocked', {
        jwtTenantId: jwtTenant.id,
        headerTenantId: headerTenant.id,
        origin: req.headers.origin,
        host: req.headers.host
      });
      return res.status(403).json({ error: 'Cross-tenant access forbidden.' });
    }

    // Choose tenant: JWT (if any) is the source of truth, otherwise headers, otherwise any dev fallback above.
    tenant = jwtTenant ?? headerTenant ?? tenant;
    if (!tenant) throw new Error('Tenant could not be resolved');

    req.tenant = tenant;
    req.tenantId = tenant.id;
    const store = requestContext.getStore();
    if (store) store.tenantId = tenant.id;

    // Import prisma dynamically to avoid circular dependency
    const { prisma: sharedPrisma, getDedicatedPrisma } = await import('../utils/prisma');
    let tenantPrisma = sharedPrisma;

    // Switch to dedicated database if tenant has one
    if (tenant.dedicated && tenant.datasourceUrl) {
      try {
        tenantPrisma = getDedicatedPrisma(tenant.datasourceUrl);
      } catch (error) {
        logger.error('Failed to connect to dedicated tenant database', {
          tenantId: tenant.id,
          error: (error as Error).message
        });
        throw new Error('Failed to connect to tenant database');
      }
      // quick preflight; convert common failures to structured 503
      try {
        const t0 = Date.now();
        const breaker = getPreflightBreaker(tenant.datasourceUrl);
        await breaker.fire(tenantPrisma);
        opMetrics.observePreflight(Date.now() - t0);
      } catch (e: any) {
        const requestId = (req as any).requestId;
        logger.warn('dedicated_db_unavailable', { tenantId: tenant.id, requestId, error: e?.message });
        opMetrics.inc('dbUnavailable', 1, { tenantId: hashTenantId(tenant.id) });
        if (shouldAuditUnavailable(tenant.id)) {
          await AuditService.log({
            tenantId: tenant.id,
            action: 'dedicated_db.unavailable',
            resource: 'tenant',
            resourceId: tenant.id,
            reason: 'preflight',
          });
        }
        res.setHeader('Retry-After', '10');
        return res.status(503).json({
          code: 'DEDICATED_DB_UNAVAILABLE',
          tenantId: tenant.id,
          requestId,
          retryAfterSec: 10
        });
      }
    }

    // Store context; do NOT set session-level GUCs here (avoid pool bleed).
    // withTenantContext() will run each handler in a tx and SET LOCAL.
    res.locals.tenant = tenant;
    res.locals.prisma = tenantPrisma;
    tenantContext.run({ tenant, prisma: tenantPrisma }, () => next());

  } catch (error) {
    logger.error('Tenant resolution failed', { 
      error: (error as Error).message,
      origin: req.headers.origin,
      host: req.headers.host,
      apiKey: req.headers['x-api-key'] ? 'provided' : 'missing'
    });
    
    return res.status(401).json({ 
      error: 'Tenant not found or inactive',
      message: (error as Error).message 
    });
  }
};

/**
 * Get current tenant context
 */
export const getCurrentTenant = (): TenantContext => {
  const context = tenantContext.getStore();
  if (!context) {
    throw new Error('No tenant context available');
  }
  return context.tenant;
};

/**
 * Get tenant-specific Prisma client
 */
export const getTenantPrisma = (): PrismaClient => {
  const context = tenantContext.getStore();
  if (!context) {
    throw new Error('No tenant context available');
  }
  return context.prisma;
};

// Export withTenantContext from TenantService to avoid circular dependency
export function withTenantContext<T>(
  tenant: TenantContext,
  fn: (prisma: PrismaClient | Prisma.TransactionClient) => Promise<T>
) {
  return TenantService.withTenantContext(tenant, fn);
}

/**
 * Wrap all existing handlers in a router so each executes inside
 * TenantService.withTenantContext(…): guarantees a single tx + SET LOCAL.
 */
export function bindRouterTenantContext(router: Router): Router {
  const wrapped = Router({ mergeParams: (router as any).mergeParams });

  wrapped.use(async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const tenant = req.tenant || (res.locals?.tenant as TenantContext | undefined);
      if (!tenant) return next(new Error('Tenant not resolved'));

      await TenantService.withTenantContext(tenant, async () => {
        // Run the ENTIRE router pipeline inside one tx + SET LOCAL
        await new Promise<void>((resolve, reject) => {
          (router as any).handle(req, res, (err: any) => (err ? reject(err) : resolve()));
        });
      });

      res.locals.routePath = res.locals.routePath || req.baseUrl + (req.route?.path ?? '');

      // Note: response may already be sent by the inner handler chain.
      if (!res.headersSent) next();
    } catch (err) {
      next(err);
    }
  });

  return wrapped;
}

export const getTenantId = () => tenantContext.getStore()?.tenant?.id as string;