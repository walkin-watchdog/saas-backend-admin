import { prisma } from '../src/utils/prisma';

describe('Per-tenant uniqueness (productCode within tenant; allowed across tenants)', () => {
  let t1: { id: string };
  let t2: { id: string };

  beforeAll(async () => {
    t1 = await prisma.tenant.create({ data: { name: 'UniqueT1', status: 'active', dedicated: false } });
    t2 = await prisma.tenant.create({ data: { name: 'UniqueT2', status: 'active', dedicated: false } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { tenantId: { in: [t1.id, t2.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [t1.id, t2.id] } } });
  });

  it('allows same productCode in different tenants', async () => {
    const code = 'SHARED001';
    const a = await prisma.product.create({
      data: {
        tenantId: t1.id,
        title: 'A',
        productCode: code,
        description: 'X',
        isActive: true,
      } as any,
    });
    const b = await prisma.product.create({
      data: {
        tenantId: t2.id,
        title: 'B',
        productCode: code,
        description: 'Y',
        isActive: true,
      } as any,
    });
    expect(a.productCode).toBe(code);
    expect(b.productCode).toBe(code);
  });

  it('rejects duplicate productCode within the same tenant', async () => {
    expect.assertions(1);
    const code = 'DUP001';
    await prisma.product.create({
      data: {
        tenantId: t1.id,
        title: 'First',
        productCode: code,
        description: 'X',
        isActive: true,
      } as any,
    });
    await expect(
      prisma.product.create({
        data: {
          tenantId: t1.id,
          title: 'Second',
          productCode: code,
          description: 'Y',
          isActive: true,
        } as any,
      })
    ).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: expect.arrayContaining(['tenantId', 'productCode']) },
    });
  });
});