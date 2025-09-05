import { prisma } from '../utils/prisma';
import { RequestFormData } from '../types/platform';
import { AuditService } from './auditService';
import { TenantService } from './tenantService';
import { SubscriptionService } from './subscriptionService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class RequestService {
  static async findRequests(filters: {
    status?: 'new' | 'in_review' | 'converted' | 'rejected';
    kind?: 'contact' | 'trial' | 'enterprise';
    assignedToId?: string;
    email?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.kind) where.kind = filters.kind;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };

    return prisma.requestFormSubmission.findMany({
      where,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async findRequestById(id: string) {
    return prisma.requestFormSubmission.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static async assignRequest(
    requestId: string, 
    assignedToId: string, 
    platformUserId: string
  ) {
    // Ensure the assignee exists; otherwise produce a deterministic 404 instead of 500.
    const assignee = await prisma.platformUser.findUnique({ where: { id: assignedToId } });
    if (!assignee) {
      // Let the global error handler translate "not found" to HTTP 404.
      throw new Error('Assignee not found');
    }
    const request = await prisma.requestFormSubmission.update({
      where: { id: requestId },
      data: {
        assignedToId,
        status: 'in_review',
        assignedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await AuditService.log({
      platformUserId,
      action: 'request.assigned',
      resource: 'request',
      resourceId: requestId,
      changes: { assignedToId }
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.REQUEST_ASSIGNED, {
      requestId,
      assignedToId,
      platformUserId,
    });

    return request;
  }

  static async convertRequest(
    requestId: string,
    conversionData: {
      companyName: string;
      planId: string;
      ownerPassword: string;
    },
    platformUserId: string
  ) {
    const request = await this.findRequestById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status === 'converted') {
      throw new Error('Request already converted');
    }

    // Create tenant using platform credentials
    const tenant = await TenantService.createTenant({
      name: conversionData.companyName,
      status: 'active'
    });

    // Create owner user in tenant context
    await TenantService.withTenantContext(tenant, async (tenantPrisma) => {
      const hashedPassword = await import('bcrypt').then(bcrypt => 
        bcrypt.hash(conversionData.ownerPassword, 12)
      );

      await (tenantPrisma as typeof prisma).user.create({
        data: {
          tenantId: tenant.id,
          email: request.email,
          password: hashedPassword,
          name: request.company || request.email,
          role: 'ADMIN',
          emailVerified: true
        }
      });
    });

    // Create subscription
    await SubscriptionService.createSubscription(tenant.id, conversionData.planId, {
      trial: true,
      currency: 'USD',
    });

    // Update request
    const updatedRequest = await prisma.requestFormSubmission.update({
      where: { id: requestId },
      data: {
        status: 'converted',
        convertedTenantId: tenant.id,
        convertedAt: new Date()
      }
    });

    await AuditService.log({
      platformUserId,
      action: 'request.converted',
      resource: 'request',
      resourceId: requestId,
      changes: {
        tenantId: tenant.id,
        companyName: conversionData.companyName,
        planId: conversionData.planId
      }
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.REQUEST_CONVERTED, {
      requestId,
      tenantId: tenant.id,
    });

    return { request: updatedRequest, tenant };
  }

  static async rejectRequest(requestId: string, reason: string, platformUserId: string) {
    // Disallow rejecting an already converted request (should be a 409).
    const existing = await prisma.requestFormSubmission.findUnique({ where: { id: requestId } });
    if (!existing) {
      throw new Error('Request not found');
    }
    if (existing.status === 'converted') {
      // Keep message consistent with convert path so the error mapper returns 409.
      throw new Error('Request already converted');
    }

    const request = await prisma.requestFormSubmission.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await AuditService.log({
      platformUserId,
      action: 'request.rejected',
      resource: 'request',
      resourceId: requestId,
      reason
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.REQUEST_REJECTED, {
      requestId,
      platformUserId,
      reason,
    });

    return request;
  }

  static async updateRequestStatus(
    requestId: string,
    status: 'new' | 'in_review' | 'converted' | 'rejected',
    platformUserId: string
  ) {
    const request = await prisma.requestFormSubmission.update({
      where: { id: requestId },
      data: { status, updatedAt: new Date() }
    });

    await AuditService.log({
      platformUserId,
      action: 'request.status_updated',
      resource: 'request',
      resourceId: requestId,
      changes: { status }
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.REQUEST_STATUS_UPDATED, {
      requestId,
      status,
      platformUserId,
    });

    return request;
  }
}