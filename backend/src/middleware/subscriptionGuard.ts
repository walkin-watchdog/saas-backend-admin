import { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, getTenantId } from './tenantMiddleware';

/**
 * Ensures the tenant has an active (or trialing, if allowed) subscription.
 * Login remains available; this only guards paid features.
 */
export function requireActiveSubscription(options: { allowTrial?: boolean } = { allowTrial: true }) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getTenantPrisma();
      const tenantId = getTenantId();
      if (!tenantId) {
        return res.status(400).json({ error: 'TENANT_REQUIRED' });
      }
      const sub = await prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
      });

      // No subscription at all
      if (!sub) return res.status(402).json({ error: 'SUBSCRIPTION_REQUIRED' });

      // Explicit suspension → block paid features
      if (sub.status === 'suspended') {
        return res.status(402).json({ error: 'SUBSCRIPTION_SUSPENDED' });
      }

      // Allowed statuses: active (+ trialing if enabled)
      const allowed = new Set<string>(['active', ...(options.allowTrial ? ['trialing'] : [])]);
      if (allowed.has(sub.status)) {
        return next();
      }

      // Anything else (past_due, paused, cancelled, inactive, etc.)
      return res.status(402).json({ error: 'SUBSCRIPTION_REQUIRED' });
    } catch (err) {
      return next(err);
    }
  };
}