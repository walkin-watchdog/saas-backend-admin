import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { PlatformMetricsService } from '../../services/platformMetricsService';

const router = express.Router();

const metricsQuerySchema = z.object({
  timeframe: z.enum(['day', 'week', 'month']).optional().default('month'),
});

const growthQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional().default(30),
});

// Get dashboard metrics
router.get('/dashboard', 
  requirePlatformPermissions('metrics.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { timeframe } = metricsQuerySchema.parse(req.query);
      
      const metrics = await PlatformMetricsService.getDashboardMetrics(timeframe);
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get revenue metrics
router.get('/revenue', 
  requirePlatformPermissions('metrics.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { timeframe } = metricsQuerySchema.parse(req.query);
      
      const metrics = await PlatformMetricsService.getRevenueMetrics(timeframe);
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get growth metrics
router.get('/growth', 
  requirePlatformPermissions('metrics.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { days } = growthQuerySchema.parse(req.query);
      
      const metrics = await PlatformMetricsService.getGrowthMetrics(days);
      
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// Get tenant health overview
router.get('/tenants/health', 
  requirePlatformPermissions('metrics.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { getPrismaClient } = await import('../../utils/prisma');
      const prisma = getPrismaClient({ bypassRls: true });
      
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        activeSubscriptions,
        pastDueSubscriptions,
        trialingSubscriptions
      ] = await Promise.all([
        prisma.tenant.count(),
        prisma.tenant.count({ where: { status: 'active' } }),
        prisma.tenant.count({ where: { status: 'suspended' } }),
        prisma.subscription.count({ where: { status: 'active' } }),
        prisma.subscription.count({ where: { status: 'past_due' } }),
        prisma.subscription.count({ where: { status: 'trialing' } })
      ]);

      res.json({
        tenants: {
          total: totalTenants,
          active: activeTenants,
          suspended: suspendedTenants,
          healthScore: totalTenants > 0 ? (activeTenants / totalTenants) * 100 : 0
        },
        subscriptions: {
          active: activeSubscriptions,
          pastDue: pastDueSubscriptions,
          trialing: trialingSubscriptions,
          total: activeSubscriptions + pastDueSubscriptions + trialingSubscriptions
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;