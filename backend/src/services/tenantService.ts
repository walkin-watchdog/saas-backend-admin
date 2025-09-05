import { Request } from 'express';
import { prisma } from '../utils/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { eventBus, TENANT_EVENTS } from '../utils/eventBus';
import { opMetrics } from '../utils/opMetrics';
import { retryInteractiveTx } from '../utils/txRetry';

export interface TenantContext {
  id: string;
  name: string;
  status: string;
  dedicated: boolean;
  datasourceUrl?: string | null;
  dbName?: string | null;
}

export class TenantService {
  /**
   * Resolve tenant from request (Origin header or x-api-key)
   */
  static async fromOriginOrApiKey(req: Request): Promise<TenantContext> {
    // Try API key first
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const tenant = await prisma.tenant.findUnique({
        where: { apiKey },
        select: {
          id: true,
          name: true,
          status: true,
          dedicated: true,
          datasourceUrl: true,
          dbName: true,
        }
      });

      if (!tenant) {
        const err = new Error('Invalid API key'); (err as any).status = 401;
        throw err;
      }

      if (tenant.status !== 'active') {
        const err = new Error('Tenant account is suspended'); (err as any).status = 401;
        throw err;
      }

      return tenant;
    }

    // Try origin-based resolution
    const raw = (req.headers.origin || req.headers.host || '').toString().trim();
    if (!raw) {
      const err = new Error('No tenant identifier provided'); (err as any).status = 400;
      throw err;
    }

    let normalized: string;
    try {
      // If header already contains protocol, URL() will parse; otherwise, prefix http://
      const u = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
      normalized = (u.port ? `${u.hostname}:${u.port}` : u.hostname).toLowerCase();
    } catch {
      // Fallback: strip protocol/path manually
      normalized = raw
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase();
    }

    const domain = await prisma.tenantDomain.findUnique({
      where: { domain: normalized },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
            dedicated: true,
            datasourceUrl: true,
            dbName: true,
          }
        }
      }
    });

    if (!domain || !domain.isActive) {
      // Fallback to default tenant for localhost/development
      if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
        const defaultTenant = await this.getOrCreateDefaultTenant();
        return defaultTenant;
      }
      const err = new Error('Unrecognized domain'); (err as any).status = 400;
      throw err;
    }

    if (domain.tenant.status !== 'active') {
      const err = new Error('Tenant account is suspended'); (err as any).status = 401;
      throw err;
    }

    return domain.tenant;
  }

  /**
   * Get or create default tenant for development
   */
  static async getOrCreateDefaultTenant(): Promise<TenantContext> {
    let tenant = await prisma.tenant.findFirst({
      where: { name: 'Default' },
      select: {
        id: true,
        name: true,
        status: true,
        dedicated: true,
        datasourceUrl: true,
        dbName: true,
      }
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Default',
          status: 'active',
          dedicated: false
        },
        select: {
          id: true,
          name: true,
          status: true,
          dedicated: true,
          datasourceUrl: true,
          dbName: true,
        }
      });

      // Create domain mapping for localhost
      await prisma.tenantDomain.createMany({
        data: [
          { tenantId: tenant.id, domain: 'localhost:5174' },
          { tenantId: tenant.id, domain: 'localhost:8080' },
          { tenantId: tenant.id, domain: 'localhost:3001' },
          { tenantId: tenant.id, domain: '127.0.0.1:5174' },
          { tenantId: tenant.id, domain: '127.0.0.1:8080' },
          { tenantId: tenant.id, domain: '127.0.0.1:3001' }
        ]
      });

      logger.info('Created default tenant for development', { tenantId: tenant.id });
    }

    return tenant;
  }

  /**
   * Create a new tenant
   */
  static async createTenant(data: {
    name: string;
    status?: string;
    dedicated?: boolean;
    datasourceUrl?: string;
    dbName?: string;
    domains?: string[];
  }): Promise<TenantContext> {
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        status: data.status || 'active',
        dedicated: data.dedicated || false,
        datasourceUrl: data.datasourceUrl,
        dbName: data.dbName,
      },
      select: {
        id: true,
        name: true,
        status: true,
        dedicated: true,
        datasourceUrl: true,
        dbName: true,
      }
    });

    // Create domain mappings if provided
    if (data.domains && data.domains.length > 0) {
      await prisma.tenantDomain.createMany({
        data: data.domains.map(domain => ({
          tenantId: tenant.id,
          domain
        }))
      });
    }

    // Emit tenant.created event
    eventBus.publish('tenant.created', { tenant });
    logger.info('Tenant created', { tenantId: tenant.id, name: tenant.name });

    return tenant;
  }

  /**
   * Get tenant by ID
   */
  static async getTenantById(id: string): Promise<TenantContext | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        dedicated: true,
        datasourceUrl: true,
        dbName: true,
      }
    });

    return tenant;
  }

  /**
   * Update tenant
   */
  static async updateTenant(id: string, data: Partial<{
    name: string;
    status: string;
    dedicated: boolean;
    datasourceUrl: string;
    dbName: string;
  }>): Promise<TenantContext> {
    // fetch previous connectivity fields to detect changes
    const before = await prisma.tenant.findUnique({
      where: { id },
      select: { dedicated: true, datasourceUrl: true, dbName: true }
    });
    const tenant = await prisma.tenant.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        status: true,
        dedicated: true,
        datasourceUrl: true,
        dbName: true,
      }
    });

    // if any connectivity field changed, publish event so cache can evict
    const changed =
      before?.dedicated !== tenant.dedicated ||
      before?.datasourceUrl !== tenant.datasourceUrl ||
      before?.dbName !== tenant.dbName;

    if (changed) {
      eventBus.publish(TENANT_EVENTS.DATASOURCE_CHANGED, {
        tenantId: id,
        before,
        after: {
          dedicated: tenant.dedicated,
          datasourceUrl: tenant.datasourceUrl,
          dbName: tenant.dbName,
        },
        changedAt: new Date().toISOString(),
        reason: 'admin_update'
      });
      logger.info('tenant.datasource_changed', { tenantId: id });
    }

    return tenant;
  }

  /**
    * Execute function with specific tenant context (for background jobs)
    * Note: The callback fn should be idempotent as it may be retried on transaction timeouts.
    */
  static async withTenantContext<T>(
    tenant: TenantContext,
    fn: (prisma: PrismaClient | Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    const { prisma: sharedPrisma, getDedicatedPrisma } = await import('../utils/prisma');
    const tenantPrisma: PrismaClient =
      tenant.dedicated && tenant.datasourceUrl
        ? getDedicatedPrisma(tenant.datasourceUrl)
        : sharedPrisma;

    if (tenant.dedicated && tenant.datasourceUrl) {
      const { getPreflightBreaker } = await import('../utils/preflight');
      const breaker = getPreflightBreaker(tenant.datasourceUrl);
      const t0 = Date.now();
      await breaker.fire(tenantPrisma);
      opMetrics.observePreflight(Date.now() - t0);
    }
    
    try {
      return await retryInteractiveTx(() =>
        tenantPrisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.$executeRaw`SELECT set_config('app.tenantId', ${tenant.id}, true)`;
          const { tenantContext } = await import('../middleware/tenantMiddleware');
          return await tenantContext.run(
            { tenant, prisma: tx as unknown as PrismaClient },
            () => fn(tx)
          );
        })
      );
    } finally {
    }
  }
}