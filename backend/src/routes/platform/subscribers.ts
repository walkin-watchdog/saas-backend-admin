import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { SubscriberService } from '../../services/subscriberService';
import { SubscriptionService } from '../../services/subscriptionService';
import { AuditService } from '../../services/auditService';
import { CreditNoteService } from '../../services/creditNoteService';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { idempotency } from '../../middleware/idempotency';
import { prisma } from '../../utils/prisma';

const router = express.Router();

// Map known domain errors to appropriate HTTP codes for this router.
function mapDomainError(err: any, res: express.Response): boolean {
  const msg = (err?.message || '').toString();
  const explicit = Number.isInteger(err?.status) ? err.status : undefined;
  const table: Record<string, number> = {
    PLAN_NOT_FOUND: 404,
    INVOICE_NOT_FOUND: 404,
    PLAN_FORBIDDEN: 422,
    'No active trial subscription found': 409,
    CREDIT_EXCEEDS_OUTSTANDING: 400,
    INVALID_CURRENCY: 400,
    GATEWAY_PLAN_UPDATE_FAILED: 502,
    KYC_REQUIRED: 403,
  };
  const code = explicit ?? table[msg];
  if (code) {
    res.status(code).json({ error: msg });
    return true;
  }
  return false;
}

const subscriberFiltersSchema = z.object({
  billingStatus: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'suspended']).optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  planId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedCsmId: z.string().optional(),
  mrrBand: z.string().optional(),
  churnRisk: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const updateSubscriberSchema = z.object({
  displayName: z.string().min(1).optional(),
  ownerEmail: z.string().email().optional(),
  billingStatus: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'suspended']).optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  assignedCsmId: z.string().optional(),
  mrrBand: z.string().optional(),
  churnRisk: z.string().optional(),
});

const changePlanSchema = z.object({
  planId: z.string(),
  scheduleAtPeriodEnd: z.boolean().optional().default(false),
});

const planChangePreviewSchema = z.object({
  amount: z.number(),
  taxAmount: z.number(),
  taxPercent: z.number(),
});

type PlanChangePreview = z.infer<typeof planChangePreviewSchema>;

const suspendSchema = z.object({
  reason: z.string().min(1),
});

const extendTrialSchema = z.object({
  extensionDays: z.number().min(1).max(90),
  reason: z.string().min(1),
});

const issueCreditNoteSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().optional(),
  reason: z.string().min(1),
  invoiceId: z.string().optional(),
  note: z.string().optional(),
});

// Get all subscribers
router.get('/', 
  requirePlatformPermissions('subscribers.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = subscriberFiltersSchema.parse(req.query);
      const subscribers = await SubscriberService.findSubscribers(filters);
      
      res.json({
        subscribers,
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

// Get single subscriber
router.get('/:tenantId',
  requirePlatformPermissions('subscribers.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const subscriber = await SubscriberService.findSubscriberByTenantId(req.params.tenantId);
      
      if (!subscriber) {
        return res.status(404).json({ error: 'Subscriber not found' });
      }

      res.json(subscriber);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:tenantId/usage-history',
  requirePlatformPermissions('subscribers.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const history = await SubscriberService.getUsageHistory(req.params.tenantId);
      res.json({ usage: history });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:tenantId/invoices',
  requirePlatformPermissions('subscribers.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const invoices = await SubscriberService.getInvoices(req.params.tenantId);
      res.json({ invoices });
    } catch (error) {
      next(error);
    }
  }
);

// Update subscriber
router.put('/:tenantId', 
  requirePlatformPermissions('subscribers.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = updateSubscriberSchema.parse(req.body);
      
      const subscriber = await SubscriberService.updateSubscriber(
        req.params.tenantId,
        data,
        req.platformUser!.id
      );
      
      res.json(subscriber);
    } catch (error) {
      next(error);
    }
  }
);

// Change subscriber plan
router.post('/:tenantId/plan', 
  requirePlatformPermissions('subscribers.billing'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { planId, scheduleAtPeriodEnd } = changePlanSchema.parse(req.body);
      let result;
      if (scheduleAtPeriodEnd) {
        result = await SubscriptionService.schedulePlanChange(req.params.tenantId, planId);
        await AuditService.log({
          platformUserId: req.platformUser!.id,
          tenantId: req.params.tenantId,
          action: 'subscriber.plan_change_scheduled',
          resource: 'subscription',
          changes: { planId, scheduleAtPeriodEnd }
        });
      } else {
        result = await SubscriptionService.changePlan(req.params.tenantId, planId);
        await AuditService.log({
          platformUserId: req.platformUser!.id,
          tenantId: req.params.tenantId,
          action: 'subscriber.plan_changed',
          resource: 'subscription',
          changes: { planId, scheduleAtPeriodEnd }
        });
      }

      res.json(result);
    } catch (error) {
      if (!mapDomainError(error, res)) next(error);
    }
  }
);

// Preview plan change
router.post('/:tenantId/plan/preview',
  requirePlatformPermissions('subscribers.billing'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { planId } = z.object({ planId: z.string() }).parse(req.body);
      const preview = await SubscriptionService.previewPlanChange(req.params.tenantId, planId);
      const validated: PlanChangePreview = planChangePreviewSchema.parse(preview);
      res.json(validated);
    } catch (error) {
      if (!mapDomainError(error, res)) next(error);
    }
  }
);

// Suspend subscriber
router.post('/:tenantId/suspend', 
  requirePlatformPermissions('subscribers.suspend'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason } = suspendSchema.parse(req.body);
      const changed = await SubscriberService.suspendSubscriber(
        req.params.tenantId,
        reason,
        req.platformUser!.id
      );
      
      res.json({
        message: changed ? 'Subscriber suspended successfully' : 'Already suspended',
        noop: !changed
      });
    } catch (error) {
      next(error);
    }
  }
);

