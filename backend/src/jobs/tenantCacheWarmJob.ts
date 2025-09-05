import { forEachTenant } from '../services/tenantRunner';
import { getDedicatedPrisma } from '../utils/prisma';

export class TenantCacheWarmJob {
  static async run() {
    await forEachTenant(
      {
        jobName: 'tenant-cache-warm',
        selector: { status: 'active', dedicated: true },
        concurrency: 5,
        stopOnError: false,
      },
      async (tenant) => {
        if (!tenant.datasourceUrl) return;
        const client = getDedicatedPrisma(tenant.datasourceUrl);
        // Do a tiny query to prime connection pool
        await client.$queryRaw`SELECT 1`;
      }
    );
  }
}