import { withTenantContext } from '../middleware/tenantMiddleware';
import { PrismaClient } from '@prisma/client';
import { eventBus, BILLING_EVENTS } from '../utils/eventBus';

interface UsageData {
  meter: string;
  quantity: number;
  unit: string;
  occurredAt?: Date;
  resourceId?: string;
  metadata?: any;
}

/**
 * Record a usage event for a tenant and emit usage.recorded
 */
export async function recordUsage(tenantId: string, data: UsageData) {
  return withTenantContext({ id: tenantId } as any, async (prisma) => {
    const record = await (prisma as PrismaClient).usageRecord.create({
      data: {
        tenantId,
        meter: data.meter,
        quantity: data.quantity,
        unit: data.unit,
        occurredAt: data.occurredAt,
        resourceId: data.resourceId,
        metadata: data.metadata,
      },
    });
    eventBus.publish(BILLING_EVENTS.USAGE_RECORDED, { tenantId, usageRecordId: record.id });
    return record;
  });
}
