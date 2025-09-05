import request from 'supertest';
import { prisma } from '../../src/utils/prisma';
import { app } from '../../src/app';
import { signAccess } from '../../src/utils/jwt';
import { FeatureFlagService } from '../../src/services/featureFlagService';

jest.mock('../../src/services/tenantConfigService');
import { TenantConfigService } from '../../src/services/tenantConfigService';

describe('Feature gating defaults', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'FGTenant', status: 'active', dedicated: false } });
    admin = await prisma.user.create({ data: { tenantId: tenant.id, email: 'a@b.com', password: 'p', name: 'Admin', role: 'ADMIN' } });
    const plan = await prisma.plan.create({ data: { code: 'p', billingFrequency: 'monthly', marketingName: 'P', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'trialing' } });
    token = signAccess({ sub: admin.id, tenantId: tenant.id, role: 'ADMIN', tokenVersion: 0, platformAdmin: false });

    // Mock the currency API key to prevent 412 errors in tests
    (TenantConfigService.getConfig as any).mockImplementation(async (tenantId: string, key: string) => {
      if (key === 'currencyApi') {
        return { apiKey: 'test-currency-api-key' };
      }
      return null;
    });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.plan.deleteMany({ where: { code: 'p' } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows access when UNLEASH_URL missing', async () => {
    delete process.env.UNLEASH_URL;
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // switch subscription to active and check again
    await prisma.subscription.updateMany({ where: { tenantId: tenant.id }, data: { status: 'active' } });
    const res2 = await request(app)
      .get('/api/analytics/dashboard')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
  });

  it('blocks when feature disabled', async () => {
    process.env.UNLEASH_URL = 'http://example.com';
    jest.spyOn(FeatureFlagService, 'isEnabled').mockResolvedValue(false);
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows access when UNLEASH_URL is set and flag is enabled', async () => {
    process.env.UNLEASH_URL = 'http://example.com';
    jest.spyOn(FeatureFlagService, 'isEnabled').mockResolvedValue(true);

    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});