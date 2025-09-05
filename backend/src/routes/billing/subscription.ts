import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { SubscriptionService } from '../../services/subscriptionService';
import { TenantRequest } from '../../middleware/tenantMiddleware';
import { idempotency } from '../../middleware/idempotency';
import { AuthRequest } from '../../middleware/auth';
import { InvoiceAccessService } from '../../services/invoiceAccessService';

const router = express.Router();

const changePlanSchema = z.object({
  planId: z.string(),
});

const createSchema = z
  .object({
    planId: z.string(),
    currency: z.enum(['USD', 'INR']).optional().default('USD'),
    provider: z.enum(['razorpay', 'paypal']).optional(),
  })
  .refine((data) => data.currency !== 'INR' || !data.provider || data.provider === 'razorpay', {
    path: ['provider'],
    message: 'Razorpay required for INR subscriptions',
  });

const cancelSchema = z.object({
  reason: z.string().optional(),
});

router.get('/current',
  authenticate,
  authorize(['ADMIN', 'EDITOR', 'VIEWER']),
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const tenantId = req.tenantId!;
      const sub = await SubscriptionService.getCurrentSubscription(tenantId);
      if (!sub) return res.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
      const format = (d?: Date) => (d ? d.toISOString() : undefined);
      res.json({
        ...sub,
        currentPeriodEnd: format(sub.currentPeriodEnd),
        trialStartedAt: format(sub.trialStartedAt),
        trialEndsAt: format(sub.trialEndsAt),
        trialConvertedAt: format(sub.trialConvertedAt),
        createdAt: format(sub.createdAt)!,
        updatedAt: format(sub.updatedAt)!,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/create', authenticate, authorize(['ADMIN']), idempotency, async (req: TenantRequest, res, next) => {
  try {
    const { planId, currency, provider } = createSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const sub = await SubscriptionService.createSubscription(tenantId, planId, {
      currency,
      provider,
      trial: true,
    });
    res.json({ subscriptionId: sub.id, status: sub.status, providerId: sub.platformSubscriptionId });
  } catch (err) {
    next(err);
  }
});

router.patch('/change-plan', authenticate, authorize(['ADMIN']), idempotency, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { planId } = changePlanSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const result = await SubscriptionService.changePlan(tenantId, planId);
    let secureUrl: string | undefined;
    let expiresAt: Date | undefined;
    if (result.invoice) {
      const token = await InvoiceAccessService.grantPdfAccess({
        invoiceId: result.invoice.id,
        tenantId,
        user: req.user!,
        baseUrl: `${req.protocol}://${req.get('host')}`,
      });
      secureUrl = token.secureUrl;
      expiresAt = token.expiresAt;
    }

    res.json({ invoiceId: result.invoice.id, secureUrl, expiresAt });
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', authenticate, authorize(['ADMIN']), idempotency, async (req: TenantRequest, res, next) => {
  try {
    const { reason } = cancelSchema.parse(req.body ?? {});
    const tenantId = req.tenantId!;
    const sub = await SubscriptionService.cancelSubscription(tenantId, reason);
    res.json({ subscriptionId: sub.id, status: sub.status });
  } catch (err) {
    next(err);
  }
});

router.post('/resume', authenticate, authorize(['ADMIN']), idempotency, async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const sub = await SubscriptionService.resumeSubscription(tenantId);
    res.json({ subscriptionId: sub.id, status: sub.status });
  } catch (err) {
    next(err);
  }
});

export default router;