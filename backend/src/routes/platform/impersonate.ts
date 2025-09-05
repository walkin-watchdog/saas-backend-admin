import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { ImpersonationService, REVOKE, type RevokeResult } from '../../services/impersonationService';
import { AuditService } from '../../services/auditService';
import { idempotency } from '../../middleware/idempotency';

const router = express.Router();

const impersonateSchema = z.object({
  tenantId: z.string(),
  reason: z.string().min(1),
  scope: z.enum(['read_only', 'billing_support', 'full_tenant_admin']),
  durationMinutes: z.number().min(1).max(480).optional().default(120), // max 8 hours
});

const revokeSchema = z.object({
  reason: z.string().min(1),
});

// Create impersonation grant
router.post('/', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  idempotency,
  requirePlatformPermissions('impersonation.issue'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = impersonateSchema.parse(req.body);
      
      // Check if tenant exists and is active
      const { getPrismaClient } = await import('../../utils/prisma');
      const prisma = getPrismaClient({ bypassRls: true });
      const tenant = await prisma.tenant.findUnique({
        where: { id: data.tenantId },
        select: { id: true, name: true, status: true }
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      if (tenant.status !== 'active') {
        return res.status(400).json({ error: 'Cannot impersonate inactive tenant' });
      }

      const result = await ImpersonationService.createGrant({
        platformUserId: req.platformUser!.id,
        tenantId: data.tenantId,
        reason: data.reason,
        scope: data.scope,
        durationMinutes: data.durationMinutes
      });

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        tenantId: data.tenantId,
        action: 'impersonation.granted',
        resource: 'impersonation_grant',
        resourceId: result.grant.id,
        changes: {
          scope: data.scope,
          durationMinutes: data.durationMinutes,
          tenantName: tenant.name
        },
        reason: data.reason
      });
      const loginUrl = `${process.env.ADMIN_URL || ''}/impersonate/${result.token}`;
      res.json({
        token: result.token,
        loginUrl,
        expiresAt: result.grant.expiresAt,
        grantId: result.grant.id
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get active impersonation grants
router.get('/grants',
  requirePlatformPermissions('impersonation.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { limit = 50, offset = 0, tenantId, platformUserId } = z.object({
        tenantId: z.string().optional(),
        platformUserId: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }).parse(req.query);

      const grants = await ImpersonationService.findActiveGrants({
        tenantId,
        platformUserId,
        limit,
        offset
      });
      
      res.json({
        grants,
        pagination: { limit, offset }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Revoke impersonation grant
router.post('/grants/:id/revoke', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('impersonation.revoke'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason } = revokeSchema.parse(req.body);
      
      const result: RevokeResult = await ImpersonationService.revokeGrant(
        req.params.id,
        req.platformUser!.id,
        reason
      );

      if (result === REVOKE.NOT_FOUND) {
        return res.status(404).json({ error: 'Impersonation grant not found' });
      }
      if (result === REVOKE.ALREADY_REVOKED) {
        return res.status(409).json({ error: 'Impersonation grant already revoked' });
      }
      if (result === REVOKE.ERROR) {
        return res.status(500).json({ error: 'Failed to revoke impersonation grant' });
      }

      res.json({
        message: 'Impersonation grant revoked successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get impersonation history for a tenant
router.get('/tenants/:tenantId/history', 
  requirePlatformPermissions('impersonation.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const history = await ImpersonationService.getImpersonationHistory(req.params.tenantId);
      
      res.json({ history });
    } catch (error) {
      next(error);
    }
  }
);

export default router;