import { Prisma } from '@prisma/client';
import { prisma as sharedPrisma } from '../utils/prisma';
import { getTenantPrisma, getTenantId, getCurrentTenant } from '../middleware/tenantMiddleware';
import dns from 'dns/promises';
import crypto from 'crypto';


export function normalizeDomain(input: string): string {
  const raw = input.trim();
  const withoutScheme = raw.replace(/^\s*https?:\/\//i, '');
  try {
    const u = new URL(`http://${withoutScheme}`);
    return (u.port ? `${u.hostname}:${u.port}` : u.hostname).toLowerCase();
  } catch {
    return withoutScheme.replace(/\/.*$/, '').toLowerCase();
  }
}

export class DomainService {
  static async list() {
    const tenantId = getTenantId();
    return sharedPrisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async create(payload: { domain: string; isActive?: boolean; isAdminHost?: boolean }) {
    // Always write to the SHARED DB (global resolver reads from here pre-auth)
    const { id: tenantId } = getCurrentTenant();
    const client = sharedPrisma;

    const domain = normalizeDomain(payload.domain);

    return client.$transaction(async (tx: any) => {
      // Scope RLS to this txn
      // If RLS is enabled on tenant_domains, scope to this tenant
      try { await (tx as any).$executeRaw`SELECT set_config('app.tenantId', ${tenantId}, true)`; } catch {}

      try {
        return await tx.tenantDomain.create({
          data: {
            tenantId,
            domain,
            isActive: payload.isActive ?? true,
            isAdminHost: payload.isAdminHost ?? false
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          const err = new Error('Domain already exists'); (err as any).status = 409;
          throw err;
        }
        throw e;
      }
    });
  }

  static async update(id: string, payload: { domain?: string; isActive?: boolean; isAdminHost?: boolean }) {
    const prisma = sharedPrisma;
    const tenantId = getTenantId();

    const data: Prisma.TenantDomainUpdateInput = {};
    if (payload.domain) data.domain = normalizeDomain(payload.domain);
    if (typeof payload.isActive === 'boolean') data.isActive = payload.isActive;
    if (typeof payload.isAdminHost === 'boolean') data.isAdminHost = payload.isAdminHost;

    try {
      // Enforce tenant scoping via updateMany
      const res = await prisma.tenantDomain.updateMany({
        where: { id, tenantId },
        data,
      });
      if (res.count === 0) {
        const err = new Error('Domain not found'); (err as any).code = 'P2025';
        throw err;
      }
      // Return the updated row
      return prisma.tenantDomain.findFirstOrThrow({ where: { id, tenantId } });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const err = new Error('Domain already exists'); (err as any).status = 409;
        throw err;
      }
      throw e;
    }
  }

  static async remove(id: string) {
    const tenantId = getTenantId();
    const client = sharedPrisma;

    return client.$transaction(async (tx: any) => {
      try { await (tx as any).$executeRaw`SELECT set_config('app.tenantId', ${tenantId}, true)`; } catch {}

      // Verify ownership explicitly to return 404 for non-owned/non-existent IDs
      const existing = await tx.tenantDomain.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) {
        const err = new Error('Domain not found'); (err as any).code = 'P2025';
        throw err;
      }

      // Delete by PK (single row). This commit is independent of outer TX.
      await tx.tenantDomain.delete({ where: { id: existing.id } });

      return { deleted: true };
    });
  }

    /** Start verification by issuing a TXT token the tenant will publish */
  static async startVerification(id: string) {
    const token = crypto.randomBytes(16).toString('hex');
    const tenantId = getTenantId();
    const updated = await sharedPrisma.tenantDomain.updateMany({
      where: { id, tenantId },
      data: { verificationToken: token, verifiedAt: null }
    });
    if (updated.count === 0) throw Object.assign(new Error('Domain not found'), { status: 404 });
    const domain = await sharedPrisma.tenantDomain.findFirstOrThrow({ where: { id, tenantId } });
    return {
      domain: domain.domain,
      token,
      /** Recommend TXT at _admin.<domain> with this exact value */
      dnsRecord: { host: `_admin.${domain.domain}`, type: 'TXT', value: `ww-admin-verification=${token}` }
    };
  }

  /** Verify DNS TXT at _admin.<domain> contains the token we issued */
  static async verify(id: string) {
    const tenantId = getTenantId();
    const dom = await sharedPrisma.tenantDomain.findFirst({ where: { id, tenantId } });
    if (!dom || !dom.verificationToken) throw new Error('No verification in progress');
    const host = `_admin.${dom.domain}`;
    const txts = await dns.resolveTxt(host).catch(() => []);
    const flat = txts.map(parts => parts.join('')).join(' ');
    const ok = flat.includes(`ww-admin-verification=${dom.verificationToken}`);
    if (!ok) return { verified: false };
    await sharedPrisma.tenantDomain.update({
      where: { id },
      data: { verifiedAt: new Date() }
    });
    return { verified: true };
  }

  static async isVerifiedAdminHost(host: string) {
    const domain = normalizeDomain(host);
    const rec = await sharedPrisma.tenantDomain.findUnique({ where: { domain } });
    return !!(rec && rec.isActive && rec.isAdminHost && rec.verifiedAt);
  }

  /** Helper: resolve tenantId by verified admin host (shared DB, pre-auth) */
  static async getTenantIdByAdminHost(host: string): Promise<string | null> {
    const domain = normalizeDomain(host);
    const rec = await sharedPrisma.tenantDomain.findUnique({ where: { domain } });
    if (rec && rec.isActive && rec.isAdminHost && rec.verifiedAt) return rec.tenantId;
    return null;
  }
}