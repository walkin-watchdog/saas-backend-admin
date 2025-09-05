import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signAccess } from '../../src/utils/jwt';

jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 'secret' }),
  PaypalCredentialResolver: jest.fn().mockResolvedValue({ clientId: 'cid', clientSecret: 'sec', baseUrl: 'https://paypal.test' }),
}));

(global as any).fetch = jest.fn(async (url: string) => {
  if (url.endsWith('/v1/oauth2/token')) {
    return { ok: true, json: async () => ({ access_token: 'tok' }) } as any;
  }
  if (url.includes('/v1/billing/subscriptions/')) {
    return { ok: true, json: async () => ({ status: 'ACTIVE' }) } as any;
  }
  return { ok: false, json: async () => ({}) } as any;
});

describe('mandate verification', () => {
  let tenant: any;
  let user: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'Mandate', status: 'active', dedicated: false } });
    user = await prisma.user.create({ data: { tenantId: tenant.id, email: 'm@a.com', password: 'p', name: 'Admin', role: 'ADMIN' } });
    token = signAccess({ sub: user.id, tenantId: tenant.id, role: 'ADMIN', tokenVersion: 0, platformAdmin: false });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  it('verifies razorpay mandate signature', async () => {
    const sig = crypto.createHmac('sha256', 'secret').update('pay|sub').digest('hex');
    const res = await request(app)
      .post('/api/billing/payment-methods/verify-mandate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ provider: 'razorpay', razorpay_payment_id: 'pay', razorpay_subscription_id: 'sub', razorpay_signature: sig });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  it('verifies paypal subscription active', async () => {
    const res = await request(app)
      .post('/api/billing/payment-methods/verify-mandate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ provider: 'paypal', subscriptionId: 'sub123' });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });
});