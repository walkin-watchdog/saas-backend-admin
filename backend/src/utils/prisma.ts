import { PrismaClient, Prisma } from '@prisma/client';
import { tenantContext } from '../middleware/tenantMiddleware';
import { LRUCache } from 'lru-cache';
import { eventBus, TENANT_EVENTS } from './eventBus';
import { logger, requestContext } from './logger';
import { opMetrics } from './opMetrics';
import { dbQueryDuration, dbErrorCounter, hashTenantId } from './metrics';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

// Attach metrics/event listeners if available (tests may mock PrismaClient without $on)
function attachClientObservers(client: PrismaClient) {
  const anyClient = client as any;
  if (typeof anyClient.$on !== 'function') return; // mocked client without $on → skip

  anyClient.$on('query', (e: Prisma.QueryEvent) => {
    const store = requestContext.getStore();
    const tenant = store?.tenantId ? hashTenantId(store.tenantId) : 'unknown';
    dbQueryDuration.labels(tenant).observe(e.duration);
  });

  anyClient.$on('error', (_e: Prisma.LogEvent) => {
    const store = requestContext.getStore();
    const tenant = store?.tenantId ? hashTenantId(store.tenantId) : 'unknown';
    dbErrorCounter.labels(tenant).inc();
  });
}

const datasourceUrl = process.env.PGBOUNCER_URL || process.env.DATABASE_URL || '';
const poolMax = Number(process.env.PRISMA_POOL_MAX || 10);
const dedicatedPoolMax = Number(process.env.DEDICATED_PRISMA_POOL_MAX || 5);

function withConnectionLimit(url: string, limit: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set('connection_limit', String(limit));
    return u.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: withConnectionLimit(datasourceUrl, poolMax) } },
    // route logs as events so they don't hit console unless you handle them
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn',  emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

attachClientObservers(prisma);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const TENANT_SCOPED_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name)
);

// Dedicated-client cache (keyed by datasource URL) — now LRU-bounded with TTL
const pendingDeleteReasons = new Map<string, string>();
const dedicatedClientCache = new LRUCache<string, PrismaClient>({
  max: Number(process.env.MAX_DEDICATED_CLIENTS ?? 50),
  ttl: Number(process.env.DEDICATED_CLIENT_TTL_MS ?? 15 * 60 * 1000),
  updateAgeOnGet: true,
  disposeAfter: (client: PrismaClient, url: string, reason?: unknown) => {
    const r = pendingDeleteReasons.get(url) || (reason as string) || 'unknown';
    pendingDeleteReasons.delete(url);
    opMetrics.inc('cacheEvict');
    opMetrics.inc('evictReason', 1, { reason: r });
    void client.$disconnect();
  },
});

