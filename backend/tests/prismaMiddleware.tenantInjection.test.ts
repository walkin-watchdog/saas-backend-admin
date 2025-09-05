// tests/prismaMiddleware.tenantInjection.test.ts
import { UserRole } from '@prisma/client';
import { prisma } from '../src/utils/prisma';
import { TenantService } from '../src/services/tenantService';

describe('Prisma middleware tenant injection', () => {
  it('auto-populates tenantId on create (no tenant provided)', async () => {
    const tenantA = await prisma.tenant.create({ data: { name: 'Midware Co A', status: 'active' } });

    await TenantService.withTenantContext(tenantA, async (tx) => {
      // Omit tenant/tenantId intentionally; middleware should inject it.
      const alice = await (tx as any).user.create({
        data: {
          email: 'alice@acme.co',
          password: 'x',
          name: 'Alice',
          role: UserRole.EDITOR,
        },
      });
      expect(alice.tenantId).toBe(tenantA.id);
    });
  });

  it('scopes reads/updates without explicit where.tenantId', async () => {
    const tenantB = await prisma.tenant.create({ data: { name: 'Midware Co B', status: 'active' } });
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other Co', status: 'active' } });

    // Seed 2 users in tenantB
    await TenantService.withTenantContext(tenantB, async (tx) => {
      await (tx as any).user.create({
        data: { email: 'alice1@acme.co', password: 'x', name: 'Alice1', role: UserRole.VIEWER },
      });
      await (tx as any).user.create({
        data: { email: 'alice2@acme.co', password: 'x', name: 'Alice2', role: UserRole.VIEWER },
      });
    });

    // Seed 1 user in otherTenant
    await TenantService.withTenantContext(otherTenant, async (tx) => {
      await (tx as any).user.create({
        data: { email: 'bob@x.co', password: 'x', name: 'Bob', role: UserRole.VIEWER },
      });
    });

    // Queries in tenantB should not see otherTenant's rows
    await TenantService.withTenantContext(tenantB, async (tx) => {
      const found = await tx.user.findMany({ where: { email: { contains: 'alice' } } });
      expect(found.map((u) => u.email).sort()).toEqual(['alice1@acme.co', 'alice2@acme.co']);
      expect(found.every((u) => u.tenantId === tenantB.id)).toBe(true);

      const updated = await tx.user.updateMany({
        data: { name: 'Upd' },
        where: { email: { endsWith: 'acme.co' } },
      });
      expect(updated.count).toBe(2);
    });

    // Sanity: other tenant user remains unchanged
    const bob = await TenantService.withTenantContext(otherTenant, async (tx) =>
      tx.user.findFirst({ where: { email: 'bob@x.co' } })
    );
    expect(bob?.name).toBe('Bob');
  });
});