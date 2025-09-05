import { prisma } from '../utils/prisma';
import { signImpersonationToken } from '../utils/platformJwt';
import { AuditService } from './auditService';
import crypto from 'crypto';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export const REVOKE = {
  REVOKED: 'revoked',
  NOT_FOUND: 'not_found',
  ALREADY_REVOKED: 'already_revoked',
  ERROR: 'error',
} as const;

export type RevokeResult = typeof REVOKE[keyof typeof REVOKE];

export class ImpersonationService {
  static async createGrant(data: {
    platformUserId: string;
    tenantId: string;
    reason: string;
    scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
    durationMinutes: number;
  }) {
    const durationMs = data.durationMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs);
    const jti = crypto.randomUUID();

    const grant = await prisma.impersonationGrant.create({
      data: {
        issuedById: data.platformUserId,
        tenantId: data.tenantId,
        reason: data.reason,
        scope: data.scope,
        jti,
        expiresAt
      }
    });

    const token = signImpersonationToken({
      sub: data.platformUserId,
      tenantId: data.tenantId,
      scope: data.scope,
      reason: data.reason,
      grantId: grant.id,
    }, 'tenant-api', jti);

    PlatformEventBus.publish(PLATFORM_EVENTS.IMPERSONATION_ISSUED, {
      tenantId: data.tenantId,
      grantId: grant.id,
      scope: data.scope,
    });

    return { grant, token };
  }

  static async revokeGrant(
    grantId: string,
    revokedById: string,
    reason: string
  ): Promise<RevokeResult> {
    try {
      const grant = await prisma.impersonationGrant.findUnique({
        where: { id: grantId }
      });

      if (!grant) return REVOKE.NOT_FOUND;
      if (grant.revokedAt) return REVOKE.ALREADY_REVOKED;

      await prisma.impersonationGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date() }
      });

      await AuditService.log({
        platformUserId: revokedById,
        tenantId: grant.tenantId,
        action: 'impersonation.revoked',
        resource: 'impersonation_grant',
        resourceId: grantId,
        reason
      });

      PlatformEventBus.publish(PLATFORM_EVENTS.IMPERSONATION_REVOKED, {
        tenantId: grant.tenantId,
        grantId: grantId,
      });

      return REVOKE.REVOKED;
    } catch (error) {
      return REVOKE.ERROR;
    }
  }

  static async findActiveGrants(filters: {
    platformUserId?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {
      revokedAt: null,
      expiresAt: { gt: new Date() }
    };

    if (filters.platformUserId) where.issuedById = filters.platformUserId;
    if (filters.tenantId) where.tenantId = filters.tenantId;

    return prisma.impersonationGrant.findMany({
      where,
      include: {
        issuedBy: {
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

  static async getImpersonationHistory(tenantId: string) {
    return prisma.impersonationGrant.findMany({
      where: { tenantId },
      include: {
        issuedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async findGrantById(id: string) {
    return prisma.impersonationGrant.findUnique({
      where: { id },
      include: {
        issuedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  static async validateGrant(jti: string): Promise<boolean> {
    const grant = await prisma.impersonationGrant.findUnique({
      where: { jti }
    });

    if (!grant || grant.revokedAt || grant.expiresAt < new Date()) {
      return false;
    }

    return true;
  }
}