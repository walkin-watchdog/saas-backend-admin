import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformUserService } from '../../src/services/platformUserService';

describe('Plan management endpoints', () => {
  let adminToken: string;
  let plan: any;

  beforeAll(async () => {
    const perm = await prisma.platformPermission.createMany({
      data: [
        { code: 'plans.write', description: 'write plans' },
        { code: 'plans.read', description: 'read plans' },
      ],
    });
    const role = await prisma.platformRole.create({ data: { code: 'admin', name: 'Admin', description: '' } });
    const perms = await prisma.platformPermission.findMany();
    await prisma.platformRolePermission.createMany({ data: perms.map(p => ({ platformRoleId: role.id, permissionId: p.id })) });
    const passwordHash = await PlatformUserService.hashPassword('pass');
    const user = await prisma.platformUser.create({ data: { email: 'admin@plans', name: 'Admin', passwordHash } });
    await prisma.platformUserRole.create({ data: { platformUserId: user.id, platformRoleId: role.id } });
    const jti = randomUUID();
    adminToken = signPlatformAccess({ sub: user.id, email: user.email, roles: ['admin'], permissions: ['plans.write','plans.read'] }, jti);
    await PlatformSessionService.create(user.id, jti);
    plan = await prisma.plan.create({ data: { code: 'basic', billingFrequency: 'monthly', marketingName: 'Basic', marketingDescription: '', featureHighlights: [], public: true, active: true, version: 1,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 100 },
        { currency: 'USD', period: 'yearly', amountInt: 1000 },
        { currency: 'INR', period: 'monthly', amountInt: 8000 },
        { currency: 'INR', period: 'yearly', amountInt: 80000 },
      ] } } });
  });

  afterAll(async () => {
    await prisma.plan.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformPermission.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformUser.deleteMany();
  });

  test('toggle public and active', async () => {
    let res = await request(app)
      .post(`/api/platform/plans/${plan.id}/public`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ public: false });
    expect(res.status).toBe(200);
    expect(res.body.public).toBe(false);

    res = await request(app)
      .post(`/api/platform/plans/${plan.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('returns 404 for unknown plan', async () => {
    const res = await request(app)
      .post(`/api/platform/plans/unknown/public`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ public: true });
    expect(res.status).toBe(404);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post(`/api/platform/plans/${plan.id}/public`)
      .send({ public: true });
    expect(res.status).toBe(401);
  });
});
