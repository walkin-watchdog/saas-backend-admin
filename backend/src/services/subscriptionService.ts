import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PrismaClient, Prisma, UsageRecord } from '@prisma/client';
import { withTenantContext } from '../middleware/tenantMiddleware';
import { GatewayCredentialResolver } from './gatewayCredentialResolver';
import { eventBus, BILLING_EVENTS } from '../utils/eventBus';
import { TenantConfigService } from './tenantConfigService';
import { PayPalService } from './paypalService';
import { logger } from '../utils/logger';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';
import { KycService } from './kycService';
import { AuditService } from './auditService';

const prisma = new PrismaClient();

export class SubscriptionService {
  private static normalizeTaxPercent(input?: number): number {
    if (typeof input !== 'number' || isNaN(input)) return 0;
    const pct = input > 1 ? input / 100 : input; // allow 18 or 0.18
    if (pct < 0) return 0;
    if (pct > 1) return 1;
    return pct;
  }
  private static async razorpayClient() {
    const creds = await GatewayCredentialResolver('platform');
    return new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
  }

  static getPlanPrice(plan: any, currency: string, period?: 'monthly' | 'yearly') {
    const target = period || (plan.billingFrequency === 'yearly' ? 'yearly' : 'monthly');
    const price = plan.prices?.find(
      (p: any) => p.currency === currency && p.period === target,
    );
    return price?.amountInt ?? null;
  }

