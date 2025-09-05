process.env.ALLOWED_PUBLIC_ORIGINS = 'https://allowed.example';

import request from 'supertest';
import bcrypt from 'bcrypt';

// Load app the same way other tests do (after env is set)
const { app } = require('../src/app');

import { prisma } from '../src/utils/prisma';

// --- Mocks to avoid external IO during tests ---
jest.mock('../src/utils/publicCaptcha', () => ({
  verifyPublicCaptcha: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/services/subscriptionService', () => ({
  SubscriptionService: { createSubscription: jest.fn().mockResolvedValue({ id: 'sub_sql' }) },
}));

jest.mock('../src/services/emailService', () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));

const mockResolver = jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' });
jest.mock('../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: (...args: any[]) => mockResolver(...args),
}));

// Utility: typical SQLi strings we will try to push through various inputs
const INJECTION_STRINGS = [
  `'; DROP TABLE "users"; --`,
  `'||(SELECT 1)||'`,
  `' OR '1'='1`,
  `") OR 1=1 --`,
  `'); SELECT pg_sleep(0.01); --`,
  `'); COMMIT; --`,
  `0 OR 1=1`,
  `abc';--`,
  `🙂' OR '🙂'='🙂`,
];

describe('SQL Injection hardening (public & auth surfaces)', () => {
  afterEach(async () => {
    // Cleanup created data between tests to keep isolation
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

  const createTenantWithUser = async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'TI', apiKey: `k_${Date.now()}` },
    });
    const hashed = await bcrypt.hash('correct-horse', 10);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'tester@example.com',
        password: hashed,
        name: 'Tester',
        role: 'ADMIN',
        emailVerified: true,
      },
    });
    return tenant;
  };

  test('POST /public/request persists literal input and does not blow up on SQL-like content', async () => {
    const beforePlans = await prisma.plan.count(); // sentinel table we can check after

    for (const inj of INJECTION_STRINGS) {
      const res = await request(app)
        .post('/public/request')
        .set('X-Forwarded-For', `198.51.100.${Math.floor(Math.random() * 200)}`)
        .send({
          kind: 'contact',
          email: 'safe@example.com', // must be valid by zod
          company: `Acme ${inj}`,
          message: `Hi ${inj}`,
          utm: { src: `utm-${inj}` },
        });

      expect([202, 400]).toContain(res.status); // 400 only if payload too big/malformed, otherwise 202
      if (res.status === 202) {
        expect(res.body).toHaveProperty('id');
      }
    }

    // DB still queryable and no tables dropped
    const afterPlans = await prisma.plan.count();
    expect(afterPlans).toBe(beforePlans);
  });

  test('POST /public/signup rejects SQLi in planId (404) and does not alter schema', async () => {
    const plan = await createPublicPlan();
    const plansBefore = await prisma.plan.count();

    const evilPlanId = `${plan.id}${INJECTION_STRINGS[0]}`; // becomes a non-existent id
    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({
        companyName: `Company ${INJECTION_STRINGS[1]}`,
        ownerEmail: 'owner@example.com',
        password: 'secret123',
        planId: evilPlanId, // must NOT cause any raw SQL concatenation
        couponCode: INJECTION_STRINGS[2],
      });

    expect([404, 403]).toContain(res.status); // PLAN_NOT_FOUND or PLAN_NOT_AVAILABLE
    // Ensure schema intact
    const plansAfter = await prisma.plan.count();
    expect(plansAfter).toBe(plansBefore);
  });

  test('POST /public/signup accepts valid planId even with coupon containing SQL-like content', async () => {
    const plan = await createPublicPlan();

    const res = await request(app)
      .post('/public/signup')
      .set('X-Forwarded-For', '198.51.100.11')
      .set('Idempotency-Key', `idem_${INJECTION_STRINGS[3]}`) // header is part of idempotency lookup
      .send({
        companyName: `Acme ${INJECTION_STRINGS[4]}`,
        ownerEmail: 'safe-owner@example.com',
        password: 'secret123',
        planId: plan.id,
        couponCode: INJECTION_STRINGS[5], // should be handled as data, not SQL
      });

    expect([201, 200]).toContain(res.status);
    // A tenant should exist; injection should be stored as literal text
    const ten = await prisma.tenant.findFirst({ where: { name: { startsWith: 'Acme ' } } });
    expect(ten).toBeTruthy();

    // public_signup_attempts should also have an entry (idempotency record)
    const attempts = await prisma.publicSignupAttempt.count();
    expect(attempts).toBe(1);
  });

  test('POST /public/signup/session upserts with SQL-like sessionId safely', async () => {
    const sessionId = `sess_${INJECTION_STRINGS[6]}`;

    const r1 = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.12')
      .send({ sessionId, email: 'cart@example.com', utm: { c: `x${INJECTION_STRINGS[7]}` } });
    expect(r1.status).toBe(204);

    const r2 = await request(app)
      .post('/public/signup/session')
      .set('X-Forwarded-For', '198.51.100.12')
      .send({ sessionId, planId: `plan_${INJECTION_STRINGS[8]}` });
    expect(r2.status).toBe(204);

    const row = await prisma.platformAbandonedCart.findUnique({ where: { sessionId } });
    expect(row).toBeTruthy();
    expect(row?.email).toBe('cart@example.com');
  });

  test('GET /public/verify-email/:token refuses malformed tokens with SQL-like content', async () => {
    // malformed format (<tenantId>.<opaque> required)
    const badTokens = [
      INJECTION_STRINGS[0],
      `${INJECTION_STRINGS[1]}.${INJECTION_STRINGS[2]}`,
      'no-dot-token',
    ];

    for (const t of badTokens) {
      const res = await request(app).get(`/public/verify-email/${encodeURIComponent(t)}`);
      expect([400, 404]).toContain(res.status); // INVALID_TOKEN
    }
  });

  test('GET /public/verify-email/:token only verifies intended user (no mass update)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'VerifyInc' } });
    // User A: real token
    const tokenA = `${tenant.id}.tokA`;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'a@example.com',
        password: 'x',
        name: 'A',
        role: 'ADMIN',
        emailVerified: false,
        verificationToken: tokenA,
        verificationTokenExpiry: new Date(Date.now() + 60_000),
      },
    });
    // User B: should remain unverified
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'b@example.com',
        password: 'x',
        name: 'B',
        role: 'ADMIN',
        emailVerified: false,
        verificationToken: `${tenant.id}.tokB`,
        verificationTokenExpiry: new Date(Date.now() + 60_000),
      },
    });

    const ok = await request(app).get(`/public/verify-email/${encodeURIComponent(tokenA)}`);
    expect(ok.status).toBe(200);

    const A = await prisma.user.findFirst({ where: { email: 'a@example.com' } });
    const B = await prisma.user.findFirst({ where: { email: 'b@example.com' } });
    expect(A?.emailVerified).toBe(true);
    expect(B?.emailVerified).toBe(false);
  });

  test('POST /api/auth/login does not allow SQL-like passwords to bypass auth', async () => {
    const tenant = await createTenantWithUser();

    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.200')
      .send({
        email: 'tester@example.com',
        password: `' OR '1'='1`, // classic SQLi attempt
      });

    // Must be invalid credentials, not a crash or success
    expect([401, 400]).toContain(res.status);
  });

  test('POST /api/auth/login with valid creds still works after prior SQL-like attempts', async () => {
    const tenant = await createTenantWithUser();

    // prior "attack"
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.201')
      .send({ email: 'tester@example.com', password: INJECTION_STRINGS[0] });

    // legit login
    const ok = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.202')
      .send({ email: 'tester@example.com', password: 'correct-horse' });

    expect([200, 206]).toContain(ok.status); // some flows may trigger 2FA/pending; main point is "not compromised"
  });

  test('POST /public/signup rate-limited path still safe with SQL-like spam inputs', async () => {
    const plan = await createPublicPlan();
    // push several attempts with varying IPs to avoid RL blocking this test entirely
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/public/signup')
        .set('X-Forwarded-For', `198.51.100.${50 + i}`)
        .set('Idempotency-Key', `idem_${i}${INJECTION_STRINGS[i % INJECTION_STRINGS.length]}`)
        .send({
          companyName: `SpamCo ${INJECTION_STRINGS[i % INJECTION_STRINGS.length]}`,
          ownerEmail: `owner${i}@example.com`,
          password: 'secret123',
          planId: plan.id,
          couponCode: INJECTION_STRINGS[(i + 1) % INJECTION_STRINGS.length],
        });
      expect([201, 200]).toContain(res.status);
    }
    // tenants exist; nothing blew up
    const tcount = await prisma.tenant.count();
    expect(tcount).toBeGreaterThanOrEqual(5);
  });
});