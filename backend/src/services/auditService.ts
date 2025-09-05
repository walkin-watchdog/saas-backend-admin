import { prisma } from '../utils/prisma';
import { AuditLogEntry } from '../types/platform';
import { logger, requestContext } from '../utils/logger';

export class AuditService {
  private static redact(data: any): any {
    if (data === null || data === undefined) return data;
    // Preserve special objects
    if (data instanceof Date) return data;
    if (Buffer.isBuffer && Buffer.isBuffer(data)) return data;
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map((item) => this.redact(item));

    const redacted: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (/token|secret|ipallowlist|password|authorization|cookie|mfa|ssoSubject|rolecodes|email/i.test(key)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = this.redact(value);
      }
    }
    return redacted;
  }

  static async log(entry: AuditLogEntry): Promise<void> {
    const ctx = requestContext.getStore();
    const sanitized = this.redact({ ...entry, requestId: entry.requestId || ctx?.requestId });
    try {
      await prisma.auditLog.create({
        data: {
          platformUserId: sanitized.platformUserId,
          tenantId: sanitized.tenantId,
          action: sanitized.action,
          resource: sanitized.resource,
          resourceId: sanitized.resourceId,
          changes: sanitized.changes,
          ipAddress: sanitized.ipAddress,
          userAgent: sanitized.userAgent,
          reason: sanitized.reason,
          requestId: sanitized.requestId,
        },
      });
      logger.info('audit.log', sanitized);
    } catch (error) {
      logger.error('Failed to log audit entry', { error: (error as Error).message, entry: sanitized });
    }
  }

  static async findLogs(filters: {
    platformUserId?: string;
    tenantId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.platformUserId) where.platformUserId = filters.platformUserId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.resource) where.resource = filters.resource;
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate instanceof Date && !isNaN(filters.startDate.getTime())) where.createdAt.gte = filters.startDate;
      if (filters.endDate   instanceof Date && !isNaN(filters.endDate.getTime()))   where.createdAt.lte = filters.endDate;
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    const results = await prisma.auditLog.findMany({
      where,
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { createdAt: 'desc' }
    });
    return results.map((row: any) => this.redact(row));
  }

  static async countLogs(filters: {
    platformUserId?: string;
    tenantId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const where: any = {};

    if (filters.platformUserId) where.platformUserId = filters.platformUserId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.resource) where.resource = filters.resource;
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate instanceof Date && !isNaN(filters.startDate.getTime())) where.createdAt.gte = filters.startDate;
      if (filters.endDate   instanceof Date && !isNaN(filters.endDate.getTime()))   where.createdAt.lte = filters.endDate;
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    return prisma.auditLog.count({ where });
  }

  static async findById(id: string) {
    const row = await prisma.auditLog.findUnique({ where: { id } });
    return row ? this.redact(row) : null;
  }
}