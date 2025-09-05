import { getPrismaClient, prisma } from '../src/utils/prisma';
import { tenantContext } from '../src/middleware/tenantMiddleware';

describe('prisma bypassRls client', () => {
  it('allows usage outside tenant context', async () => {
    const admin = getPrismaClient({ bypassRls: true });
    const tenants = await admin.tenant.findMany();
    expect(Array.isArray(tenants)).toBe(true);
  });

  it('throws in tenant context in production', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const t = await prisma.tenant.create({ data: { name: 'BYP', status: 'active', dedicated: false } });
    await tenantContext.run({ tenant: t, prisma }, async () => {
      expect(() => getPrismaClient({ bypassRls: true })).toThrow('RLS bypass client not allowed');
    });
    await prisma.tenant.delete({ where: { id: t.id } });
    process.env.NODE_ENV = orig;
  });
});