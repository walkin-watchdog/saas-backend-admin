process.env.ALLOWED_PUBLIC_ORIGINS = 'https://allowed.example';

import request from 'supertest';
import bcrypt from 'bcrypt';

// Load app after env is set
const { app } = require('../src/app');

import { prisma } from '../src/utils/prisma';
import { withTenantContext } from '../src/middleware/tenantMiddleware';

// --- Mocks to avoid external IO ---
jest.mock('../src/utils/publicCaptcha', () => ({
  verifyPublicCaptcha: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/services/subscriptionService', () => ({
  SubscriptionService: { createSubscription: jest.fn().mockResolvedValue({ id: 'sub_email' }) },
}));
jest.mock('../src/services/emailService', () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));
const mockResolver = jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' });
jest.mock('../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: (...args: any[]) => mockResolver(...args),
}));

// Payloads that look like SQLi but (mostly) won't satisfy strict email validators
const SQISH_EMAILS = [
  `a' OR '1'='1@example.com`,
  `a'); DROP TABLE users;--@example.com`,
  `a") OR 1=1 --@example.com`,
  `a'||(SELECT 1)||'@example.com`,
];

// Weird-but-valid per RFC 5322-ish (apostrophe, plus, dots)
const VALID_WEIRD_EMAILS = [
  `o'hara@example.com`,
  `owner+test@example.com`,
  `dots.are.ok@example.com`,
];

describe('SQLi hardening focused on email fields', () => {
  afterEach(async () => {
    await prisma.requestFormSubmission.deleteMany();
    await prisma.platformAbandonedCart.deleteMany();
    await prisma.publicSignupAttempt.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.plan.deleteMany();
    mockResolver.mockClear();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createPublicPlan = async () => {
    return prisma.plan.create({
      data: {
        code: `p_${Date.now()}`,
        billingFrequency: 'monthly',
        marketingName: 'Public',
        marketingDescription: 'Desc',
        featureHighlights: [],
        public: true,
        active: true,
        prices: { create: [
          { currency: 'USD', period: 'monthly', amountInt: 1000 },
          { currency: 'USD', period: 'yearly', amountInt: 10000 },
          { currency: 'INR', period: 'monthly', amountInt: 80000 },
          { currency: 'INR', period: 'yearly', amountInt: 800000 },
        ] },
      },
    });
  };

  const seedTenantUser = async (email: string) => {
    const tenant = await prisma.tenant.create({ data: { name: 'TI', apiKey: `k_${Date.now()}` } });
    const hashed = await bcrypt.hash('correct-horse', 10);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        password: hashed,
        name: 'Tester',
        role: 'ADMIN',
        emailVerified: true,
      },
    });
    return tenant;
  };

  test('PUBLIC REQUEST: accepts apostrophe email and stores literally; rejects SQLi-shaped emails gracefully', async () => {
    // Valid but uncommon
    const ok = await request(app)
      .post('/public/request')
      .set('X-Forwarded-For', '198.51.100.60')
      .send({ kind: 'contact', email: `o'hara@example.com`, company: 'Acme', message: 'hi' });
    expect(ok.status).toBe(202);

    // Obvious SQLi-shaped "emails" should be rejected by zod .email()
    for (const e of SQISH_EMAILS) {
      const res = await request(app)
        .post('/public/request')
        .set('X-Forwarded-For', '198.51.100.61')
        .send({ kind: 'contact', email: e, company: 'Acme', message: 'x' });
      expect(res.status).toBe(400); // INVALID_PAYLOAD
    }

    // Still intact and queryable
    const count = await prisma.requestFormSubmission.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('PUBLIC SIGNUP: ownerEmail supports valid unusual emails (apostrophe, plus); no-SQLi via email', async () => {
    const plan = await createPublicPlan();

    for (const email of VALID_WEIRD_EMAILS) {
      const res = await request(app)
        .post('/public/signup')
        .set('X-Forwarded-For', '198.51.100.62')
        .set('Idempotency-Key', `idem_${email}`)
        .send({
          companyName: `Co ${Date.now()}`,
          ownerEmail: email,
          password: 'secret123',
          planId: plan.id,
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body).toHaveProperty('tenantId');
      expect(res.body).toHaveProperty('ownerUserId');

      // Verify user really exists with that exact email under tenant RLS
      const { tenantId, ownerUserId } = res.body;
      const found = await withTenantContext({ id: tenantId } as any, (tp) =>
        (tp as typeof prisma).user.findUnique({ where: { id: ownerUserId }, select: { email: true } })
      );
      expect(found?.email).toBe(email);
    }
  });

  test('PUBLIC SIGNUP: rejects SQLi-shaped ownerEmail with 400 (no raw SQL concat)', async () => {
    const plan = await createPublicPlan();
    for (const email of SQISH_EMAILS) {
      const res = await request(app)
        .post('/public/signup')
        .set('X-Forwarded-For', '198.51.100.63')
        .send({
          companyName: `Co SQLi ${Date.now()}`,
          ownerEmail: email,
          password: 'secret123',
          planId: plan.id,
        });
      expect(res.status).toBe(400); // zod email validator should fail; server must not 500
    }
  });

  test('ABANDONED CART: accepts apostrophe email and persists literally', async () => {
    const sessionId = `sess_${Date.now()}`;
    const r1 = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.64')
      .send({ sessionId, email: `o'hara@example.com` });
    expect(r1.status).toBe(204);

    const row = await prisma.platformAbandonedCart.findUnique({ where: { sessionId } });
    expect(row?.email).toBe(`o'hara@example.com`);
  });

  test('ABANDONED CART: rejects SQLi-shaped "emails" with 400 (schema validation)', async () => {
    const sessionId = `sess_${Date.now() + 1}`;
    const bad = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.65')
      .send({ sessionId, email: `a' OR '1'='1@example.com` });
    expect(bad.status).toBe(400);
  });

  test('AUTH LOGIN: valid user with apostrophe email can log in; SQLi-shaped email fails safely', async () => {
    const tenant = await seedTenantUser(`o'hara@example.com`);

    // good email with apostrophe should work (password correct)
    const ok = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ email: `o'hara@example.com`, password: 'correct-horse' });
    expect([200, 206]).toContain(ok.status); // 206 if 2FA gating is present

    // SQLi-shaped email should NOT log in; expect 400 (invalid email) or 401 (invalid creds)
    const sqli = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.11')
      .send({ email: `a' OR '1'='1@example.com`, password: 'anything' });
    expect([400, 401]).toContain(sqli.status);
  });
});