import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { KycService } from '../../services/kycService';

const router = express.Router();

const kycFiltersSchema = z.object({
  tenantId: z.string().optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  provider: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const reviewKycSchema = z
  .object({
    status: z.enum(['verified', 'rejected']),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'rejected' && (!val.notes || !val.notes.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'notes is required when status=rejected',
      });
    }
  });

const createKycSchema = z.object({
  tenantId: z.string(),
  status: z.enum(['pending', 'verified', 'rejected']).optional().default('pending'),
  provider: z.string().optional(),
  refId: z.string().optional(),
  notes: z.string().optional(),
});

// Get all KYC records
router.get('/',
  requirePlatformPermissions('kyc.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = kycFiltersSchema.parse(req.query);
      const records = await KycService.findKycRecords(filters);
      
      res.json({
        records,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Overview stats
router.get('/stats/overview',
  requirePlatformPermissions('kyc.read'),
  async (_req: PlatformAuthRequest, res, next) => {
    try {
      const stats = await KycService.getOverviewStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

// Latest KYC record for tenant
router.get('/tenant/:tenantId',
  requirePlatformPermissions('kyc.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const record = await KycService.getLatestForTenant(req.params.tenantId);
      if (!record) return res.status(404).json({ error: 'KYC record not found' });
      res.json(record);
    } catch (error) {
      next(error);
    }
  }
);

// Get single KYC record
router.get('/:id', 
  requirePlatformPermissions('kyc.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const record = await KycService.findKycRecordById(req.params.id);
      
      if (!record) {
        return res.status(404).json({ error: 'KYC record not found' });
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  }
);

// Review KYC record
router.post('/:id/review', 
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('kyc.review'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const reviewData = reviewKycSchema.parse(req.body);
      
      const record = await KycService.reviewKycRecord(
        req.params.id,
        reviewData,
        req.platformUser!.id
      );
      
      res.json(record);
    } catch (error) {
      next(error);
    }
  }
);

// Create KYC record
router.post('/', 
  requirePlatformPermissions('kyc.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = createKycSchema.parse(req.body);
      
      const record = await KycService.createKycRecord(data);
      
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  }
);

// Get KYC status for tenant
router.get('/tenant/:tenantId/status', 
  requirePlatformPermissions('kyc.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const isVerified = await KycService.isKycVerified(req.params.tenantId);
      
      res.json({
        tenantId: req.params.tenantId,
        kycVerified: isVerified
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;