// Resume subscriber
router.post('/:tenantId/resume', 
  requirePlatformPermissions('subscribers.suspend'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { reason = 'Resumed by platform admin' } = req.body;

      await SubscriberService.resumeSubscriber(
        req.params.tenantId,
        reason,
        req.platformUser!.id
      );
      
      res.json({ message: 'Subscriber resumed successfully' });
    } catch (error) {
      if (!mapDomainError(error, res)) next(error);
    }
  }
);

// Extend trial
router.post('/:tenantId/trial/extend',
  requirePlatformPermissions('subscribers.billing'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { extensionDays, reason } = extendTrialSchema.parse(req.body);

      const result = await SubscriberService.extendTrial(
        req.params.tenantId,
        extensionDays,
        reason,
        req.platformUser!.id
      );
      
      res.json(result);
    } catch (error) {
      if (!mapDomainError(error, res)) next(error);
    }
  }
);

// Issue credit note for subscriber
router.post('/:tenantId/credit-notes',
  platformSensitiveLimiter,
  idempotency,
  requirePlatformPermissions('credit_notes.issue'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = issueCreditNoteSchema.parse(req.body);
      const subscription = await prisma.subscription.findFirst({ where: { tenantId: req.params.tenantId } });
      if (!subscription) return res.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
      if (data.currency && data.currency !== subscription.currency) {
        return res.status(400).json({ error: 'INVALID_CURRENCY' });
      }
      const currency = data.currency ?? subscription.currency;
      const note = await CreditNoteService.create({ ...data, currency, tenantId: req.params.tenantId }, req.platformUser!.id);
      res.status(201).json(note);
    } catch (error) {
      if (!mapDomainError(error, res)) next(error);
    }
  }
);

// Assign CSM
router.post('/:tenantId/assign-csm', 
  requirePlatformPermissions('subscribers.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { csmId } = z.object({ csmId: z.string() }).parse(req.body);
      
      const subscriber = await SubscriberService.updateSubscriber(
        req.params.tenantId,
        { assignedCsmId: csmId },
        req.platformUser!.id
      );
      
      res.json(subscriber);
    } catch (error) {
      next(error);
    }
  }
);

// Update tags
router.post('/:tenantId/tags', 
  requirePlatformPermissions('subscribers.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { tags } = z.object({ tags: z.array(z.string()) }).parse(req.body);
      
      const subscriber = await SubscriberService.updateSubscriber(
        req.params.tenantId,
        { tags },
        req.platformUser!.id
      );
      
      res.json(subscriber);
    } catch (error) {
      next(error);
    }
  }
);

// Update notes
router.put('/:tenantId/notes', 
  requirePlatformPermissions('subscribers.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { notes } = z.object({ notes: z.string() }).parse(req.body);
      
      const subscriber = await SubscriberService.updateSubscriber(
        req.params.tenantId,
        { notes },
        req.platformUser!.id
      );
      
      res.json(subscriber);
    } catch (error) {
      next(error);
    }
  }
);

export default router;