import { forEachTenant } from '../services/tenantRunner';
import { PrismaClient } from '@prisma/client';
import { getPreflightBreaker } from '../utils/preflight';
import { opMetrics } from '../utils/opMetrics';
import { getDedicatedPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { AuditService } from '../services/auditService';

export class TenantPreflightSweepJob {
  static async run() {
    await forEachTenant(
      {
        jobName: 'tenant-preflight',
        selector: { status: 'active' },   // both shared & dedicated
        concurrency: 5,
        backoff: { baseMs: 250, factor: 2, maxMs: 5000 },
        stopOnError: false,
      },
      async (tenant, tx) => {
        if (!tenant.dedicated || !tenant.datasourceUrl) {
          // Shared cluster — quick ping inside tenant txn context
          await (tx as PrismaClient).$queryRaw`SELECT 1`;
          return;
        }
        try {
          const breaker = getPreflightBreaker(tenant.datasourceUrl);
          const t0 = Date.now();
          const client = getDedicatedPrisma(tenant.datasourceUrl);
          await breaker.fire(client);
          opMetrics.observePreflight(Date.now() - t0);
        } catch (e:any) {
          opMetrics.inc('dbUnavailable', 1, { tenantId: tenant.id });
          logger.warn('preflight_sweep_unavailable', { tenantId: tenant.id, error: e?.message });
          await AuditService.log({
            tenantId: tenant.id,
            action: 'dedicated_db.unavailable',
            resource: 'tenant',
            resourceId: tenant.id,
            reason: 'preflight_sweep',
          });
          // don’t throw; we want the sweep to continue
        }
      }
    );
  }
}