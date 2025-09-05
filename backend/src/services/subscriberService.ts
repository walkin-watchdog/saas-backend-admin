import { withPlatformRole } from '../utils/prisma';
import { SubscriberInfo } from '../types/platform';
import { AuditService } from './auditService';
import { KycService } from './kycService';
import { SubscriptionService } from './subscriptionService';

export class SubscriberService {
  static async findSubscribers(filters: {
    billingStatus?: string;
    kycStatus?: string;
    planId?: string;
    tags?: string[];
    assignedCsmId?: string;
    mrrBand?: string;
    churnRisk?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SubscriberInfo[]> {
    const where: any = {};

    if (filters.billingStatus) where.billingStatus = filters.billingStatus;
    if (filters.kycStatus) where.kycStatus = filters.kycStatus;
    if (filters.assignedCsmId) where.assignedCsmId = filters.assignedCsmId;
    if (filters.mrrBand) where.mrrBand = filters.mrrBand;
    if (filters.churnRisk) where.churnRisk = filters.churnRisk;
    
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const tenantFilter: any = {};
    if (filters.planId) {
      tenantFilter.subscriptions = {
        some: {
          planId: filters.planId,
          status: { in: ['active', 'trialing', 'past_due'] },
        },
      };
    }

    const subscribers = await withPlatformRole(tx => tx.subscriber.findMany({
      where: { ...where, ...(filters.planId ? { tenant: tenantFilter } : {}) },
      include: {
        tenant: {
          select: {
            name: true,
            status: true,
            createdAt: true,
            subscriptions: {
              where: { status: { in: ['active', 'trialing', 'past_due'] } },
              include: {
                plan: {
                  select: {
                    marketingName: true,
                    billingFrequency: true,
                    prices: true
                  }
                }
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            }
          }
        }
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { createdAt: 'desc' }
    }));

    return subscribers.map(subscriber => {
      const sub = subscriber.tenant.subscriptions[0];
      let subscription: any = undefined;
      if (sub) {
        const price = SubscriptionService.getPlanPrice(
          sub.plan as any,
          sub.currency,
          sub.plan.billingFrequency as any,
        );
        subscription = {
          status: sub.status,
          currency: sub.currency,
          price,
          plan: { marketingName: sub.plan.marketingName },
        };
      }
      return {
        tenantId: subscriber.tenantId,
        displayName: subscriber.displayName,
        ownerEmail: subscriber.ownerEmail,
        billingStatus: subscriber.billingStatus as any,
        kycStatus: subscriber.kycStatus as any,
        tags: subscriber.tags,
        notes: subscriber.notes ?? undefined,
        assignedCsmId: subscriber.assignedCsmId ?? undefined,
        mrrBand: subscriber.mrrBand ?? undefined,
        churnRisk: subscriber.churnRisk ?? undefined,
        tenant: subscriber.tenant,
        subscription,
      };
    });
  }

  static async findSubscriberByTenantId(tenantId: string): Promise<SubscriberInfo | null> {
    const subscriber = await withPlatformRole(tx => tx.subscriber.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: {
            name: true,
            status: true,
            createdAt: true,
            subscriptions: {
              include: { plan: { select: { marketingName: true, billingFrequency: true, prices: true } } },
              orderBy: { createdAt: 'desc' }
            },
            invoices: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        }
      }
    }));

    if (!subscriber) return null;

    const usage = await withPlatformRole(tx => tx.usageRecord.findMany({
      where: { tenantId, occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      orderBy: { occurredAt: 'desc' }
    }));

    const activeSub = subscriber.tenant.subscriptions[0];
    let subscription: any = undefined;
    if (activeSub) {
      const price = SubscriptionService.getPlanPrice(
        activeSub.plan as any,
        activeSub.currency,
        activeSub.plan.billingFrequency as any,
      );
      subscription = {
        status: activeSub.status,
        currency: activeSub.currency,
        price,
        plan: { marketingName: activeSub.plan.marketingName },
      };
    }

    const resp: SubscriberInfo & { dunning?: { active: boolean; since?: Date } } = {
      tenantId: subscriber.tenantId,
      displayName: subscriber.displayName,
      ownerEmail: subscriber.ownerEmail,
      billingStatus: subscriber.billingStatus as any,
      kycStatus: subscriber.kycStatus as any,
      tags: subscriber.tags,
      notes: subscriber.notes ?? undefined,
      assignedCsmId: subscriber.assignedCsmId ?? undefined,
      mrrBand: subscriber.mrrBand ?? undefined,
      churnRisk: subscriber.churnRisk ?? undefined,
      tenant: subscriber.tenant,
      subscription,
      usageRecords: usage
    };
    if (activeSub?.status === 'past_due') {
      (resp as any).dunning = { active: true, since: (activeSub as any).pastDueSince ?? undefined };
    } else {
      (resp as any).dunning = { active: false };
    }
    return resp;
  }

  static async getUsageHistory(tenantId: string) {
    return withPlatformRole(tx => tx.usageRecord.findMany({
      where: { tenantId },
      orderBy: { occurredAt: 'desc' }
    }));
  }

  static async getInvoices(tenantId: string) {
    return withPlatformRole(tx => tx.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    }));
  }