// ---- Apply tenant guards to any Prisma client (shared or dedicated) ----
function applyTenantGuards(client: PrismaClient) {
  // eslint-disable-next-line deprecation/deprecation
  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    const context = tenantContext.getStore();
    
    // Skip middleware if no tenant context (health checks, webhooks)
    if (!context) {
      return next(params);
    }

    const ctx = context;
    const tenantId = ctx.tenant.id;
    const { model, action } = params;

    // -------- Nested-write & FK cross-tenant guard --------
    // Map known relation *field names* and FK fields to their model delegates
    const RELATION_KEY_TO_MODEL: Record<string, keyof PrismaClient> = {
      product: 'product',
      package: 'package',
      slot: 'packageSlot',
      createdBy: 'user',
      owner: 'user',
      booking: 'booking',
      coupon: 'coupon',
      destination: 'destination',
      attraction: 'attraction',
      proposal: 'itineraryProposal',
    };
    const FK_FIELD_TO_MODEL: Record<string, keyof PrismaClient> = {
      productId: 'product',
      packageId: 'package',
      slotId: 'packageSlot',
      createdById: 'user',
      ownerId: 'user',
      bookingId: 'booking',
      couponId: 'coupon',
      destinationId: 'destination',
      attractionId: 'attraction',
      proposalId: 'itineraryProposal',
    };

    async function assertBelongs(
      delegate: keyof PrismaClient,
      id: string
    ): Promise<void> {
      if (delegate === 'tenant') {
        if (id !== tenantId) throw new Error(`Cross-tenant reference blocked: tenant(${id})`);
        return;
      }
      const tx = (ctx.prisma as any)[delegate];
      if (!tx || typeof tx.findFirst !== 'function') return;
      const found = await tx.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!found) {
        throw new Error(`Cross-tenant reference blocked: ${String(delegate)}(${id})`);
      }
    }

    function injectTenantIntoCreatePayload(x: any): any {
      if (x && typeof x === 'object') {
        if (Array.isArray(x)) return x.map(injectTenantIntoCreatePayload);
        return { ...x, tenantId };
      }
      return x;
    }

    async function guardDeep(data: any): Promise<void> {
      if (!data || typeof data !== 'object') return;

      // 1) Direct FK assignments like data: { productId: '...' }
      for (const [k, v] of Object.entries(data)) {
        if (k === 'tenantId' && typeof v === 'string' && v !== tenantId) {
          (data as any).tenantId = tenantId;
          continue;
        }
        if (v && typeof v === 'object') continue; // handled below
        const delegate = FK_FIELD_TO_MODEL[k];
        if (delegate && typeof v === 'string') {
          await assertBelongs(delegate, v);
        }
      }

      // 2) Relation objects with connect/create/etc
      for (const [relKey, relVal] of Object.entries(data)) {
        if (!relVal || typeof relVal !== 'object') continue;
        const delegate = RELATION_KEY_TO_MODEL[relKey];
        if (!delegate) {
          // Still recurse into unknown objects (could hold nested relations)
          await guardDeep(relVal);
          continue;
        }

        // connect
        if ('connect' in (relVal as any)) {
          const c = (relVal as any).connect;
          const items = Array.isArray(c) ? c : [c];
          for (const it of items) {
            if (it && typeof it === 'object' && typeof it.id === 'string') {
              await assertBelongs(delegate, it.id);
            }
          }
        }

        // connectOrCreate: validate connect.id; also force create.tenantId
        if ('connectOrCreate' in (relVal as any)) {
          const cc = (relVal as any).connectOrCreate;
          const items = Array.isArray(cc) ? cc : [cc];
          for (const it of items) {
            if (it?.where?.id) {
              await assertBelongs(delegate, it.where.id);
            }
            if (it?.create) {
              it.create = injectTenantIntoCreatePayload(it.create);
              await guardDeep(it.create);
            }
          }
        }

        // create / createMany: enforce tenantId and recurse
        if ('create' in (relVal as any)) {
          const cv = (relVal as any).create;
          if (Array.isArray(cv)) {
            (relVal as any).create = cv.map(injectTenantIntoCreatePayload);
            for (const c of (relVal as any).create) await guardDeep(c);
          } else {
            (relVal as any).create = injectTenantIntoCreatePayload(cv);
            await guardDeep((relVal as any).create);
          }
        }
        if ('createMany' in (relVal as any) && (relVal as any).createMany?.data) {
          const arr = (relVal as any).createMany.data;
          (relVal as any).createMany.data = Array.isArray(arr)
            ? arr.map(injectTenantIntoCreatePayload)
            : injectTenantIntoCreatePayload(arr);
        }

        // update/upsert: just recurse into their inner data
        if ('update' in (relVal as any)) {
          await guardDeep((relVal as any).update);
        }
        if ('upsert' in (relVal as any)) {
          if ((relVal as any).upsert?.create) {
            (relVal as any).upsert.create = injectTenantIntoCreatePayload((relVal as any).upsert.create);
            await guardDeep((relVal as any).upsert.create);
          }
          if ((relVal as any).upsert?.update) {
            await guardDeep((relVal as any).upsert.update);
          }
        }
      }
    }

    // Only guard on mutating actions with data payloads
    if (['create', 'createMany', 'update', 'updateMany', 'upsert'].includes(action) && (params.args as any)?.data) {
      await guardDeep((params.args as any).data);
    }

    // Skip tenant scoping for certain models that are global
    const isTenantScoped = model ? TENANT_SCOPED_MODELS.has(model) : false;
    if (!isTenantScoped) {
      return next(params);
    }

    // Special handling for findUnique operations to avoid invalid tenant injection
    if (isTenantScoped && action === 'findUnique' && (params.args as any)?.where) {
      const where = (params.args as any).where;
      // If the where clause doesn't include tenantId and this is a tenant-scoped model
      if (!where.tenantId) {
        // Convert to findFirst with tenant scoping
        (params as any).action = 'findFirst';
        (params.args as any).where = { ...where, tenantId };
      }
    }

    // Same for findUniqueOrThrow → findFirstOrThrow
    if (isTenantScoped && action === 'findUniqueOrThrow' && (params.args as any)?.where) {
      const where = (params.args as any).where;
      if (!where.tenantId) {
        (params as any).action = 'findFirstOrThrow';
        (params.args as any).where = { ...where, tenantId };
      }
    }

    // Auto-inject tenantId for operations
    if (action === 'create' || action === 'createMany') {
      if ((params.args as any).data) {
        if (Array.isArray((params.args as any).data)) {
          // createMany
          (params.args as any).data = (params.args as any).data.map((item: any) => ({
            ...item,
            tenantId
          }));
        } else {
          // create
          (params.args as any).data = {
            ...(params.args as any).data,
            tenantId
          };
        }
      }
    }

    // Auto-inject tenantId filter for read/update/delete operations
    if (isTenantScoped && ['findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(action)) {
      if (!params.args) (params as any).args = {};
      if (!('where' in (params.args as any)) || !(params.args as any).where) (params.args as any).where = {};
      
      // Don't override existing tenantId filter, but add tenant scoping
      if (!(params.args as any).where.tenantId) {
        (params.args as any).where.tenantId = tenantId;
      }
    }

    return next(params);
  });
}