  static async getCurrentSubscription(tenantId: string): Promise<any | null> {
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId },
        include: { plan: { include: { prices: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) return null;

      const getPrice = (currency: string, period: string) =>
        sub.plan.prices.find((p: any) => p.currency === currency && p.period === period)?.amountInt ?? 0;

      return {
        id: sub.id,
        tenantId: sub.tenantId,
        planId: sub.planId,
        currency: sub.currency,
        status: sub.status,
        platformCustomerId: sub.platformCustomerId || undefined,
        platformSubscriptionId: sub.platformSubscriptionId || undefined,
        currentPeriodEnd: sub.currentPeriodEnd || undefined,
        trialStartedAt: sub.trialStartedAt || undefined,
        trialEndsAt: sub.trialEndsAt || undefined,
        trialConvertedAt: sub.trialConvertedAt || undefined,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        plan: {
          id: sub.plan.id,
          marketingName: sub.plan.marketingName,
          marketingDescription: sub.plan.marketingDescription,
          featureHighlights: sub.plan.featureHighlights,
          billingFrequency: sub.plan.billingFrequency,
          prices: {
            USD: {
              monthly: getPrice('USD', 'monthly'),
              yearly: getPrice('USD', 'yearly'),
            },
            INR: {
              monthly: getPrice('INR', 'monthly'),
              yearly: getPrice('INR', 'yearly'),
            },
          },
          public: sub.plan.public,
          active: sub.plan.active,
        },
      };
    });
  }

  static async createSubscription(
    tenantId: string,
    planId: string,
    opts: {
      couponCode?: string;
      trial?: boolean;
      currency?: 'USD' | 'INR';
      provider?: 'razorpay' | 'paypal';
    } = {},
  ) {
    const currency = opts.currency ?? 'USD';
    let provider: 'razorpay' | 'paypal';
    if (currency === 'INR') {
      if (opts.provider && opts.provider !== 'razorpay') {
        const e: any = new Error('INVALID_PROVIDER');
        e.status = 400;
        throw e;
      }
      provider = 'razorpay';
    } else {
      if (opts.provider && !['razorpay', 'paypal'].includes(opts.provider)) {
        const e: any = new Error('INVALID_PROVIDER');
        e.status = 400;
        throw e;
      }
      provider = opts.provider || 'paypal';
    }
    const plan = await prisma.plan.findUnique({ where: { id: planId }, include: { prices: true } });
    if (!plan) throw new Error('PLAN_NOT_FOUND');
    const planPrice = plan.prices.find(
      (p) => p.currency === currency && p.period === plan.billingFrequency,
    );
    if (!planPrice || planPrice.amountInt <= 0) {
      const e: any = new Error('PLAN_PRICE_NOT_AVAILABLE');
      e.status = 422;
      throw e;
    }

    // If caller explicitly requests no trial (immediate activation),
    // require KYC to be verified before proceeding.
    if (opts.trial === false) {
      await KycService.requireVerified(tenantId);
    }

    // Derive a tenant code from name for metadata / invoice numbering
    let tenantName: string | undefined;
    await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const t = await (tenantPrisma as PrismaClient).tenant.findUnique({ where: { id: tenantId } });
      tenantName = t?.name;
    });
    const tenantCode = (tenantName || tenantId)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);

      let sub: any;
      let checkoutUrl: string | undefined;
      const trial = opts.trial !== false;

      if (provider === 'razorpay') {
        const razorpay = await this.razorpayClient();
        let platformCustomerId: string | undefined;
        let defaultTokenId: string | undefined;
        await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
        // Prefer payment method's customer link
        platformCustomerId =
          (await (tenantPrisma as PrismaClient).paymentMethod.findFirst({
            where: { tenantId },
            select: { platformCustomerId: true },
          }))?.platformCustomerId || undefined;
        const def = await (tenantPrisma as PrismaClient).paymentMethod.findFirst({
          where: { tenantId, isDefault: true },
          select: { gatewayPaymentMethodId: true },
        });
        defaultTokenId = def?.gatewayPaymentMethodId;
        if (!platformCustomerId) {
          // Fall back to last subscription record to avoid duplication
          platformCustomerId =
            (await (tenantPrisma as PrismaClient).subscription.findFirst({
              where: { tenantId, platformCustomerId: { not: null } },
              orderBy: { createdAt: 'desc' },
              select: { platformCustomerId: true },
            }))?.platformCustomerId || undefined;
        }
      });
      if (!platformCustomerId) {
        const created = await razorpay.customers.create({
          name: tenantName || tenantCode,
          notes: { tenantId, tenantCode },
        });
        platformCustomerId = created.id;
      }

      const payload: any = {
        plan_id: plan.code,
        customer_notify: 1,
        notes: { tenantId, tenantCode },
        customer_id: platformCustomerId,
      };
      if (trial) {
        payload.trial_end = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
      }
      if (opts.couponCode) {
        payload.offer_id = opts.couponCode;
      }
      if (defaultTokenId) {
        // Bind default token so provider can auto-charge upcoming invoices.
        payload.token = defaultTokenId;
      }
        const gatewaySub: any = await razorpay.subscriptions.create(payload);

        sub = await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
        const data: any = {
          tenantId,
          planId,
          currency,
          status: trial ? 'trialing' : 'incomplete',
          platformCustomerId,
          platformSubscriptionId: gatewaySub.id,
        };
        if (trial) {
          data.currentPeriodEnd = gatewaySub.current_end
            ? new Date(gatewaySub.current_end * 1000)
            : null;
          data.trialStartedAt = new Date();
          data.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
        return (tenantPrisma as PrismaClient).subscription.create({ data });
      });
        if (!trial) {
          checkoutUrl = gatewaySub.short_url;
        }
      } else {
        if (opts.couponCode) {
          // Explicitly document current limitation so callers aren't surprised.
          logger.warn('Coupon code provided for PayPal subscription but coupons are not supported yet; ignoring.', {
            tenantId,
            planId,
          });
        }
        const gatewaySub = await PayPalService.createSubscription(plan.code, tenantId, tenantCode, { scope: 'platform' });
        sub = await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
        const data: any = {
          tenantId,
          planId,
          currency,
          status: trial ? 'trialing' : 'incomplete',
          platformCustomerId: gatewaySub.subscriber?.payer_id,
          platformSubscriptionId: gatewaySub.id,
        };
        if (trial) {
          data.currentPeriodEnd = gatewaySub.billing_info?.next_billing_time
            ? new Date(gatewaySub.billing_info.next_billing_time)
            : null;
          data.trialStartedAt = new Date();
          data.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
        return (tenantPrisma as PrismaClient).subscription.create({ data });
      });
        if (!trial) {
          checkoutUrl = (gatewaySub as any).links?.find((l: any) => l.rel === 'approve')?.href;
        }
      }
      eventBus.publish(BILLING_EVENTS.SUBSCRIPTION_STATE_CHANGED, {
        tenantId,
        subscriptionId: sub.id,
        status: sub.status,
      });
      if (!trial && checkoutUrl) {
        return { id: sub.id, checkoutUrl };
      }
      return sub;
    }

  static async recordWebhook(provider: string, eventId: string, payload: string) {
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const parsedPayload = (() => {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    })();
    try {
      await prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          payloadHash: hash,
          payload: parsedPayload,
          status: 'received',
        },
      });
      return { alreadyProcessed: false };
    } catch (e: any) {
      // Unique violation on (provider,eventId)
      if (e?.code === 'P2002') {
        const existing = await prisma.webhookEvent.findUnique({
          where: { provider_eventId: { provider, eventId } },
        });
        if (existing && existing.payloadHash !== hash) {
          // Same eventId with different body → suspicious replay; let caller NACK (409/400)
          throw new Error('WEBHOOK_REPLAY_HASH_MISMATCH');
        }
        return { alreadyProcessed: true };
      }
      throw e;
    }
  }

  /**
   * Transition a subscription to a new status and emit state change event.
   * Accepts a prisma instance scoped via withTenantContext to ensure isolation.
   */
  static async transitionStatus(
    tenantPrisma: PrismaClient | Prisma.TransactionClient,
    subscriptionId: string,
    status: string,
    tenantId: string,
  ) {
    const current = await tenantPrisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { status: true },
    });
    const data: any = { status };
    // Track stable "past due" anchor so dunning clock doesn't reset on unrelated writes
    if (status === 'past_due' && current?.status !== 'past_due') {
      data.pastDueSince = new Date();
    }
    if (status !== 'past_due' && current?.status === 'past_due') {
      data.pastDueSince = null;
    }
    const updated = await tenantPrisma.subscription.update({
      where: { id: subscriptionId },
      data,
    });
    eventBus.publish(BILLING_EVENTS.SUBSCRIPTION_STATE_CHANGED, {
      tenantId,
      subscriptionId,
      status: updated.status,
    });
    return updated;
  }

  /**
   * Change the plan for an active subscription and generate a proration invoice.
   */
  static async changePlan(tenantId: string, newPlanId: string) {
    await KycService.requireVerified(tenantId);
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing', 'past_due'] } },
        include: { plan: { include: { prices: true } } },
      });
      if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
      const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId }, include: { prices: true } });
      if (!newPlan) throw new Error('PLAN_NOT_FOUND');
      // Disallow assigning inactive/private plans
      if (!newPlan.active || !newPlan.public) {
        const err: any = new Error('PLAN_FORBIDDEN');
        err.status = 422;
        throw err;
      }

      const now = new Date();
      const periodEnd = sub.currentPeriodEnd || now;
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / MS_PER_DAY);
      // Denominator must reflect the billing cycle of each plan independently
      type BillingFreq = 'monthly' | 'yearly';
      const toFreq = (f: string): BillingFreq => (f === 'yearly' ? 'yearly' : 'monthly');
      const daysInCycle = (freq: BillingFreq) => (freq === 'yearly' ? 365 : 30);
      const oldCycleDays = daysInCycle(toFreq(sub.plan.billingFrequency));
      const newCycleDays = daysInCycle(toFreq(newPlan.billingFrequency));
      const oldPrice = SubscriptionService.getPlanPrice(sub.plan, sub.currency);
      const newPrice = SubscriptionService.getPlanPrice(newPlan, sub.currency);
      if (
        oldPrice == null ||
        newPrice == null ||
        oldPrice < 0 ||
        newPrice <= 0
      ) {
        const err: any = new Error('PLAN_PRICE_NOT_AVAILABLE');
        err.status = 422;
        throw err;
      }
      const oldDaily = oldPrice / oldCycleDays;
      const newDaily = newPrice / newCycleDays;
      const prorated = Math.round((newDaily - oldDaily) * remainingDays);

      const taxCfg = await TenantConfigService
        .getConfig<{ percent: number; jurisdiction: string }>(tenantId, 'tax')
        .catch(() => null);
      const taxPercent = SubscriptionService.normalizeTaxPercent(taxCfg?.percent);
      const taxAmount = Math.round(prorated * taxPercent);

      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const count = await tenantPrisma.invoice.count({ where: { tenantId, createdAt: { gte: yearStart } } });
      const number = `INV-${tenantId.slice(0, 6).toUpperCase()}-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

      const invoice = await tenantPrisma.invoice.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          amount: prorated + taxAmount,
          status: prorated + taxAmount >= 0 ? 'due' : 'credit',
          number,
          currency: sub.currency,
          priceSnapshot: {
            currency: sub.currency,
            monthly: SubscriptionService.getPlanPrice(newPlan, sub.currency, 'monthly'),
            yearly: SubscriptionService.getPlanPrice(newPlan, sub.currency, 'yearly'),
          },
          taxSnapshot: { percent: taxPercent, amount: taxAmount },
          taxPercent,
          taxAmount,
          jurisdiction: taxCfg?.jurisdiction,
          planVersion: newPlan.version,
        },
      });
      await AuditService.log({
        tenantId,
        action: 'invoice.issued',
        resource: 'invoice',
        resourceId: invoice.id,
        changes: { amount: invoice.amount, currency: invoice.currency },
      });
      PlatformEventBus.publish(PLATFORM_EVENTS.INVOICE_ISSUED, {
        tenantId,
        invoiceId: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
      });
      if (sub.platformSubscriptionId) {
        try {
          if (sub.platformSubscriptionId.startsWith('sub_')) {
            const razorpay = await this.razorpayClient();
            await razorpay.subscriptions.update(sub.platformSubscriptionId, {
              plan_id: newPlan.code,
              schedule_change_at: 'now',
            } as any);
          } else if (sub.platformSubscriptionId.startsWith('I-')) {
            await PayPalService.updateSubscriptionPlan(
              sub.platformSubscriptionId,
              newPlan.code,
              { scope: 'platform' }
            );
          }
        } catch (err) {
          throw new Error('GATEWAY_PLAN_UPDATE_FAILED');
        }
      }

      await tenantPrisma.subscription.update({
        where: { id: sub.id },
        data: { planId: newPlanId },
      });
      eventBus.publish(BILLING_EVENTS.SUBSCRIPTION_STATE_CHANGED, {
        tenantId,
        subscriptionId: sub.id,
        status: sub.status,
      });

      return { invoice };
    });
  }

  static async previewPlanChange(tenantId: string, newPlanId: string) {
    await KycService.requireVerified(tenantId);
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing', 'past_due'] } },
        include: { plan: { include: { prices: true } } },
      });
      if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
      const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId }, include: { prices: true } });
      if (!newPlan) throw new Error('PLAN_NOT_FOUND');
      // Disallow assigning inactive/private plans
      if (!newPlan.active || !newPlan.public) {
        const err: any = new Error('PLAN_FORBIDDEN');
        err.status = 422;
        throw err;
      }

      const now = new Date();
      const periodEnd = sub.currentPeriodEnd || now;
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / MS_PER_DAY);
      type BillingFreq = 'monthly' | 'yearly';
      const toFreq = (f: string): BillingFreq => (f === 'yearly' ? 'yearly' : 'monthly');
      const daysInCycle = (freq: BillingFreq) => (freq === 'yearly' ? 365 : 30);
      const oldCycleDays = daysInCycle(toFreq(sub.plan.billingFrequency));
      const newCycleDays = daysInCycle(toFreq(newPlan.billingFrequency));
      const oldPrice = SubscriptionService.getPlanPrice(sub.plan, sub.currency);
      const newPrice = SubscriptionService.getPlanPrice(newPlan, sub.currency);
      if (
        oldPrice == null ||
        newPrice == null ||
        oldPrice < 0 ||
        newPrice <= 0
      ) {
        const err: any = new Error('PLAN_PRICE_NOT_AVAILABLE');
        err.status = 422;
        throw err;
      }
      const oldDaily = oldPrice / oldCycleDays;
      const newDaily = newPrice / newCycleDays;
      const prorated = Math.round((newDaily - oldDaily) * remainingDays);

      const taxCfg = await TenantConfigService
        .getConfig<{ percent: number; jurisdiction: string }>(tenantId, 'tax')
        .catch(() => null);
      const taxPercent = SubscriptionService.normalizeTaxPercent(taxCfg?.percent);
      const taxAmount = Math.round(prorated * taxPercent);

      return { amount: prorated + taxAmount, taxAmount, taxPercent };
    });
  }

  static async schedulePlanChange(tenantId: string, newPlanId: string) {
    await KycService.requireVerified(tenantId);
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing', 'past_due'] } },
        include: { plan: { include: { prices: true } } },
      });
      if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
      const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId }, include: { prices: true } });
      if (!newPlan) throw new Error('PLAN_NOT_FOUND');
      // Disallow assigning inactive/private plans
      if (!newPlan.active || !newPlan.public) {
        const err: any = new Error('PLAN_FORBIDDEN');
        err.status = 422;
        throw err;
      }

      const newPrice = newPlan.prices.find(
        (p) => p.currency === sub.currency && p.period === newPlan.billingFrequency,
      );
      if (!newPrice || newPrice.amountInt <= 0) {
        const err: any = new Error('PLAN_PRICE_NOT_AVAILABLE');
        err.status = 422;
        throw err;
      }
      if (sub.platformSubscriptionId) {
        try {
          if (sub.platformSubscriptionId.startsWith('sub_')) {
            const razorpay = await this.razorpayClient();
            await razorpay.subscriptions.update(sub.platformSubscriptionId, {
              plan_id: newPlan.code,
              schedule_change_at: 'cycle_end',
            } as any);
          } else if (sub.platformSubscriptionId.startsWith('I-')) {
            await PayPalService.updateSubscriptionPlan(
              sub.platformSubscriptionId,
              newPlan.code,
              { scope: 'platform' }
            );
          }
        } catch (err) {
          throw new Error('GATEWAY_PLAN_UPDATE_FAILED');
        }
      }

      const effectiveAt = sub.currentPeriodEnd || new Date();
      await tenantPrisma.subscription.update({
        where: { id: sub.id },
        data: {
          scheduledPlanId: newPlanId,
          scheduledPlanVersion: newPlan.version,
          scheduledChangeDate: effectiveAt,
        },
      });

      return { effectiveAt };
    });
  }

  static async cancelSubscription(tenantId: string, reason?: string) {
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing', 'past_due', 'paused'] } },
      });
      if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
      if (sub.platformSubscriptionId?.startsWith('sub_')) {
        const razorpay = await this.razorpayClient();
        await razorpay.subscriptions.cancel(sub.platformSubscriptionId, { cancel_at_cycle_end: 0 } as any);
      } else if (sub.platformSubscriptionId?.startsWith('I-')) {
        await PayPalService.cancelSubscription(sub.platformSubscriptionId, reason || 'Cancelled by tenant admin', { scope: 'platform' });
      }
      const updated = await this.transitionStatus(tenantPrisma, sub.id, 'cancelled', tenantId);
      return updated;
    });
  }

  static async resumeSubscription(tenantId: string) {
    return withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { tenantId, status: { in: ['paused', 'suspended'] } },
      });
      if (!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
      if (sub.platformSubscriptionId?.startsWith('sub_')) {
        const razorpay = await this.razorpayClient();
        await razorpay.subscriptions.resume(sub.platformSubscriptionId, { resume_at: 'now' } as any);
      } else if (sub.platformSubscriptionId?.startsWith('I-')) {
        await PayPalService.activateSubscription(sub.platformSubscriptionId, { scope: 'platform' });
      }
      const updated = await this.transitionStatus(tenantPrisma, sub.id, 'active', tenantId);
      return updated;
    });
  }

  static async processWebhook(provider: string, payload: string) {
    const event = JSON.parse(payload);
    const eventId = event.id as string;
    const providerEventId = { provider, eventId } as const;

    try {

    // --- begin: idempotency lease (prevents concurrent/process replays) ---
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const LEASE_MS = 2 * 60 * 1000; // 2 minutes
    const now = new Date();
    const staleBefore = new Date(now.getTime() - LEASE_MS);

    // Ensure a row exists even if recordWebhook wasn't called
    try {
      await prisma.webhookEvent.create({
        data: { provider, eventId, payloadHash: hash, payload: event, status: 'received' },
      });
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e; // ignore unique violation
    }

    // enforce hash consistency even if processWebhook is called directly
    const existingRow = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
    });
    if (existingRow && existingRow.payloadHash !== hash) {
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider, eventId } },
        data: { status: 'hash_mismatch' },
      }).catch(() => {});
      throw new Error('WEBHOOK_REPLAY_HASH_MISMATCH');
    }


    // Try to claim a processing lease
    const claim = await prisma.webhookEvent.updateMany({
      where: {
        provider,
        eventId,
        processedAt: null,
        OR: [
          { status: { in: ['received', 'tenant_resolution_failed'] } },
          // Re-claim if a previous "processing" lease looks stale
          { status: 'processing', receivedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'processing' },
    });

    if (claim.count === 0) {
      const existing = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider, eventId } },
      });
      // Already processed → no-op
      if (existing && (existing.status === 'processed' || existing.processedAt)) {
        return { tenantResolved: true, processed: false };
      }
      // Another worker has a fresh lease → no-op
      if (existing && existing.status === 'processing' && existing.receivedAt && existing.receivedAt > staleBefore) {
        return { tenantResolved: true, processed: false };
      }
      // else fall through and try to process (stale/unknown state)
    }
    // --- end: idempotency lease ---

    let tenantId: string | undefined;
    let platformSubId: string | undefined;
    let amount: number | undefined;

    if (provider === 'razorpay') {
      const entity =
        event.payload?.subscription?.entity ||
        event.payload?.payment?.entity ||
        event.payload?.invoice?.entity;
      tenantId = entity?.notes?.tenantId;
      platformSubId = entity?.subscription_id || entity?.id;
      amount = entity?.amount ? entity.amount / 100 : undefined;
    } else if (provider === 'paypal') {
      const resource = event.resource;
      tenantId = resource?.custom_id?.split('::')[0];
      platformSubId = resource?.billing_agreement_id || resource?.id;
      // PayPal "sale" events have amount.total, "capture" events have amount.value (string)
      const amt = resource?.amount;
      if (amt) {
        if (typeof amt.value === 'string') {
          amount = parseFloat(amt.value);
        } else if (typeof amt.total === 'string') {
          amount = parseFloat(amt.total);
        }
      }
    }

    if (!tenantId) {
      logger.warn('TENANT_RESOLUTION_FAILED (processWebhook)', { provider, eventId });
      // Do NOT mark processed; let route NACK to trigger retry
      try {
        await prisma.webhookEvent.update({ where: { provider_eventId: providerEventId }, data: { status: 'tenant_resolution_failed' } });
      } catch {}
      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_FAILED, { provider, eventId });
      return { tenantResolved: false, processed: false };
    }

    let processed = false;
    await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const sub = await tenantPrisma.subscription.findFirst({
        where: { platformSubscriptionId: platformSubId },
        include: { plan: { include: { prices: true } } },
      });
      if (!sub) {
        logger.warn('TENANT_RESOLUTION_FAILED (no subscription matched)', { provider, eventId, tenantId, platformSubId });
        return;
      }
      const type = provider === 'razorpay' ? event.event : event.event_type;
      switch (type) {
        case 'subscription.activated':
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          await this.transitionStatus(tenantPrisma, sub.id, 'active', tenantId!);
          processed = true;
          break;
        case 'subscription.paused':
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
          await this.transitionStatus(tenantPrisma, sub.id, 'paused', tenantId!);
          processed = true;
          break;
        case 'subscription.cancelled':
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          await this.transitionStatus(tenantPrisma, sub.id, 'cancelled', tenantId!);
          processed = true;
          break;
        case 'payment.failed':
        case 'invoice.payment_failed':
        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        case 'PAYMENT.SALE.DENIED':
        case 'PAYMENT.CAPTURE.DENIED':
          await this.transitionStatus(tenantPrisma, sub.id, 'past_due', tenantId!);
          processed = true;
          break;
        case 'payment.captured':
        case 'invoice.paid':
        case 'invoice.partially_paid':
        case 'PAYMENT.SALE.COMPLETED':
        case 'PAYMENT.CAPTURE.COMPLETED':
          if (amount && sub.plan) {
            const yearStart = new Date(new Date().getFullYear(), 0, 1);
            const count = await tenantPrisma.invoice.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            });
            const number = `INV-${tenantId.slice(0, 6).toUpperCase()}-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

            const taxCfg = await TenantConfigService.getConfig<{ percent: number; jurisdiction: string }>(tenantId, 'tax').catch(() => null);
            const taxPercent = SubscriptionService.normalizeTaxPercent(taxCfg?.percent);
            const baseAmount = Math.round(amount * 100);

            // Apply coupon entitlement if present
            let discount = 0;
            const entitlement = await tenantPrisma.couponEntitlement.findFirst({
              where: {
                subscriptionId: sub.id,
                OR: [{ remainingPeriods: { gt: 0 } }, { unlimited: true }],
              },
              include: { coupon: true },
            });

            if (entitlement) {
              if (entitlement.coupon.type === 'percent') {
                discount = Math.round((baseAmount * entitlement.coupon.amount) / 100);
              } else {
                const fixed =
                  sub.currency === 'INR'
                    ? entitlement.coupon.amountInr
                    : entitlement.coupon.amountUsd;
                discount = Math.min(Math.round((fixed || 0) * 100), baseAmount);
              }

              if (!entitlement.unlimited) {
                await tenantPrisma.couponEntitlement.update({
                  where: { id: entitlement.id },
                  data: { remainingPeriods: { decrement: 1 } },
                });
              }
            }

            // Determine usage since last invoice
            const lastInvoice = await tenantPrisma.invoice.findFirst({
              where: { subscriptionId: sub.id },
              orderBy: { createdAt: 'desc' },
            });
            const periodMs = sub.plan.billingFrequency === 'yearly'
              ? 365 * 24 * 60 * 60 * 1000
              : 30 * 24 * 60 * 60 * 1000;
            const usageStart = lastInvoice ? lastInvoice.createdAt : new Date(Date.now() - periodMs);
            const usage: UsageRecord[] = await tenantPrisma.usageRecord.findMany({
              where: { tenantId, occurredAt: { gte: usageStart } },
            });

            const usageAmount = usage.reduce(
              (sum, u) =>
                sum +
                Math.round((((u.metadata as any)?.unitPrice || 0) as number) * u.quantity),
              0,
            );
            const discountedBase = baseAmount - discount;
            const subtotal = discountedBase + usageAmount;
            const taxAmount = Math.round(subtotal * taxPercent);

            const invoice = await tenantPrisma.invoice.create({
              data: {
                tenantId,
                subscriptionId: sub.id,
                currency: sub.currency,
                amount: subtotal + taxAmount,
                usageAmount,
                status: 'paid',
                number,
                priceSnapshot: {
                  currency: sub.currency,
                  monthly: SubscriptionService.getPlanPrice(sub.plan, sub.currency, 'monthly'),
                  yearly: SubscriptionService.getPlanPrice(sub.plan, sub.currency, 'yearly'),
                },
                taxSnapshot: { percent: taxPercent, amount: taxAmount },
                taxPercent,
                taxAmount,
                jurisdiction: taxCfg?.jurisdiction,
                planVersion: sub.plan.version,
              },
            });
            await AuditService.log({
              tenantId,
              action: 'invoice.issued',
              resource: 'invoice',
              resourceId: invoice.id,
              changes: { amount: invoice.amount, currency: invoice.currency },
            });
            PlatformEventBus.publish(PLATFORM_EVENTS.INVOICE_ISSUED, {
              tenantId,
              invoiceId: invoice.id,
              amount: invoice.amount,
              currency: invoice.currency,
            });

            if (entitlement && discount > 0) {
              await tenantPrisma.couponRedemption.create({
                data: {
                  couponId: entitlement.couponId,
                  tenantId,
                  subscriptionId: sub.id,
                  invoiceId: invoice.id,
                  amountApplied: discount / 100,
                  currency: sub.currency,
                  redemptionKey: crypto.randomUUID(),
                },
              });
            }
          }
          await this.transitionStatus(tenantPrisma, sub.id, 'active', tenantId!);
          processed = true;
          break;
      }
    });
    if (processed) {
      await prisma.webhookEvent
        .update({ where: { provider_eventId: providerEventId }, data: { processedAt: new Date(), status: 'processed' } })
        .catch(() => {});
      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_PROCESSED, { provider, eventId });
    } else {
      await prisma.webhookEvent
        .update({ where: { provider_eventId: providerEventId }, data: { status: 'received' } })
        .catch(() => {});
      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_FAILED, { provider, eventId });
    }
    return { tenantResolved: true, processed };
    } catch (err) {
      await prisma.webhookEvent
        .update({ where: { provider_eventId: providerEventId }, data: { status: 'processing_error' } })
        .catch(() => {});
      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_FAILED, {
        provider,
        eventId,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}