  static async createSubscriber(data: {
    tenantId: string;
    displayName: string;
    ownerEmail: string;
    billingStatus?: string;
    kycStatus?: string;
    tags?: string[];
    notes?: string;
    assignedCsmId?: string;
    mrrBand?: string;
    churnRisk?: string;
  }) {
    return withPlatformRole(tx => tx.subscriber.create({
      data: {
        tenantId: data.tenantId,
        displayName: data.displayName,
        ownerEmail: data.ownerEmail,
        billingStatus: data.billingStatus || 'trialing',
        kycStatus: data.kycStatus || 'pending',
        tags: data.tags || [],
        notes: data.notes,
        assignedCsmId: data.assignedCsmId,
        mrrBand: data.mrrBand,
        churnRisk: data.churnRisk
      }
    }));
  }

  static async updateSubscriber(tenantId: string, data: {
    displayName?: string;
    ownerEmail?: string;
    billingStatus?: string;
    kycStatus?: string;
    tags?: string[];
    notes?: string;
    assignedCsmId?: string;
    mrrBand?: string;
    churnRisk?: string;
  }, platformUserId?: string) {
    const subscriber = await withPlatformRole(tx => tx.subscriber.update({
      where: { tenantId },
      data
    }));

    if (platformUserId) {
      await AuditService.log({
        platformUserId,
        tenantId,
        action: 'subscriber.updated',
        resource: 'subscriber',
        resourceId: tenantId,
        changes: data
      });
    }

    return subscriber;
  }

  static async suspendSubscriber(tenantId: string, reason: string, platformUserId: string) {
    const current = await withPlatformRole(tx => tx.subscriber.findUnique({
      where: { tenantId },
      select: { billingStatus: true }
    }));
    const already = current?.billingStatus === 'suspended';

    if (!already) {
      await this.updateSubscriber(tenantId, { 
        billingStatus: 'suspended',
        notes: `Suspended: ${reason}`
      }, platformUserId);
      await withPlatformRole(tx => tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended' }
      }));
    }

    await AuditService.log({
      platformUserId,
      tenantId,
      action: 'subscriber.suspended',
      resource: 'subscriber',
      resourceId: tenantId,
      reason,
      ...(already ? { metadata: { noop: true } as any } : {})
    });

    return !already; // changed?
  }

  static async resumeSubscriber(tenantId: string, reason: string, platformUserId: string) {
    await KycService.requireVerified(tenantId);
    // Update subscriber status
    await this.updateSubscriber(tenantId, {
      billingStatus: 'active'
    }, platformUserId);

    // Update tenant status
    await withPlatformRole(tx => tx.tenant.update({
      where: { id: tenantId },
      data: { status: 'active' }
    }));

    await AuditService.log({
      platformUserId,
      tenantId,
      action: 'subscriber.resumed',
      resource: 'subscriber',
      resourceId: tenantId,
      reason
    });
  }

  static async extendTrial(
    tenantId: string,
    extensionDays: number,
    reason: string,
    platformUserId: string
  ) {
    await KycService.requireVerified(tenantId);
    const subscription = await withPlatformRole(tx => tx.subscription.findFirst({
      where: { tenantId, status: 'trialing' }
    }));

    if (!subscription) {
      throw new Error('No active trial subscription found');
    }

    const currentTrialEnd = subscription.trialEndsAt || new Date();
    const newTrialEnd = new Date(currentTrialEnd.getTime() + (extensionDays * 24 * 60 * 60 * 1000));

    await withPlatformRole(tx => tx.subscription.update({
      where: { id: subscription.id },
      data: { trialEndsAt: newTrialEnd }
    }));

    await AuditService.log({
      platformUserId,
      tenantId,
      action: 'trial.extended',
      resource: 'subscription',
      resourceId: subscription.id,
      changes: { extensionDays, newTrialEnd },
      reason
    });

    return { newTrialEnd };
  }
}