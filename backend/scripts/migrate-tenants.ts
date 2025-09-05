#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { AuditService } from '../src/services/auditService';
import { sanitize } from '../src/utils/sanitize';

type Flags = {
  dryRun: boolean;
  stopOnFailure: boolean;
  where?: string;
  tenants?: string[];
  report?: string;
  waveSize?: number;
  promote?: boolean;
};

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const f: Flags = { dryRun: false, stopOnFailure: true };
  for (const a of args) {
    if (a === '--dry-run') f.dryRun = true;
    else if (a === '--no-stop-on-failure') f.stopOnFailure = false;
    else if (a.startsWith('--where=')) f.where = a.split('=')[1];
    else if (a.startsWith('--tenants=')) f.tenants = a.split('=')[1].split(',');
    else if (a.startsWith('--report=')) f.report = a.split('=')[1];
    else if (a.startsWith('--wave-size=')) f.waveSize = Number(a.split('=')[1] || 0) || undefined;
    else if (a === '--promote') f.promote = true;
  }
  return f;
}

function hash(s: string) { return crypto.createHash('sha1').update(s).digest('hex').slice(0,12); }

function withConnParams(url: string): string {
  // Ensure DSN carries a short connect timeout and server-side statement timeout
  // add/merge: connect_timeout=5 & options=-c statement_timeout=60000
  const [base, q = ''] = url.split('?');
  const search = new URLSearchParams(q);
  if (!search.has('connect_timeout')) search.set('connect_timeout', '5');
  // PG "options" requires a single space-separated string; let URLSearchParams encode it once.
  const want = '-c statement_timeout=60000';
  const existing = search.get('options');
  if (!existing) {
    search.set('options', want);
  } else if (!existing.includes('statement_timeout')) {
    search.set('options', `${existing} ${want}`);
  }
  return `${base}?${search.toString()}`;
}

type ParsedWhere = { status?: 'active'|'pending'|'suspended', dedicated?: boolean };
function parseWhereClause(input?: string): ParsedWhere {
  if (!input) return { status: 'active' };
  const re = /^\s*status\s*=\s*'(active|pending|suspended)'\s*(?:AND\s*dedicated\s*=\s*(true|false))?\s*$/i;
  const m = re.exec(input);
  if (!m) {
    throw new Error("Invalid --where. Allowed: status='active|pending|suspended' [AND dedicated=true|false]");
  }
  const status = m[1].toLowerCase() as ParsedWhere['status'];
  const dedicated = m[2] ? m[2].toLowerCase() === 'true' : undefined;
  return { status, dedicated };
}