/**
 * Exported admin/ops hook to evict a dedicated Prisma client by URL.
 * We rely on the LRU's disposeAfter to perform exactly-one disconnect.
 * This keeps semantics consistent and avoids double-disconnects even if callers
 * invoke this repeatedly from different code paths.
 */
export function evictDedicatedClient(url: string, reason: string = 'manual'): void {
  pendingDeleteReasons.set(url, reason);
  const deleted = dedicatedClientCache.delete(url);
  // If there was nothing to delete, clean up the staged reason to avoid leaks.
  if (!deleted) {
    pendingDeleteReasons.delete(url);
  }
  eventBus.publish(TENANT_EVENTS.CLIENT_EVICTED, { urlHash: hashUrl(url), reason, at: new Date().toISOString() });
}

export function getDedicatedCacheStats() {
  return {
    size: dedicatedClientCache.size,
    // caution: never include raw DSNs
    keys: Array.from(dedicatedClientCache.keys() as Iterable<string>).map(hashUrl),
    metrics: opMetrics.snapshot(),
  };
}

export function getPrismaPoolStats() {
  return {
    sharedCap: poolMax,
    dedicatedCap: dedicatedPoolMax,
    dedicatedClients: dedicatedClientCache.size,
  };
}

export async function getPgBouncerStats() {
  try {
    const rows = await prisma.$queryRaw<{
      cl_active: number;
      cl_waiting: number;
      sv_active: number;
      sv_idle: number;
    }[]>`SHOW POOLS`;
    return rows.reduce(
      (acc, r) => ({
        cl_active: acc.cl_active + Number(r.cl_active),
        cl_waiting: acc.cl_waiting + Number(r.cl_waiting),
        sv_active: acc.sv_active + Number(r.sv_active),
        sv_idle: acc.sv_idle + Number(r.sv_idle),
      }),
      { cl_active: 0, cl_waiting: 0, sv_active: 0, sv_idle: 0 }
    );
  } catch {
    return null;
  }
}

