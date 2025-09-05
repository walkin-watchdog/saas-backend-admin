import { logger } from '../utils/logger';
import { AuditService } from '../services/auditService';
import { TenantService } from '../services/tenantService';
import { OffboardingJobService } from '../services/offboardingJobService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class OffboardTenantJob {
  static async processOffboarding() {
    const now = new Date();
    const jobs = await OffboardingJobService.listDue(now);
    for (const job of jobs) {
      try {
        const locked = await OffboardingJobService.markProcessing(job.id);
        if (!locked) continue;
        logger.info(`Processing offboarding for tenant ${job.tenantId}`);
        await this.performOffboarding(job.tenantId, job.reason, job.initiatedById);
        await OffboardingJobService.markCompleted(job.id);
        await AuditService.log({
          platformUserId: job.initiatedById,
          tenantId: job.tenantId,
          action: 'tenant.offboarded',
          resource: 'tenant',
          resourceId: job.tenantId,
          changes: { status: 'offboarded' },
          reason: job.reason,
        });
        PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDED, {
          tenantId: job.tenantId,
          reason: job.reason,
        });
      } catch (err) {
        await OffboardingJobService.markFailed(job.id);
        logger.error('Error processing offboarding job', { id: job.id, error: (err as Error).message });
      }
    }
  }

  private static async performOffboarding(tenantId: string, reason: string, initiatedById: string) {
    await TenantService.withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const activeSubscriptions = await (tenantPrisma as any).subscription.findMany({
        where: { tenantId, status: { in: ['active', 'trialing', 'past_due'] } },
      });
      for (const sub of activeSubscriptions) {
        await (tenantPrisma as any).subscription.update({ where: { id: sub.id }, data: { status: 'cancelled' } });
      }
    });

    await (await import('../utils/prisma')).prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended' },
    });

    await (await import('../utils/prisma')).prisma.subscriber.updateMany({
      where: { tenantId },
      data: { billingStatus: 'cancelled', notes: `Offboarded: ${reason}` },
    });

    await AuditService.log({
      platformUserId: initiatedById,
      tenantId,
      action: 'tenant.offboarding_executed',
      resource: 'tenant',
      resourceId: tenantId,
      changes: { suspendedAt: new Date(), reason },
    });
  }

  static async cleanupCompleted() {
    await OffboardingJobService.cleanup();
  }
}
