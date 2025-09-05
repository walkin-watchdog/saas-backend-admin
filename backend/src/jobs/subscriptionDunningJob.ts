import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../middleware/tenantMiddleware';
import { SubscriptionService } from '../services/subscriptionService';
import { logger } from '../utils/logger';
import { eventBus, BILLING_EVENTS } from '../utils/eventBus';
import { jobQueueDepth, jobDuration, hashTenantId, dunningRetryCounter } from '../utils/metrics';

const prisma = new PrismaClient();

/**
 * Handles trial expiration and simple dunning.
 * - trialing -> past_due once trialEndsAt passes
 * - past_due for >=3 days -> suspended
 */
export class SubscriptionDunningJob {
  static async process() {
    const now = new Date();
    // Iterate per-tenant to remain compatible with RLS
    const tenants = await prisma.tenant.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const t of tenants) {
      await withTenantContext({ id: t.id } as any, async (tenantPrisma) => {
        const start = Date.now();
        const subs = await (tenantPrisma as PrismaClient).subscription.findMany({
          where: {
            OR: [
              { status: 'trialing', trialEndsAt: { lte: now } },
              { status: 'past_due' },
            ],
          },
        });
        jobQueueDepth.set({ job: 'subscription_dunning', tenant: hashTenantId(t.id) }, subs.length);
        for (const sub of subs) {
          if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt <= now) {
            await SubscriptionService.transitionStatus(
              tenantPrisma as PrismaClient,
              sub.id,
              'past_due',
              sub.tenantId,
            );
            await (tenantPrisma as PrismaClient).subscription.update({
              where: { id: sub.id },
              data: { dunningAttempts: 0, dunningLastAttemptAt: now },
            });
            eventBus.publish(BILLING_EVENTS.DUNNING_NOTICE_SENT, { tenantId: sub.tenantId, subscriptionId: sub.id, attempt: 0 });
          } else if (sub.status === 'past_due') {
            const anchor = sub.pastDueSince
              ? new Date(Math.min(sub.pastDueSince.getTime(), sub.updatedAt.getTime()))
              : sub.updatedAt;
            const daysPastDue = (now.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24);
            const daysSinceLast = sub.dunningLastAttemptAt
              ? (now.getTime() - sub.dunningLastAttemptAt.getTime()) / (1000 * 60 * 60 * 24)
              : Infinity;
            const backoff = Math.pow(2, sub.dunningAttempts); // 1,2,4 days
            if (sub.dunningAttempts < 3 && daysSinceLast >= backoff) {
              await (tenantPrisma as PrismaClient).subscription.update({
                where: { id: sub.id },
                data: {
                  dunningAttempts: { increment: 1 },
                  dunningLastAttemptAt: now,
                },
              });
              dunningRetryCounter.labels(hashTenantId(t.id)).inc();
              eventBus.publish(BILLING_EVENTS.DUNNING_NOTICE_SENT, {
                tenantId: sub.tenantId,
                subscriptionId: sub.id,
                attempt: sub.dunningAttempts + 1,
              });
            }
            if (daysPastDue >= 3 && sub.dunningAttempts >= 3) {
              await SubscriptionService.transitionStatus(
                tenantPrisma as PrismaClient,
                sub.id,
                'suspended',
                sub.tenantId,
              );
            }
          }
        }
        jobDuration.observe({ job: 'subscription_dunning', tenant: hashTenantId(t.id) }, Date.now() - start);
      }).catch((e) => logger.error('Dunning loop error for tenant', { tenantId: t.id, error: e }));
    }
  }
}
