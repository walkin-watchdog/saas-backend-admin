import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { idempotency } from '../../middleware/idempotency';
import { PlatformTenantService, ServiceError } from '../../services/platformTenantService';
import { TenantService } from '../../services/tenantService';
import { evictDedicatedClient } from '../../utils/prisma';
import { AuditService } from '../../services/auditService';
import { logger } from '../../utils/logger';

const router = express.Router();

const tenantFiltersSchema = z.object({
  status: z.enum(['active', 'suspended', 'pending']).optional(),
  billingStatus: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'suspended']).optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const offboardSchema = z.object({
  reason: z.string().min(1),
  scheduledAt: z.string().transform(str => new Date(str)).optional(),
  retentionDays: z.number().min(1).max(365).optional().default(30),
});

const restoreSchema = z.object({
  reason: z.string().min(1),
});

// Get all tenants
router.get('/', 
  requirePlatformPermissions('tenants.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = tenantFiltersSchema.parse(req.query);
      const { tenants, total } = await PlatformTenantService.listTenants(filters);
      res.json({
        tenants,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
          total
        }
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      next(error);
    }
  }
);

// Get tenant stats overview
router.get('/stats/overview', 
  requirePlatformPermissions('tenants.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const stats = await PlatformTenantService.statsOverview();
      res.json(stats);
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      return next(error);
    }
  }
);

// Get single tenant
router.get('/:tenantId', 
  requirePlatformPermissions('tenants.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const tenant = await PlatformTenantService.getTenant(req.params.tenantId);
      
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      res.json(tenant);
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      next(error);
    }
  }
);

// Schedule tenant offboarding
router.post('/:tenantId/offboard', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  idempotency,
  requirePlatformPermissions('tenants.offboard'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason, scheduledAt, retentionDays } = offboardSchema.parse(req.body);
      const job = await PlatformTenantService.scheduleOffboard({
        tenantId: req.params.tenantId,
        reason,
        scheduledAt: scheduledAt || new Date(),
        retentionDays,
        initiatedById: req.platformUser!.id,
      });

      res.json({
        message: 'Tenant offboarding scheduled successfully',
        scheduledAt: job.scheduledAt,
        retentionDays: job.retentionDays
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      next(error);
    }
  }
);

// Restore tenant from offboarding
router.post('/:tenantId/restore', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('tenants.restore'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason } = restoreSchema.parse(req.body);
      
      await PlatformTenantService.restoreTenant(
        req.params.tenantId,
        reason,
        req.platformUser!.id
      );

      res.json({
        message: 'Tenant restored successfully'
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      next(error);
    }
  }
);

// Hard delete tenant (destructive)
router.delete('/:tenantId/hard-delete', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('tenants.hard_delete'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      
      await PlatformTenantService.hardDeleteTenant(
        req.params.tenantId,
        reason,
        req.platformUser!.id
      );

      res.json({
        message: 'Tenant permanently deleted'
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...(error.meta || {}) });
      }
      next(error);
    }
  }
);

// POST /api/platform/tenants/:id/evict-client  (audited, safe no-op for shared)
router.post('/:id/evict-client',
  requireMfaEnabled,
  requirePlatformPermissions('tenants.manage'),
  async (req, res) => {
  const { id } = req.params;
  const t = await TenantService.getTenantById(id);
  if (!t) return res.status(404).json({ error: 'tenant_not_found' });
  if (t.dedicated && t.datasourceUrl) {
    evictDedicatedClient(t.datasourceUrl, 'admin_endpoint');
    logger.info('tenant.client_evicted', { tenantId: id });
    await AuditService.log({
      platformUserId: (req as any).platformUser?.id,
      tenantId: id,
      action: 'tenant.client_evicted',
      resource: 'tenant',
      resourceId: id,
      reason: 'admin_endpoint',
    });
  }
  return res.json({ ok: true });
});

export default router;