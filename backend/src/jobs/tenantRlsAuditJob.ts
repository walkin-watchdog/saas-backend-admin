import { forEachTenant } from '../services/tenantRunner';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { AuditService } from '../services/auditService';

export class TenantRlsAuditJob {
  static async run() {
    await forEachTenant(
      {
        jobName: 'tenant-rls-audit',
        selector: { status: 'active' },
        concurrency: 3,
        stopOnError: false,
      },
      async (tenant, tx) => {
        const client = tx as PrismaClient;
        // discover scoped tables (current schema)
        const scoped = await client.$queryRaw<{ table_name: string }[]>`
          SELECT ic.table_name
          FROM information_schema.columns ic
          JOIN information_schema.tables it
            ON it.table_schema = ic.table_schema AND it.table_name = ic.table_name
          WHERE ic.table_schema = current_schema()
            AND ic.column_name = 'tenantId'
            AND it.table_type = 'BASE TABLE'
          ORDER BY 1
        `;
        const tables = scoped.map(r => r.table_name);
        // ensure at least one policy in db
        const pol = await client.$queryRaw<{ count:number }[]>`
          SELECT count(*)::int
          FROM pg_policies
          WHERE schemaname = current_schema()
            AND policyname ILIKE 'tenant_isolation_%'
        `;
        const missingRls: string[] = [];
        const missingPolicy: string[] = [];

        for (const tname of tables) {
          const rlsRow = await client.$queryRaw<{ enabled: boolean }[]>`
            SELECT c.relrowsecurity AS enabled
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND c.relname = ${tname}
          `;
          if (!rlsRow?.[0]?.enabled) missingRls.push(tname);

          const polRow = await client.$queryRaw<{ cnt: number }[]>`
            SELECT COUNT(*)::int AS cnt
            FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename  = ${tname}
              AND policyname ILIKE 'tenant_isolation_%'
          `;
          if (!polRow?.[0]?.cnt) missingPolicy.push(tname);
        }

        if (!pol?.[0]?.count || missingRls.length || missingPolicy.length) {
          logger.error('rls_audit_failed', { tenantId: tenant.id, missingRls, missingPolicy });
          await AuditService.log({
            tenantId: tenant.id,
            action: 'rls.audit_failed',
            resource: 'database',
            resourceId: tenant.id,
            changes: { missingRls, missingPolicy },
            reason: 'audit',
          });
        }
      }
    );
  }
}