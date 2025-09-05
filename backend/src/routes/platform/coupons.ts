import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { PlatformCouponService } from '../../services/platformCouponService';
import { getPrismaClient } from '../../utils/prisma';

const prisma = getPrismaClient({ bypassRls: true });

const router = express.Router();

const couponBaseSchema = z.object({
  code: z.string().min(1).max(50),
  type: z.enum(['percent', 'fixed']),
  amount: z.number().min(0).optional(),
  amountUsd: z.number().min(0).optional(),
  amountInr: z.number().min(0).optional(),
  duration: z.enum(['once', 'repeating', 'forever']),
  durationInMonths: z.number().int().positive().optional(),
  appliesToPlanIds: z.array(z.string()).optional(),
  maxRedemptions: z.number().int().positive().optional(),
  redeemBy: z.preprocess(
    (v) => (typeof v === 'string' ? new Date(v) : v),
    z.date().optional()
  ),
  active: z.boolean().optional().default(true),
});

const createCouponSchema = couponBaseSchema.superRefine((data, ctx) => {
  if (data.type === 'percent') {
    if (typeof data.amount !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'amount is required for percent coupons' });
    } else if (data.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Percent amount must be ≤ 100' });
    }
  }
  if (data.type === 'fixed') {
    if (typeof data.amountUsd !== 'number' || typeof data.amountInr !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amountUsd'], message: 'amountUsd and amountInr are required for fixed coupons' });
    }
  }
  if (data.duration === 'repeating' && !data.durationInMonths) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['durationInMonths'], message: 'durationInMonths is required for repeating coupons' });
  }
  if (data.duration !== 'repeating' && data.durationInMonths) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['durationInMonths'], message: 'durationInMonths must be omitted unless duration is repeating' });
  }
});

const updateCouponSchema = couponBaseSchema.partial().superRefine((data, ctx) => {
  // Only enforce when relevant fields are present in the payload
  if (data.type === 'percent' && typeof data.amount === 'number' && data.amount > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amount'],
      message: 'Percent amount must be ≤ 100',
    });
  }
  if (data.type === 'fixed' && 'type' in data) {
    if (data.amountUsd === undefined || data.amountInr === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountUsd'],
        message: 'amountUsd and amountInr are required when type=fixed',
      });
    }
  }
  if (data.duration === 'repeating' && (data.durationInMonths as any) === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationInMonths'],
      message: 'durationInMonths is required when duration=repeating',
    });
  }
  if (data.duration && data.duration !== 'repeating' && data.durationInMonths !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationInMonths'],
      message: 'durationInMonths must be omitted unless duration is repeating',
    });
  }
});

const validateCouponSchema = z.object({
  code: z.string(),
  planId: z.string().optional(),
  subscriptionId: z.string().optional(),
  currency: z.enum(['USD', 'INR']).optional(),
});

const redeemCouponSchema = z.object({
  couponCode: z.string(),
  tenantId: z.string(),
  subscriptionId: z.string().optional(),
  invoiceId: z.string().optional(),
  amountApplied: z.number().min(0),
  planId: z.string().optional(),
  currency: z.enum(['USD', 'INR']),
});

const previewCouponSchema = z.object({
  couponCode: z.string(),
  planId: z.string(),
  amount: z.number().min(0),
  currency: z.enum(['USD', 'INR']).optional(),
  subscriptionId: z.string().optional(),
});

function statusForCouponError(err?: string): number {
  switch (err) {
    case 'Coupon not found':
      return 404;
    case 'Coupon has expired':
      return 410; // Gone
    case 'Coupon not applicable to this plan':
      return 422; // Unprocessable Entity
    case 'Coupon is inactive':
    case 'Maximum redemptions reached':
      return 409; // Conflict
    case 'Coupon already applied to this subscription':
      return 409; // Conflict (already applied / duplicate)
    case 'Plan ID required to validate this coupon':
      return 400;
    case 'Subscription ID required to validate this coupon':
      return 400; // Bad Request
    default:
      return 400;
  }
}

// Get all coupons
router.get('/', 
  requirePlatformPermissions('coupons.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = z.object({
        active: z.coerce.boolean().optional(),
        type: z.string().optional(),
        planId: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }).parse(req.query);

      const coupons = await PlatformCouponService.findCoupons(filters);
      
      res.json({
        coupons,
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

// Create coupon
router.post('/', 
  requirePlatformPermissions('coupons.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = createCouponSchema.parse(req.body);
      
      const coupon = await PlatformCouponService.createCoupon(data, req.platformUser!.id);
      
      res.status(201).json(coupon);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', issues: error.errors });
      }
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Coupon code already exists' });
      }
      next(error);
    }
  }
);