function hashUrl(url: string): string {
  // do NOT log the full DSN; hash it for diagnostics
  // simple hash to avoid pulling in crypto heavy deps here
  let h = 0; for (let i=0; i<url.length; i++) { h = (h*31 + url.charCodeAt(i))|0; }
  return `u${(h>>>0).toString(16)}`;
}

/**
 * Get (or create) a dedicated Prisma client for a DSN. Applies tenant guards.
 * NOTE: we keep construction here, but we’ll health-check in middleware before use.
 */
export function getDedicatedPrisma(url: string): PrismaClient {
  let client = dedicatedClientCache.get(url);
  if (client) {
    opMetrics.inc('cacheHit');
  } else {
    const lim = dedicatedPoolMax;
    opMetrics.inc('cacheMiss');
    client = new PrismaClient({
      datasources: { db: { url: withConnectionLimit(url, lim) } },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'warn',  emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
    attachClientObservers(client);
    applyTenantGuards(client);
    dedicatedClientCache.set(url, client);
  }
  return client;
}

// Subscribe to tenant datasource changes → evict stale client(s)
eventBus.on(TENANT_EVENTS.DATASOURCE_CHANGED, (payload: any) => {
  try {
    const beforeUrl = payload?.before?.datasourceUrl;
    const afterUrl  = payload?.after?.datasourceUrl;
    if (beforeUrl && beforeUrl !== afterUrl) {
      evictDedicatedClient(beforeUrl, 'datasource_changed');
    }
    // If toggling dedicated → also evict the old url
    if (payload?.before?.dedicated && !payload?.after?.dedicated && beforeUrl) {
      evictDedicatedClient(beforeUrl, 'dedicated_disabled');
    }
  } catch (e) {
    logger.error('evict_on_datasource_changed_failed', { e });
  }
});

applyTenantGuards(prisma);

/**
 * Run a function with admin RLS bypass inside a transaction.
 * Only to be used in maintenance/test cleanup paths.
 */
export async function withAdminRls<T>(
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('withAdminRls is disabled in production');
  }
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SET LOCAL app.role = 'admin'`;
    return fn(tx);
  });
}

/**
 * Run a function in a transaction with platform-level RLS bypass.
 * Uses app.role='admin' so that platform services can query tenant data safely.
 */
export async function withPlatformRole<T>(
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SET LOCAL app.role = 'admin'`;
    return fn(tx);
  });
}

/**
 * Factory to obtain Prisma client. When bypassRls=true, each operation
 * executes inside withPlatformRole(), ensuring RLS is bypassed only for
 * platform code paths. In production, use within tenant context throws.
 */
export function getPrismaClient(opts: { bypassRls?: boolean } = {}): PrismaClient {
  if (!opts.bypassRls) return prisma;
  const ctx = tenantContext.getStore();
  if (ctx && process.env.NODE_ENV === 'production') {
    throw new Error('RLS bypass client not allowed in tenant context');
  }
  const wrapDelegate = (delegate: any, key: string) =>
    new Proxy(delegate, {
      get(target, prop) {
        const v = (target as any)[prop];
        if (typeof v === 'function') {
          return (...args: any[]) =>
            withPlatformRole((tx) => (tx as any)[key][prop](...args));
        }
        return v;
      },
    });

  return new Proxy(prisma, {
    get(target, prop) {
      const value = (target as any)[prop];
      if (typeof value === 'function') {
        return (...args: any[]) =>
          withPlatformRole((tx) => (tx as any)[prop](...args));
      }
      if (typeof value === 'object' && value !== null) {
        return wrapDelegate(value, String(prop));
      }
      return value;
    },
  }) as PrismaClient;
}

// Disconnect helper for graceful shutdown (shared + all dedicated)
export async function disconnectAllPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } finally {
    // Attribute a clean shutdown reason and let the LRU perform one disconnect per client.
    // clear() will synchronously trigger disposeAfter for each entry.
    for (const key of dedicatedClientCache.keys() as Iterable<string>) {
      pendingDeleteReasons.set(key, 'shutdown');
    }
    dedicatedClientCache.clear();
  }
}