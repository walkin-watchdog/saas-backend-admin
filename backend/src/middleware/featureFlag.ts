import { Request, Response, NextFunction } from 'express';
import { FeatureFlagService } from '../services/featureFlagService';
import { getTenantId } from './tenantMiddleware';

export function requireFeature(feature: string) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId();
      if (!tenantId) {
        return res.status(400).json({ error: 'TENANT_REQUIRED' });
      }
      const enabled = await FeatureFlagService.isEnabled(feature, tenantId);
      if (!enabled) {
        return res.status(403).json({ error: 'FEATURE_NOT_AVAILABLE' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}