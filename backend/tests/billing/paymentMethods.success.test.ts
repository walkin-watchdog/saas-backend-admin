import request from 'supertest';
import { signAccess } from '../../src/utils/jwt';

// Mock platform credential resolution
jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' }),
}));

// Mock Razorpay SDK for customer creation only
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn().mockResolvedValue({ id: 'custP' }) },
    subscriptions: { update: jest.fn().mockResolvedValue({ id: 'sub_ok' }) },
  }));
});

// Mock event bus to capture emissions
const publishMock = jest.fn();
const onMock = jest.fn();
const offMock = jest.fn();

jest.mock('../../src/utils/eventBus', () => ({
  BILLING_EVENTS: {
    PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
    PAYMENT_METHOD_SET_DEFAULT: 'payment_method.set_default',
    PAYMENT_METHOD_DETACHED: 'payment_method.detached',
  },
  TENANT_EVENTS: {
    DATASOURCE_CHANGED: 'tenant.datasource_changed',
    CLIENT_EVICTED: 'tenant.client_evicted',
  },
  eventBus: {
    publish: (...args: any[]) => publishMock(...args),
    on: (...args: any[]) => onMock(...args),
    off: (...args: any[]) => offMock(...args),
  },
}));

// Mock superagent to succeed on token attach
// IMPORTANT: keep the real superagent exports so supertest can extend Request
const authMock = jest.fn().mockReturnThis();
const sendMock = jest.fn().mockResolvedValue({ body: { id: 'token_ok' } });
const PostMock = jest.fn((url: string) => ({ auth: authMock, send: sendMock }));
jest.mock('superagent', () => {
  const actual = jest.requireActual('superagent');
  const delMock = jest.fn((url: string) => ({ auth: authMock })); // future-proof DELETE
  return { ...actual, post: (url: string) => PostMock(url), delete: (url: string) => delMock(url) };
});

// ---- Mock tenantMiddleware SAFELY: keep actual exports, override two named ones ----
jest.mock('../../src/middleware/tenantMiddleware', () => {
  const actual = jest.requireActual('../../src/middleware/tenantMiddleware');
  return {
    ...actual,
    // Ensure applyTenantGuards can call getStore() without blowing up
    tenantContext: {
      getStore: () => null,              // no request context during tenant resolution
      run: (_ctx: any, fn: any) => fn(), // noop wrapper
    },
    // Make routes use the shared PrismaClient (has $transaction)
    getTenantPrisma: jest.fn(() => require('../../src/utils/prisma').prisma),
  };
});

// Import prisma & app AFTER the mock so everything sees the patched exports
const { prisma } = require('../../src/utils/prisma');
const { app } = require('../../src/app');

describe('Payment method attach success & default toggling', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'PM-ST', status: 'active', dedicated: false } });
    tenant = await prisma.tenant.findUnique({ where: { id: tenant.id } }) as any;
    admin = await prisma.user.create({ data: { tenantId: tenant.id, email: 'admin@pmst.com', password: 'p', name: 'Admin', role: 'ADMIN' } });
    token = signAccess({ sub: admin.id, tenantId: tenant.id, role: 'ADMIN', tokenVersion: 0, platformAdmin: false });
  });

  afterAll(async () => {
    await prisma.paymentMethod.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('attaches and sets default, emits events', async () => {
    publishMock.mockClear();

    const res = await request(app)
      .post('/api/billing/payment-methods/attach')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token: 'pm_tok_1', brand: 'visa', last4: '1111', expMonth: 1, expYear: 2030, name: 'Card A' });
    expect(res.status).toBe(200);
    const id1 = res.body.id;
    expect(typeof id1).toBe('string');

    const list1 = await request(app)
      .get('/api/billing/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(list1.status).toBe(200);
    expect(list1.body.length).toBe(1);
    expect(list1.body[0].default).toBe(true);

    // two events: attached + set_default
    expect(publishMock).toHaveBeenCalledWith('payment_method.attached', expect.any(Object));
    expect(publishMock).toHaveBeenCalledWith('payment_method.set_default', expect.any(Object));
  });

  it('second attach flips default to the new PM', async () => {
    publishMock.mockClear();
    const res2 = await request(app)
      .post('/api/billing/payment-methods/attach')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token: 'pm_tok_2', brand: 'mc', last4: '2222', expMonth: 2, expYear: 2031, name: 'Card B' });
    expect(res2.status).toBe(200);
    const id2 = res2.body.id;

    const list2 = await request(app)
      .get('/api/billing/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(list2.status).toBe(200);
    const pmA = list2.body.find((x: any) => x.last4 === '1111');
    const pmB = list2.body.find((x: any) => x.last4 === '2222');
    expect(pmB.default).toBe(true);
    expect(pmA.default).toBe(false);

    // Update default back to first PM via PUT
    const pmRowA = await prisma.paymentMethod.findFirst({ where: { tenantId: tenant.id, last4: '1111' } });
    const respPut = await request(app)
      .put(`/api/billing/payment-methods/${pmRowA?.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({ default: true });
    expect(respPut.status).toBe(200);

    const list3 = await request(app)
      .get('/api/billing/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    const pmA2 = list3.body.find((x: any) => x.last4 === '1111');
    const pmB2 = list3.body.find((x: any) => x.last4 === '2222');
    expect(pmA2.default).toBe(true);
    expect(pmB2.default).toBe(false);
  });
  
  it('detach succeeds when multiple PMs exist; remaining PM becomes default', async () => {
    // Snapshot current count so we can assert net change (+1 after add, add, delete)
    const before = await request(app)
      .get('/api/billing/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(before.status).toBe(200);

    // Attach two fresh PMs (latest attach becomes default)
    const a = await request(app)
      .post('/api/billing/payment-methods/attach')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({
        token: 'pm_tok_3',
        brand: 'visa',
        last4: '3333',
        expMonth: 3,
        expYear: 2032,
        name: 'Card C',
      });
    expect(a.status).toBe(200);

    const b = await request(app)
      .post('/api/billing/payment-methods/attach')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey)
      .send({
        token: 'pm_tok_4',
        brand: 'mc',
        last4: '4444',
        expMonth: 4,
        expYear: 2033,
        name: 'Card D',
      });
    expect(b.status).toBe(200);
    const idDefault = b.body.id; // newest is default per route logic

    // Detach current default
    const del = await request(app)
      .delete(`/api/billing/payment-methods/${idDefault}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(del.status).toBe(204);

    // Remaining one from this pair should now be default
    const after = await request(app)
      .get('/api/billing/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .set('x-api-key', tenant.apiKey);
    expect(after.status).toBe(200);
    expect(after.body.length).toBeGreaterThanOrEqual((before.body?.length || 0) + 1);
    const remaining = after.body.find((x: any) => x.last4 === '3333');
    expect(remaining).toBeTruthy();
    expect(remaining.default).toBe(true);
  });
});