process.env.ALLOWED_PUBLIC_ORIGINS = 'https://allowed.example';
import request from 'supertest';
// Use require after setting env so allowed-origins snapshot is correct
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require('../src/app');
import { prisma } from '../src/utils/prisma';
import { SubscriptionService } from '../src/services/subscriptionService';
import { verifyPublicCaptcha } from '../src/utils/publicCaptcha';
import { eventBus, PUBLIC_EVENTS } from '../src/utils/eventBus';

jest.mock('../src/utils/publicCaptcha', () => ({
  verifyPublicCaptcha: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/services/subscriptionService', () => ({
  SubscriptionService: { createSubscription: jest.fn().mockResolvedValue({ id: 'sub1' }) },
}));
jest.mock('../src/services/emailService', () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));

const mockResolver = jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' });
jest.mock('../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: (...args: any[]) => mockResolver(...args),
}));

const asMock = (fn: any) => fn as jest.Mock;

describe('Public routes', () => {
  afterEach(async () => {
    await prisma.requestFormSubmission.deleteMany();
    jest.restoreAllMocks();
    await prisma.platformAbandonedCart.deleteMany();
    await prisma.publicSignupAttempt.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.plan.deleteMany();

    mockResolver.mockClear();
    asMock(verifyPublicCaptcha).mockResolvedValue(true);
  });

  test('GET /public/plans returns public plans', async () => {
    await prisma.plan.create({ data: { code: 'p1', billingFrequency: 'monthly', marketingName: 'P1', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] }
    } });
    await prisma.plan.create({ data: { code: 'p2', billingFrequency: 'monthly', marketingName: 'P2', marketingDescription: 'Desc', featureHighlights: [], public: false, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 500 },
        { currency: 'USD', period: 'yearly', amountInt: 5000 },
        { currency: 'INR', period: 'monthly', amountInt: 40000 },
        { currency: 'INR', period: 'yearly', amountInt: 400000 },
      ] }
    } });
    const res = await request(app).get('/public/plans');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].marketingName).toBe('P1');
    expect(res.body[0].prices.USD.monthly).toBe(1000);
  });

  test('CORS: disallowed origin should not get CORS headers', async () => {
    // Allowed is https://allowed.example; use a different origin
    const res = await request(app)
      .get('/public/plans')
      .set('Origin', 'https://not-allowed.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('CORS preflight on /public/signup allows Idempotency-Key for allowed origin', async () => {
    const res = await request(app)
      .options('/public/signup')
      .set('Origin', 'https://allowed.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, idempotency-key');

    // Preflight should succeed and allow the custom header
    expect([200, 204]).toContain(res.status); // cors may return 204 by default
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
    const acah = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(acah).toContain('idempotency-key');
  });

  test('CAPTCHA failure returns 400 on /public/request', async () => {
    asMock(verifyPublicCaptcha).mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/public/request')
      .set('X-Forwarded-For', '198.51.100.30')
      .send({ kind: 'contact', email: 'a@example.com' });
    expect(res.status).toBe(400);
  });

  test('CAPTCHA failure returns 400 on /public/signup', async () => {
    const plan = await prisma.plan.create({
      data: { code: 'p-cap', billingFrequency: 'monthly',
              marketingName: 'Pcap', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
              prices: { create: [
                { currency: 'USD', period: 'monthly', amountInt: 1000 },
                { currency: 'USD', period: 'yearly', amountInt: 10000 },
                { currency: 'INR', period: 'monthly', amountInt: 80000 },
                { currency: 'INR', period: 'yearly', amountInt: 800000 },
              ] } }
    });
    asMock(verifyPublicCaptcha).mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.33')
      .send({ companyName: 'CapFailCo', ownerEmail: 'cf@example.com', password: 'secret123', planId: plan.id });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('CAPTCHA_FAILED');
  });

  test('POST /public/request persists submission', async () => {
    const res = await request(app)
      .post('/public/request')
      .set('X-Forwarded-For', '198.51.100.31')
      .send({ kind: 'contact', email: 'a@example.com' });
    expect(res.status).toBe(202);
    const count = await prisma.requestFormSubmission.count();
    expect(count).toBe(1);
  });

  test('POST /public/request invalid payload', async () => {
    const res = await request(app)
      .post('/public/request')
      .set('X-Forwarded-For', '198.51.100.32')
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /public/signup/session upserts cart', async () => {
    const res = await request(app).post('/public/signup/session').send({ sessionId: 's1', email: 'e@example.com' });
    expect(res.status).toBe(204);
    const row = await prisma.platformAbandonedCart.findUnique({ where: { sessionId: 's1' } });
    expect(row).toBeTruthy();
  });

  test('Rate limit: sensitive limiter does not apply to /public/signup/session', async () => {
    // publicSensitiveLimiter has max=5 per 10m, but /public/signup/session should NOT use it.
    // Use a fixed IP so the counter is isolated for this test.
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/public/signup/session')
        .set('X-Forwarded-For', '203.0.113.45')
        .send({ sessionId: `s-${i}` });
      expect(res.status).toBe(204);
    }
  });

  test('POST /public/signup/session rejects malformed utm', async () => {
    const res = await request(app).post('/public/signup/session').send({ sessionId: 's2', utm: 'x' });
    expect(res.status).toBe(400);
  });

  test('/public/signup rejects non-public or inactive plan', async () => {
    const hidden = await prisma.plan.create({
      data: { code: 'p-hidden', billingFrequency: 'monthly',
              marketingName: 'Hidden', marketingDescription: 'H', featureHighlights: [], public: false, active: true,
              prices: { create: [
                { currency: 'USD', period: 'monthly', amountInt: 500 },
                { currency: 'USD', period: 'yearly', amountInt: 5000 },
                { currency: 'INR', period: 'monthly', amountInt: 40000 },
                { currency: 'INR', period: 'yearly', amountInt: 400000 },
              ] } }
    });
    const inactive = await prisma.plan.create({
      data: { code: 'p-inactive', billingFrequency: 'monthly',
              marketingName: 'Inactive', marketingDescription: 'I', featureHighlights: [], public: true, active: false,
              prices: { create: [
                { currency: 'USD', period: 'monthly', amountInt: 600 },
                { currency: 'USD', period: 'yearly', amountInt: 6000 },
                { currency: 'INR', period: 'monthly', amountInt: 48000 },
                { currency: 'INR', period: 'yearly', amountInt: 480000 },
              ] } }
    });
    const r1 = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.34')
      .send({
        companyName: 'HiddenCo', ownerEmail: 'h@example.com', password: 'secret123', planId: hidden.id
      });
    expect(r1.status).toBe(403);
    const r2 = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.34')
      .send({
        companyName: 'InactiveCo', ownerEmail: 'i@example.com', password: 'secret123', planId: inactive.id
      });
    expect(r2.status).toBe(403);
  });

  test('POST /public/signup uses platform credentials', async () => {
    const plan = await prisma.plan.create({ data: { code: 'p3', billingFrequency: 'monthly', marketingName: 'P3', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.11')
      .set('Idempotency-Key', 'key1')
      .send({ companyName: 'Acme', ownerEmail: 'owner@example.com', password: 'secret123', planId: plan.id });
    expect(res.status).toBe(201);
    expect(mockResolver).toHaveBeenCalledWith('platform');
    const tenant = await prisma.tenant.findFirst({ where: { name: 'Acme' } });
    expect(tenant).toBeTruthy();

    const retry = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.11')
      .set('Idempotency-Key', 'key1')
      .send({ companyName: 'Acme', ownerEmail: 'owner@example.com', password: 'secret123', planId: plan.id });
    expect(retry.body.idempotent).toBeTruthy();
  });

  test('POST /public/signup returns CONFIG_MISSING_PLATFORM and does not create tenant when platform creds missing', async () => {
    // Arrange a public plan and force the resolver to throw a structured error
    const plan = await prisma.plan.create({ data: { code: 'p4', billingFrequency: 'monthly', marketingName: 'P4', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    mockResolver.mockRejectedValueOnce(Object.assign(new Error('no platform config'), { code: 'CONFIG_MISSING_PLATFORM' }));

    // Act
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.12')
      .send({ companyName: 'NoPlatformCo', ownerEmail: 'np@example.com', password: 'secret123', planId: plan.id });

    // Assert
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error', 'CONFIG_MISSING_PLATFORM');
    const tenant = await prisma.tenant.findFirst({ where: { name: 'NoPlatformCo' } });
    expect(tenant).toBeNull(); // no orphan writes
  });

  test('POST /public/signup with trial disabled returns checkoutUrl', async () => {
    const plan = await prisma.plan.create({
      data: {
        code: 'p8', billingFrequency: 'monthly',
        marketingName: 'P8', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
        prices: { create: [
          { currency: 'USD', period: 'monthly', amountInt: 1000 },
          { currency: 'USD', period: 'yearly', amountInt: 10000 },
          { currency: 'INR', period: 'monthly', amountInt: 80000 },
          { currency: 'INR', period: 'yearly', amountInt: 800000 },
        ] }
      }
    });
    process.env.PUBLIC_SIGNUP_TRIAL_DISABLED = 'true';
    const spy = jest.spyOn(SubscriptionService, 'createSubscription')
      .mockResolvedValueOnce({ id: 's1', checkoutUrl: 'https://checkout.example' } as any);

    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.35')
      .set('Idempotency-Key', 'key-trial-off')
      .send({ companyName: 'NoTrialCo', ownerEmail: 'nt@example.com', password: 'secret123', planId: plan.id });
    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toBe('https://checkout.example');
    spy.mockRestore();
  });

  test('POST /public/signup cleans up tenant+user if subscription creation fails', async () => {
    // Arrange: plan OK, resolver OK, but make subscription creation fail
    const plan = await prisma.plan.create({ data: { code: 'p5', billingFrequency: 'monthly', marketingName: 'P5', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    mockResolver.mockResolvedValue({ keyId: 'k', keySecret: 's' });
    const createSubSpy = jest
      .spyOn(SubscriptionService, 'createSubscription')
      .mockRejectedValueOnce(new Error('gateway outage'));

    // Act
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.14')
      .send({ companyName: 'FlakyGatewayCo', ownerEmail: 'fg@example.com', password: 'secret123', planId: plan.id });

    // Assert
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error', 'SUBSCRIPTION_CREATE_FAILED');

    // No tenant or user should remain (cleanup successful)
    const tenant = await prisma.tenant.findFirst({ where: { name: 'FlakyGatewayCo' } });
    expect(tenant).toBeNull();
    const user = await prisma.user.findFirst({ where: { email: 'fg@example.com' } });
    expect(user).toBeNull();

    createSubSpy.mockRestore();
  });

  test('Events: request.created and abandoned_cart opened/updated are emitted', async () => {
    const spy = jest.spyOn(eventBus, 'publish');
    // request.created
    const r1 = await request(app)
      .post('/public/request')
      .set('X-Forwarded-For', '198.51.100.21')
      .send({ kind: 'contact', email: 'evt@example.com' });
    expect(r1.status).toBe(202);
    expect(spy).toHaveBeenCalledWith(PUBLIC_EVENTS.REQUEST_CREATED, expect.objectContaining({
      id: expect.any(String), kind: 'contact', email: 'evt@example.com'
    }));
    // abandoned_cart.opened
    const s0 = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.13')
      .send({ sessionId: 'sess-1', email: 'evt@example.com' });
    expect(s0.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(PUBLIC_EVENTS.ABANDONED_CART_OPENED, expect.objectContaining({
      sessionId: 'sess-1', email: 'evt@example.com'
    }));
    // abandoned_cart.updated
    const s1 = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.13')
      .send({ sessionId: 'sess-1', planId: 'plan-x' });
    expect(s1.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(PUBLIC_EVENTS.ABANDONED_CART_UPDATED, expect.objectContaining({
      sessionId: 'sess-1'
    }));
  });

  test('Events: tenant.signup_completed and user.signup_completed are emitted on /public/signup', async () => {
    const plan = await prisma.plan.create({ data: { code: 'p-evt', billingFrequency: 'monthly', marketingName: 'PEvt', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    const spy = jest.spyOn(eventBus, 'publish');
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.36')
      .send({
        companyName: 'EvtCo', ownerEmail: 'evtu@example.com', password: 'secret123', planId: plan.id
      });
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(PUBLIC_EVENTS.TENANT_SIGNUP_COMPLETED, expect.objectContaining({ tenantId: expect.any(String) }));
    expect(spy).toHaveBeenCalledWith(PUBLIC_EVENTS.USER_SIGNUP_COMPLETED, expect.objectContaining({ userId: expect.any(String), tenantId: expect.any(String) }));
  });

  test('POST /public/signup returns CREDENTIAL_SCOPE_VIOLATION if resolver indicates bad scope', async () => {
    const plan = await prisma.plan.create({ data: { code: 'p6', billingFrequency: 'monthly', marketingName: 'P6', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    mockResolver.mockRejectedValueOnce(Object.assign(new Error('bad scope'), { code: 'CREDENTIAL_SCOPE_VIOLATION' }));

    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.15')
      .send({ companyName: 'ScopeBadCo', ownerEmail: 'sb@example.com', password: 'secret123', planId: plan.id });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error', 'CREDENTIAL_SCOPE_VIOLATION');
  });

  test('POST /public/signup is idempotent by {ownerEmail, tenantCode} without Idempotency-Key', async () => {
    const plan = await prisma.plan.create({ data: { code: 'p7', billingFrequency: 'monthly', marketingName: 'P7', marketingDescription: 'Desc', featureHighlights: [], public: true, active: true,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 1000 },
        { currency: 'USD', period: 'yearly', amountInt: 10000 },
        { currency: 'INR', period: 'monthly', amountInt: 80000 },
        { currency: 'INR', period: 'yearly', amountInt: 800000 },
      ] } } });
    const payload = { companyName: 'FallbackCo', ownerEmail: 'fb@example.com', password: 'secret123', planId: plan.id };

    const first = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.16')
      .send(payload);
    expect(first.status).toBe(201);
    const firstTenant = await prisma.tenant.findFirst({ where: { name: 'FallbackCo' } });
    expect(firstTenant).toBeTruthy();

    // Retry with the same payload but still no header
    const second = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.16')
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBeTruthy();

    // Ensure we still have exactly one tenant
    const tenants = await prisma.tenant.findMany({ where: { name: 'FallbackCo' } });
    expect(tenants.length).toBe(1);
  });

  test('GET /public/verify-email/:token verifies user (token encodes tenantId + RLS context)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'VerifyCo' } });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'v@example.com',
        password: 'pass',
        name: 'V',
        role: 'ADMIN',
        verificationToken: `${tenant.id}.tok`,
        verificationTokenExpiry: new Date(Date.now() + 3600 * 1000),
        emailVerified: false,
      },
    });
    const res = await request(app).get(`/public/verify-email/${encodeURIComponent(`${tenant.id}.tok`)}`);
    expect(res.status).toBe(200);
    const updated = await prisma.user.findFirst({ where: { email: 'v@example.com' } });
    expect(updated?.emailVerified).toBe(true);
  });

  test('Rate limit: sensitive limiter triggers 429 on /public/request after 5 attempts from same IP', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app).post('/public/request').set('X-Forwarded-For', '198.51.100.9')
        .send({ kind: 'contact', email: `rl-${i}@example.com` });
      expect(ok.status).toBe(202);
    }
    const blocked = await request(app).post('/public/request').set('X-Forwarded-For', '198.51.100.9')
      .send({ kind: 'contact', email: 'rl-last@example.com' });
    expect(blocked.status).toBe(429);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});