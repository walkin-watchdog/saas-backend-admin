import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import superagent from 'superagent';
import { app } from '../src/app';
import { TenantConfigService } from '../src/services/tenantConfigService';

// Make captcha verification always succeed so we only exercise lockout logic
let saPost: jest.SpyInstance;
beforeEach(() => {
  saPost = jest
    .spyOn(superagent, 'post')
    .mockResolvedValue({ body: { success: true } } as any);
});
afterEach(() => jest.restoreAllMocks());

describe('Auth lockout — mixed failures', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    // If your implementation supports overriding the lockout TTL via env,
    // set a short TTL so the test completes quickly. Safe no-op if unused.
    process.env.AUTH_LOCKOUT_TTL_MS = process.env.AUTH_LOCKOUT_TTL_MS || '2000';

    tenant = await prisma.tenant.create({
      data: { name: 'LockoutTTL', status: 'active', dedicated: false },
    });
    const hash = await bcrypt.hash('testpass', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'ttl@example.com',
        password: hash,
        name: 'TTL',
        role: 'ADMIN',
        twoFaEnabled: true, // enable to allow "wrong TOTP" attempts too
      },
    });
    await TenantConfigService.createConfig(tenant.id, 'captcha', {
      provider: 'recaptcha',
      secretKey: 'x',
    } as any);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  });

  test('mixed failures trigger backoff with increasing Retry-After', async () => {
    // 4 failures below threshold
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .send({ email: 'ttl@example.com', password: 'wrongpw', captcha: 'ok' })
        .expect(401);
    }
    // Next attempt should now be locked
    const fifth = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'ttl@example.com', password: 'wrongpw', captcha: 'ok' });
    expect(fifth.status).toBe(429);
    const ra1 = Number(fifth.headers['retry-after']);
    expect(ra1).toBeGreaterThan(0);
    // 6th failure increases backoff
    const sixth = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'ttl@example.com', password: 'wrongpw', captcha: 'ok' });
    expect(sixth.status).toBe(429);
    const ra2 = Number(sixth.headers['retry-after']);
    expect(ra2).toBeGreaterThan(ra1);
  });

  test('successful login resets failure counter to avoid immediate re-lock', async () => {
    const hash = await bcrypt.hash('testpass2', 10);
    const resetUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'reset@example.com',
        password: hash,
        name: 'Reset',
        role: 'ADMIN',
      },
    });

    // Use a distinct IP so the route-level rate limiter doesn't combine counts with the previous test
    const asClient = () =>
      request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .set('X-Forwarded-For', '203.0.113.42'); // trusted by express when proxy is enabled

    // 4 bad attempts (below backoff threshold)
    for (let i = 0; i < 4; i++) {
      await asClient()
        .send({ email: 'reset@example.com', password: 'wrongpw', captcha: 'ok' })
        .expect(401);
    }

    // success clears counters
    await asClient()
      .send({ email: 'reset@example.com', password: 'testpass2', captcha: 'ok' })
      .expect(200);

    // next wrong attempt should be a plain 401 (not 423), proving counters reset
    const res = await asClient()
      .send({ email: 'reset@example.com', password: 'wrongpw', captcha: 'ok' });
    expect(res.status).toBe(401);
    expect(res.headers['retry-after']).toBeUndefined();

    // cleanup
    await prisma.user.delete({ where: { id: resetUser.id } }).catch(() => {});
  });
});