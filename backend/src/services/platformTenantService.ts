import { withPlatformRole } from '../utils/prisma';
import { AuditService } from './auditService';
import { OffboardingJobService } from './offboardingJobService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class ServiceError extends Error {
  status: number;
  meta?: Record<string, unknown>;
  constructor(status: number, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}

export type TenantListFilters = {
  status?: 'active' | 'suspended' | 'pending';
  billingStatus?: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  kycStatus?: 'pending' | 'verified' | 'rejected';
  search?: string;
  limit?: number;
  offset?: number;
};

export class PlatformTenantService {
  static async listTenants(filters: TenantListFilters = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { id: { contains: filters.search } },
      ];
    }
    if (filters.billingStatus || filters.kycStatus) {
      where.subscriber = {
        ...(filters.billingStatus ? { billingStatus: filters.billingStatus } : {}),
        ...(filters.kycStatus ? { kycStatus: filters.kycStatus } : {}),
      };
    }

    return withPlatformRole(async (db) => {
      const [list, count] = await Promise.all([
        db.tenant.findMany({
          where,
          include: {
            subscriber: true,
            subscriptions: {
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            _count: {
              select: { users: true, products: true, bookings: true },
            },
          },
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy: { createdAt: 'desc' },
        }),
        db.tenant.count({ where }),
      ]);
      return { tenants: list, total: count };
    });
  }

  static async getTenant(tenantId: string) {
    const tenant = await withPlatformRole(async (db) =>
      db.tenant.findUnique({
        where: { id: tenantId },
        include: {
          subscriber: true,
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          },
          invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
          paymentMethods: { orderBy: { createdAt: 'desc' } },
          usageRecords: { orderBy: { occurredAt: 'desc' }, take: 50 },
          _count: {
            select: { users: true, products: true, bookings: true, payments: true },
          },
        },
      })
    );
    return tenant;
  }

  static async statsOverview() {
    return withPlatformRole(async (db) => {
      const [totalTenants, activeTenants, suspendedTenants, pendingTenants, recentSignups] =
        await Promise.all([
          db.tenant.count(),
          db.tenant.count({ where: { status: 'active' } }),
          db.tenant.count({ where: { status: 'suspended' } }),
          db.tenant.count({ where: { status: 'pending' } }),
          db.tenant.count({
            where: {
              createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);
      return {
        total: totalTenants,
        active: activeTenants,
        suspended: suspendedTenants,
        pending: pendingTenants,
        recentSignups,
        healthScore: totalTenants > 0 ? (activeTenants / totalTenants) * 100 : 0,
      };
    });
  }

  static async scheduleOffboard(params: {
    tenantId: string;
    reason: string;
    scheduledAt?: Date;
    retentionDays: number;
    initiatedById: string;
  }) {
    const job = await OffboardingJobService.schedule({
      tenantId: params.tenantId,
      reason: params.reason,
      scheduledAt: params.scheduledAt || new Date(),
      retentionDays: params.retentionDays,
      initiatedById: params.initiatedById,
    });

    await withPlatformRole(async (db) =>
      db.tenant.update({
        where: { id: params.tenantId },
        data: { status: 'suspended' },
      })
    );

    await AuditService.log({
      platformUserId: params.initiatedById,
      tenantId: params.tenantId,
      action: 'tenant.offboard_scheduled',
      resource: 'tenant',
      resourceId: params.tenantId,
      changes: job,
      reason: params.reason,
    });

    return job;
  }

  static async restoreTenant(tenantId: string, reason: string, platformUserId: string) {
    const job = await OffboardingJobService.getJob(tenantId);
    if (!job) {
      throw new ServiceError(400, 'Tenant is not scheduled for offboarding');
    }

    // Check if offboarding is already completed (outside restore window)
    if (job.status === 'completed') {
      throw new ServiceError(409, 'Tenant restore not available - offboarding already completed');
    }

    await OffboardingJobService.cancel(tenantId);

    await withPlatformRole(async (db) =>
      db.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      })
    );

    await AuditService.log({
      platformUserId,
      tenantId,
      action: 'tenant.offboard_cancelled',
      resource: 'tenant',
      resourceId: tenantId,
      reason,
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_RESTORED, { tenantId });
  }

  static async hardDeleteTenant(tenantId: string, reason: string, platformUserId: string) {
    const job = await OffboardingJobService.getJob(tenantId);
    if (job) {
      // Prefer completedAt for retention; fallback to scheduledAt for legacy/in-flight jobs.
      const anchor = job.completedAt ?? job.scheduledAt;
      const canDeleteAt = new Date(anchor.getTime() + job.retentionDays * 86400000);
      if (new Date() < canDeleteAt) {
        throw new ServiceError(409, 'Tenant cannot be hard deleted yet - retention period not elapsed', {
          canDeleteAt: canDeleteAt.toISOString(),
        });
      }
    }

    const tenant = await withPlatformRole(async (db) =>
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, status: true },
      })
    );
    if (!tenant) {
      throw new ServiceError(404, 'Tenant not found');
    }

    await withPlatformRole(async (db) =>
      db.tenant.delete({
        where: { id: tenantId },
      })
    );

    await OffboardingJobService.cancel(tenantId).catch(() => undefined);

    await AuditService.log({
      platformUserId,
      action: 'tenant.hard_deleted',
      resource: 'tenant',
      resourceId: tenantId,
      changes: { name: tenant.name, status: tenant.status },
      reason,
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.TENANT_HARD_DELETED, { tenantId });
  }
}