// Update coupon
router.put('/:id', 
  requirePlatformPermissions('coupons.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = updateCouponSchema.parse(req.body);
      
      const coupon = await PlatformCouponService.updateCoupon(
        req.params.id,
        data,
        req.platformUser!.id
      );
      
      res.json(coupon);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', issues: error.errors });
      }
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Coupon code already exists' });
      }
      next(error);
    }
  }
);

// Deactivate coupon
router.post('/:id/deactivate',
  requirePlatformPermissions('coupons.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const coupon = await PlatformCouponService.deactivateCoupon(
        req.params.id,
        req.platformUser!.id
      );
      
      res.json(coupon);
    } catch (error) {
      next(error);
    }
  }
);

// Activate/deactivate toggle
router.post('/:id/activate',
  requirePlatformPermissions('coupons.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const coupon = await PlatformCouponService.toggleCouponActive(
        req.params.id,
        req.platformUser!.id
      );

      res.json(coupon);
    } catch (error) {
      next(error);
    }
  }
);

// Validate coupon
router.post('/validate',
  requirePlatformPermissions('coupons.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { code, planId, subscriptionId, currency } = validateCouponSchema.parse(req.body);

      const validation = await PlatformCouponService.validateCoupon(
        code,
        planId,
        subscriptionId,
        subscriptionId ? undefined : currency,
      );

      if (!validation.valid) {
        return res.status(statusForCouponError(validation.error)).json(validation);
      }
      return res.json(validation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', issues: error.errors });
      }
      next(error);
    }
  }
);

// Preview coupon application
router.post('/preview',
  requirePlatformPermissions('coupons.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { couponCode, planId, amount, currency, subscriptionId } = previewCouponSchema.parse(req.body);
      const preview = await PlatformCouponService.previewCoupon(
        couponCode,
        planId,
        amount,
        subscriptionId ? undefined : currency,
        subscriptionId,
      );
      if (!preview.valid) {
        return res.status(statusForCouponError(preview.error)).json(preview);
      }
      return res.json(preview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', issues: error.errors });
      }
      next(error);
    }
  }
);

// Apply coupon
router.post('/apply',
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('coupons.redeem'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = redeemCouponSchema.parse(req.body);
      const idemKey = req.header('Idempotency-Key') || undefined;

      // Fast-path idempotency: if a redemption with this key already exists, return it.
      if (idemKey) {
        const existing = await prisma.couponRedemption.findUnique({ where: { redemptionKey: idemKey } });
        if (existing) {
          return res.status(200).json(existing);
        }
      }

      // Validate coupon first
      const couponMeta = await PlatformCouponService.findCouponByCode(data.couponCode);
      if (!couponMeta) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
      if (couponMeta.duration !== 'once' && !data.subscriptionId) {
        return res.status(400).json({ error: 'Subscription ID is required to apply this coupon' });
      } 

      let planId = data.planId;
      if (!planId && data.subscriptionId) {
        const sub = await prisma.subscription.findUnique({
          where: { id: data.subscriptionId },
          select: { planId: true }
        });
        planId = sub?.planId;
      }

      // If coupon is restricted to plans, we require a planId. Otherwise it's optional.
      if (couponMeta.appliesToPlanIds && couponMeta.appliesToPlanIds.length > 0 && !planId) {
        return res.status(400).json({ error: 'Plan ID is required to apply this coupon' });
      }

      const validation = await PlatformCouponService.validateCoupon(
        data.couponCode,
        planId,
        data.subscriptionId,
        data.subscriptionId ? undefined : data.currency,
      );
      if (!validation.valid) {
        // Allow idempotent replay to succeed if the exact same request has already been processed.
        if (idemKey) {
          const existing = await prisma.couponRedemption.findUnique({ where: { redemptionKey: idemKey } });
          if (existing) {
            return res.status(200).json(existing);
          }
        }
        return res.status(statusForCouponError(validation.error)).json({ error: validation.error });
      }

      const redemption = await PlatformCouponService.redeemCoupon({
        ...data,
        planId,
        redeemedByPlatformUserId: req.platformUser!.id,
        redemptionKey: idemKey,
        currency: validation.currency || data.currency,
      });
      
      res.json(redemption);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', issues: error.errors });
      }
      next(error);
    }
  }
);

// Get coupon usage
router.get('/:id/usage', 
  requirePlatformPermissions('coupons.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const usage = await PlatformCouponService.getCouponUsage(req.params.id);
      
      res.json(usage);
    } catch (error) {
      next(error);
    }
  }
);

export default router;