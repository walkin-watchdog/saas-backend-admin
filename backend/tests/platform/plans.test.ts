import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import crypto from 'crypto';

describe('Platform plan manager', () => {
  let token: string;
  let admin: any;

  beforeAll(async () => {
    await prisma.platformPermission.createMany({
      data: [
        { code: 'plans.read', description: 'read plans' },
        { code: 'plans.write', description: 'write plans' },
      ],
    });
    const role = await prisma.platformRole.create({ data: { code: 'plan_admin', name: 'Plan Admin', description: '' } });
    const perms = await prisma.platformPermission.findMany({ where: { code: { in: ['plans.read', 'plans.write'] } } });
    await prisma.platformRolePermission.createMany({ data: perms.map(p => ({ platformRoleId: role.id, permissionId: p.id })) });
    admin = await prisma.platformUser.create({ data: { email: 'plans@x.test', name: 'Plans', passwordHash: 'h', mfaEnabled: true } });
    await prisma.platformUserRole.create({ data: { platformUserId: admin.id, platformRoleId: role.id } });
    const jti = crypto.randomUUID();
    token = signPlatformAccess({ sub: admin.id, email: admin.email, roles: ['plan_admin'], permissions: ['plans.read','plans.write'] }, jti);
    await prisma.platformSession.create({ data: { platformUserId: admin.id, jti, expiresAt: new Date(Date.now()+3600000) } });
  });

  afterAll(async () => {
    await prisma.plan.deleteMany();
    await prisma.platformSession.deleteMany({ where: { platformUserId: admin.id } });
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  it('creates and versions plans', async () => {
    const createRes = await request(app)
      .post('/api/platform/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'basic',
        priceMonthlyUsd: 1000,
        priceYearlyUsd: 10000,
        priceMonthlyInr: 80000,
        priceYearlyInr: 800000,
        billingFrequency: 'monthly',
        marketingName: 'Basic',
        marketingDescription: '',
        featureHighlights: [],
        public: true,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.version).toBe(1);

    const updateRes = await request(app)
      .put(`/api/platform/plans/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priceMonthlyUsd: 2000 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.version).toBe(2);

    const listRes = await request(app)
      .get('/api/platform/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.plans)).toBe(true);
    expect(listRes.body.plans[0].prices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', period: 'monthly', amountInt: 2000 }),
        expect.objectContaining({ currency: 'USD', period: 'yearly', amountInt: 10000 }),
        expect.objectContaining({ currency: 'INR', period: 'monthly', amountInt: 80000 }),
        expect.objectContaining({ currency: 'INR', period: 'yearly', amountInt: 800000 }),
      ])
    );

    const getRes = await request(app)
      .get(`/api/platform/plans/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createRes.body.id);
    expect(getRes.body.prices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', period: 'monthly', amountInt: 2000 }),
        expect.objectContaining({ currency: 'USD', period: 'yearly', amountInt: 10000 }),
        expect.objectContaining({ currency: 'INR', period: 'monthly', amountInt: 80000 }),
        expect.objectContaining({ currency: 'INR', period: 'yearly', amountInt: 800000 }),
      ])
    );

    const notFound = await request(app)
      .get('/api/platform/plans/unknown')
      .set('Authorization', `Bearer ${token}`);
    expect(notFound.status).toBe(404);
  });
});