import request from 'supertest';
import { prisma } from '../../src/utils/prisma';
import { signAccess } from '../../src/utils/jwt';
import { app } from '../../src/app';

jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' }),
}));

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cust1' }) },
    subscriptions: { update: jest.fn().mockResolvedValue({ id: 'sub_ok' }) },
    // SDK's .api is not used anymore; we keep it here to ensure no accidental calls.
    api: { post: jest.fn().mockRejectedValue(new Error('should_not_be_called')) },
  }));
});

// Mock superagent at module scope so the route's import sees the mock.
// IMPORTANT: keep the real superagent exports so supertest can extend Request
const saAuthMock = jest.fn().mockReturnThis();
const saSendMock = jest.fn().mockRejectedValue(new Error('bad token'));
const saPostMock = jest.fn((url: string) => ({ auth: saAuthMock, send: saSendMock }));
jest.mock('superagent', () => {
  const actual = jest.requireActual('superagent');
  const saDelMock = jest.fn((url: string) => ({ auth: saAuthMock })); // future-proof DELETE
  return { ...actual, post: (url: string) => saPostMock(url), delete: (url: string) => saDelMock(url) };
});

describe('Payment method lifecycles', () => {
  let tenant: any;
  let admin: any;
  let token: string;
  let pm: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'PMTenant', status: 'active', dedicated: false } });
    admin = await prisma.user.create({ data: { tenantId: tenant.id, email: 'pm@a.com', password: 'p', name: 'Admin', role: 'ADMIN' } });
    const plan = await prisma.plan.create({ data: { code: 'planpm', billingFrequency: 'monthly', marketingName: 'P', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'active' } });
    pm = await prisma.paymentMethod.create({ data: { tenantId: tenant.id, platformCustomerId: 'cust1', gatewayPaymentMethodId: 'pm1', isDefault: true } as any });
    token = signAccess({ sub: admin.id, tenantId: tenant.id, role: 'ADMIN', tokenVersion: 0, platformAdmin: false });
  });

  afterAll(async () => {
    await prisma.paymentMethod.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.plan.deleteMany({ where: { code: 'planpm' } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  it('attach with invalid token yields 400', async () => {
    const res = await request(app)
      .post('/api/billing/payment-methods/attach')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token: 'bad' });
    expect(res.status).toBe(400);
  });

  it('cannot detach last payment method when subscription active', async () => {
    const res = await request(app)
      .delete(`/api/billing/payment-methods/${pm.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(res.status).toBe(409);
    expect(res.body?.error).toBe('LAST_USABLE_PM_ON_ACTIVE_SUB');
  });

  it('set default on non-existent id -> 404', async () => {
    const res = await request(app)
      .put('/api/billing/payment-methods/nope')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ default: true });
    expect(res.status).toBe(404);
  });
});