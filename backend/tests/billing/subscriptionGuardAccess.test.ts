import request from 'supertest';
import { prisma } from '../../src/utils/prisma';
import { app } from '../../src/app';
import { signAccess } from '../../src/utils/jwt';

describe('Paid route is blocked for suspended subscriptions', () => {
  let tenant: any;
  let user: any;
  let token: string;
  let plan: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'GuardedT', status: 'active', dedicated: false } });
    user = await prisma.user.create({ data: { tenantId: tenant.id, email: 'a@b.com', password: 'p', name: 'Admin', role: 'ADMIN' } });
    plan = await prisma.plan.create({ data: { code: 'g1', billingFrequency: 'monthly', marketingName: 'G', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'suspended' } });
    token = signAccess({ sub: user.id, tenantId: tenant.id, role: 'ADMIN', tokenVersion: 0, platformAdmin: false });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.plan.deleteMany({ where: { code: 'g1' } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  it('returns 402 for /api/analytics/dashboard', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(res.status).toBe(402);
  });
});