async function main() {
  const flags = parseFlags();
  const shared = new PrismaClient();
  const ids = flags.tenants;
  const filter = parseWhereClause(flags.where);

  // Use Prisma API (no raw SQL) with a constrained filter
  const tenants = await shared.tenant.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(typeof filter.dedicated === 'boolean' ? { dedicated: filter.dedicated } : {}),
      ...(ids ? { id: { in: ids } } : {}),
    },
    select: { id: true, dedicated: true, datasourceUrl: true },
  });

  type Row = { dsnHash:string; tenantsCovered:string[]; status:'ok'|'failed'|'skipped'; durationMs:number; error?:string };
  const rows: Row[] = [];

  // Build DSN set: shared once + each dedicated url
  const dsnToTenants = new Map<string, string[]>();
  const sharedDsn = process.env.DATABASE_URL;
  if (!sharedDsn) {
    throw new Error(
      'DATABASE_URL is required: set it to the shared cluster DSN before running scripts/migrate-tenants.ts'
    );
  }
  const sharedCover = tenants
    .filter(t => !t.dedicated)
    .map(t => t.id);
  
  dsnToTenants.set(sharedDsn, sharedCover);
  for (const t of tenants) {
    if (t.dedicated && t.datasourceUrl) {
      const list = dsnToTenants.get(t.datasourceUrl) ?? [];
      list.push(t.id);
      dsnToTenants.set(t.datasourceUrl, list);
    }
  }

  const all = Array.from(dsnToTenants.entries());
  const waveSize = flags.waveSize ?? all.length; // default = single wave
  let hadFailure = false;
  for (let wave = 0; wave < all.length; wave += waveSize) {
    const slice = all.slice(wave, wave + waveSize);
    for (const [dsnRaw, covered] of slice) {
      const dsn = withConnParams(dsnRaw);
      const start = Date.now();
      let status: Row['status'] = 'ok'; let err: string|undefined;
      try {
        if (!flags.dryRun) {
          const maxAttempts = 3;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const r = spawnSync('npx', ['prisma','migrate','deploy'], {
              stdio: 'inherit',
              env: {
                ...process.env,
                DATABASE_URL: dsn,
                PGCONNECT_TIMEOUT: '5',
              },
            });
            if (r.status === 0) break;
            if (attempt === maxAttempts) throw new Error(`migrate deploy exited ${r.status}`);
            await new Promise(r => setTimeout(r, Math.min(2000 * 2**(attempt-1), 8000)));
          }
        }
      // RLS verification (discover tenant-scoped tables dynamically)
      const client = new PrismaClient({ datasources: { db: { url: dsn } } });
      try {
        // 0) Some tenant policies should exist at all
        const pol = await client.$queryRaw<{ count:number }[]>`
          SELECT count(*)::int
          FROM pg_policies
          WHERE schemaname = current_schema()
            AND policyname ILIKE 'tenant_isolation_%'
        `;
        // 1) Find all tables with a tenantId column in current schema, excluding known globals
        const scoped = await client.$queryRaw<{ table_name: string }[]>`
          SELECT ic.table_name
          FROM information_schema.columns ic
          JOIN information_schema.tables it
            ON it.table_schema = ic.table_schema AND it.table_name = ic.table_name
          WHERE ic.table_schema = current_schema()
            AND ic.column_name = 'tenantId'
            AND it.table_type = 'BASE TABLE'
            AND ic.table_name NOT IN ('Tenant','TenantDomain','GlobalConfig')
          ORDER BY 1
        `;
        const scopedTables = scoped.map(r => r.table_name);

        // 2) For each scoped table, assert: RLS enabled + tenant policy exists
        const missingRls: string[] = [];
        const missingPolicy: string[] = [];
        for (const tname of scopedTables) {
          const rlsRow = await client.$queryRaw<{ enabled: boolean }[]>`
            SELECT c.relrowsecurity AS enabled
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND c.relname = ${tname}
          `;
          if (!rlsRow?.[0]?.enabled) {
            missingRls.push(tname);
          }
          const polRow = await client.$queryRaw<{ cnt: number }[]>`
            SELECT COUNT(*)::int AS cnt
            FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename  = ${tname}
              AND policyname ILIKE 'tenant_isolation_%'
          `;
          if (!polRow?.[0]?.cnt) {
            missingPolicy.push(tname);
          }
        }
        if (!pol?.[0]?.count) throw new Error('RLS policies missing (no tenant_isolation_* policies found)');
        if (missingRls.length || missingPolicy.length) {
          const errMsg = [
            missingRls.length ? `RLS disabled: [${missingRls.join(', ')}]` : '',
            missingPolicy.length ? `Policy missing: [${missingPolicy.join(', ')}]` : '',
          ].filter(Boolean).join(' | ');
          throw new Error(`RLS verification failed → ${errMsg}`);
        }
      } finally {
        await client.$disconnect().catch(() => {});
      }
      } catch (e:any) {
        status = 'failed'; err = sanitize(e?.message || String(e));
        hadFailure = true;
        if (flags.stopOnFailure) {
            rows.push({ dsnHash: hash(dsn), tenantsCovered: covered, status, durationMs: Date.now()-start, error: err });
          // audit before exiting wave
          await AuditService.log({
            action: 'migration.run',
            resource: 'database',
            resourceId: hash(dsn),
            reason: 'failed',
            changes: { tenantsCovered: covered, wave: Math.floor(wave / waveSize) + 1, error: err },
          });
          await shared.$disconnect();
          if (flags.report) {
            const json = flags.report.endsWith('.json') ? flags.report : `${flags.report}.json`;
            const csv  = flags.report.endsWith('.csv')  ? flags.report : `${flags.report}.csv`;
            await import('node:fs/promises').then(fs=>fs.writeFile(json, JSON.stringify(rows,null,2)));
            const toCsv = (r:Row)=>[r.dsnHash, `"${r.tenantsCovered.join('|')}"`, r.status, r.durationMs, r.error?`"${(r.error).replaceAll('"','""')}"`:''].join(',');
            await import('node:fs/promises').then(fs=>fs.writeFile(csv, ['dsnHash,tenantsCovered,status,durationMs,error', ...rows.map(toCsv)].join('\n')));
          }
          process.exit(1);
        }
      }
      rows.push({ dsnHash: hash(dsn), tenantsCovered: covered, status, durationMs: Date.now()-start, error: err });
      await AuditService.log({
        action: 'migration.run',
        resource: 'database',
        resourceId: hash(dsn),
        reason: status === 'ok' ? 'success' : 'failed',
        changes: { tenantsCovered: covered, wave: Math.floor(wave / waveSize) + 1, durationMs: Date.now()-start, error: err },
      });
    }
    if (flags.promote && !hadFailure) {
      // promotion marker (no-op; CI can gate on this log)
      console.log(`Wave ${Math.floor(wave / waveSize) + 1} complete → promoting to next wave`);
    }
    if (hadFailure) break;
  }
  await shared.$disconnect();

  if (flags.report) {
    const json = flags.report.endsWith('.json') ? flags.report : `${flags.report}.json`;
    const csv  = flags.report.endsWith('.csv')  ? flags.report : `${flags.report}.csv`;
    await import('node:fs/promises').then(fs=>fs.writeFile(json, JSON.stringify(rows,null,2)));
    const toCsv = (r:Row)=>[r.dsnHash, `"${r.tenantsCovered.join('|')}"`, r.status, r.durationMs, r.error?`"${r.error.replaceAll('"','""')}"`:''].join(',');
    await import('node:fs/promises').then(fs=>fs.writeFile(csv, ['dsnHash,tenantsCovered,status,durationMs,error', ...rows.map(toCsv)].join('\n')));
  }
  if (hadFailure && flags.stopOnFailure) {
    console.error('Migration halted due to failure.');
    process.exit(1);
  }
}

main().catch((e)=>{ console.error(sanitize(e)); process.exit(1); });