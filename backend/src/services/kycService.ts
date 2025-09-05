import { prisma } from '../utils/prisma';
import { KycRecordData } from '../types/platform';
import { AuditService } from './auditService';
import { SubscriberService } from './subscriberService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class KycService {
  static async createKycRecord(data: KycRecordData) {
    const record = await prisma.kycRecord.create({
      data
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.KYC_SUBMITTED, {
      tenantId: data.tenantId,
      recordId: record.id,
      provider: data.provider,
    });

    return record;
  }

  static async findKycRecords(filters: {
    tenantId?: string;
    status?: 'pending' | 'verified' | 'rejected';
    provider?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.status) where.status = filters.status;
    if (filters.provider) where.provider = filters.provider;

    return prisma.kycRecord.findMany({
      where,
      include: {
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { submittedAt: 'desc' }
    });
  }

  static async findKycRecordById(id: string) {
    return prisma.kycRecord.findUnique({
      where: { id },
      include: {
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static async reviewKycRecord(
    recordId: string,
    reviewData: {
      status: 'verified' | 'rejected';
      notes?: string;
    },
    reviewedById: string
  ) {
    // Explicit existence check → deterministic 404 instead of Prisma P2025 bubbling to 500
    const exists = await prisma.kycRecord.findUnique({
      where: { id: recordId },
      select: { id: true, tenantId: true },
    });
    if (!exists) {
      const err: any = new Error('KYC_RECORD_NOT_FOUND');
      err.status = 404;
      throw err;
    }
    const kycRecord = await prisma.kycRecord.update({
      where: { id: recordId },
      data: {
        status: reviewData.status,
        notes: reviewData.notes,
        reviewedById,
        reviewedAt: new Date()
      }
    });

    // Update subscriber KYC status
    await SubscriberService.updateSubscriber(
      kycRecord.tenantId,
      { kycStatus: reviewData.status },
      reviewedById
    );

    await AuditService.log({
      platformUserId: reviewedById,
      tenantId: kycRecord.tenantId,
      action: `kyc.${reviewData.status}`,
      resource: 'kyc_record',
      resourceId: recordId,
      changes: reviewData
    });

    await AuditService.log({
      platformUserId: reviewedById,
      tenantId: kycRecord.tenantId,
      action: 'kyc.review',
      resource: 'kyc_record',
      resourceId: recordId,
      changes: reviewData
    });

    PlatformEventBus.publish(
      reviewData.status === 'verified'
        ? PLATFORM_EVENTS.KYC_APPROVED
        : PLATFORM_EVENTS.KYC_REJECTED,
      {
        tenantId: kycRecord.tenantId,
        recordId,
        reviewedById,
      }
    );

    return kycRecord;
  }

  static async findKycRecordByTenantId(tenantId: string) {
    return prisma.kycRecord.findFirst({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' }
    });
  }

  static async getOverviewStats() {
    const [submitted, approved, rejected] = await Promise.all([
      prisma.kycRecord.count(),
      prisma.kycRecord.count({ where: { status: 'verified' } }),
      prisma.kycRecord.count({ where: { status: 'rejected' } })
    ]);
    return { submitted, approved, rejected };
  }

  static async getLatestForTenant(tenantId: string) {
    return prisma.kycRecord.findFirst({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' }
    });
  }

  static async isKycVerified(tenantId: string): Promise<boolean> {
    const subscriber = await prisma.subscriber.findUnique({
      where: { tenantId },
      select: { kycStatus: true }
    });

    return subscriber?.kycStatus === 'verified';
  }

  static async requireVerified(tenantId: string): Promise<void> {
    const ok = await this.isKycVerified(tenantId);
    if (!ok) {
      const err = new Error('KYC_REQUIRED');
      (err as any).status = 403;
      throw err;
    }
  }
}