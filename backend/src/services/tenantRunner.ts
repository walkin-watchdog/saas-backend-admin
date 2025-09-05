import pLimit from 'p-limit';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { TenantContext } from './tenantService';
import { Prisma } from '@prisma/client';

export type ForEachTenantOpts = {
  jobName: string;
  selector?: { dedicated?: boolean; status?: 'active'|'pending'|'suspended' };
  concurrency?: number;
  stopOnError?: boolean;
  backoff?: { baseMs:number; factor:number; maxMs:number };
};

export async function forEachTenant(
  opts: ForEachTenantOpts,
  handler: (tenant: TenantContext, tx: Prisma.TransactionClient) => Promise<void>
) {
  const limit = pLimit(opts.concurrency ?? 5);
  const where: any = {};
  if (opts.selector?.status) where.status = opts.selector.status;
  if (typeof opts.selector?.dedicated === 'boolean') where.dedicated = opts.selector.dedicated;
  const tenants = await prisma.tenant.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      dedicated: true,
      datasourceUrl: true,
      dbName: true,
    }
  });

  const tasks = tenants.map(t => limit(async () => {
    const backoff = opts.backoff ?? { baseMs: 500, factor: 2, maxMs: 8000 };
    let attempt = 0;
    while (true) {
      try {
        const { TenantService } = await import('../services/tenantService');
        await TenantService.withTenantContext(t, async (tx) => handler(t as any, tx));
        break;
      } catch (e:any) {
        logger.error('tenant_job_failed', { job: opts.jobName, tenantId: t.id, error: e?.message });
        if (opts.stopOnError) throw e;
        const delay = Math.min(backoff.baseMs * Math.pow(backoff.factor, attempt), backoff.maxMs);
        attempt++;
        await new Promise(r => setTimeout(r, delay));
        if (attempt > 4) {
          logger.error('tenant_job_final_failure', {
            job: opts.jobName,
            tenantId: t.id,
            attempts: attempt,
            lastError: e?.message
          });
          break;
        }
      }
    }
  }));

  await Promise.all(tasks);
  logger.info('tenant_job_complete', { job: opts.jobName, total: tenants.length });
}