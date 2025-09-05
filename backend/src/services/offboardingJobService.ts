import { prisma } from '../utils/prisma';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class OffboardingJobService {
  static async schedule(data: {
    tenantId: string;
    reason: string;
    scheduledAt: Date;
    retentionDays: number;
    initiatedById: string;
  }) {
    const job = await prisma.offboardingJob.create({
      data,
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDING_SCHEDULED, {
      tenantId: job.tenantId,
      reason: job.reason,
      initiatedById: job.initiatedById,
      scheduledAt: job.scheduledAt,
      retentionDays: job.retentionDays,
    });
    return job;
  }

  static async cancel(tenantId: string) {
    const job = await prisma.offboardingJob.delete({ where: { tenantId } });
    PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDING_CANCELLED, {
      tenantId: job.tenantId,
      reason: job.reason,
      initiatedById: job.initiatedById,
    });
    return job;
  }

  static async getJob(tenantId: string) {
    return prisma.offboardingJob.findUnique({ where: { tenantId } });
  }

  static async listDue(now: Date) {
    return prisma.offboardingJob.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: now },
      },
    });
  }

  static async markProcessing(id: string) {
    const now = new Date();
    const updated = await prisma.offboardingJob.updateMany({
      where: { id, processingAt: null, status: 'scheduled' },
      data: { processingAt: now, status: 'processing' },
    });
    if (updated.count === 1) {
      const job = await prisma.offboardingJob.findUnique({ where: { id } });
      if (job) {
        PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDING_PROCESSING, {
          tenantId: job.tenantId,
          reason: job.reason,
          initiatedById: job.initiatedById,
        });
      }
      return true;
    }
    return false;
  }

  static async markCompleted(id: string) {
    const completed = await prisma.offboardingJob.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDED, {
      tenantId: completed.tenantId,
      reason: completed.reason,
      initiatedById: completed.initiatedById,
    });
    return completed;
  }

  static async markFailed(id: string) {
    const updated = await prisma.offboardingJob.updateMany({
      where: { id, status: 'processing' },
      data: { status: 'scheduled', processingAt: null },
    });
    if (updated.count === 1) {
      const job = await prisma.offboardingJob.findUnique({ where: { id } });
      if (job) {
        PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_OFFBOARDING_FAILED, {
          tenantId: job.tenantId,
          reason: job.reason,
          initiatedById: job.initiatedById,
        });
      }
      return true;
    }
    return false;
  }

  static async cleanup(now: Date = new Date()) {
    const jobs = await prisma.offboardingJob.findMany({
      where: { status: 'completed', completedAt: { not: null } },
    });
    const toDelete = jobs
      .filter(j => j.completedAt && now.getTime() - j.completedAt.getTime() > j.retentionDays * 86400000)
      .map(j => j.id);
    if (toDelete.length === 0) return { count: 0 } as any;
    return prisma.offboardingJob.deleteMany({ where: { id: { in: toDelete } } });
  }
}
