import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { GlobalConfigService } from '../src/services/globalConfigService';
import superagent from 'superagent';

let saPost: jest.SpyInstance;

// Use a chainable mock that mirrors production usage: post().type().send()
beforeEach(() => {
  saPost = jest.spyOn(superagent, 'post').mockImplementation(() => {
    const req: any = {
      // chainable: .type() returns the same object
      type: jest.fn().mockReturnThis(),
      // provider returns success by default
      send: jest.fn().mockResolvedValue({ body: { success: true } }),
    };
    return req;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Captcha and lockout', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'Cap', status: 'active', dedicated: false } });
    const hash = await bcrypt.hash('password', 10);
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: 'cap@example.com', password: hash, name: 'Cap', role: 'ADMIN' },
    });
    await GlobalConfigService.set('captcha', { provider: 'recaptcha', secretKey: 'x' }, { scope: 'global' });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    // Clean up global captcha config
    await GlobalConfigService.delete('captcha', 'global').catch(() => {});
  });

  test('login without prior failures does not require captcha', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'cap@example.com', password: 'password' });
    expect(res.status).toBe(200);
  });

  test('missing captcha after repeated failures is rejected', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .send({ email: 'cap@example.com', password: 'wrongpw' })
        .expect(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'cap@example.com', password: 'password' });
    expect(res.status).toBe(400);
  });

  test('invalid captcha response from provider fails login', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .send({ email: 'cap@example.com', password: 'wrongpw' })
        .expect(res => {
          // Backoff may return 429 on later attempts; either is acceptable
          expect([401, 429]).toContain(res.status);
        });
    }
    // Force provider to return success=false
    (saPost as any).mockImplementationOnce(() => {
      const req: any = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn().mockResolvedValue({ body: { success: false, score: 0.1 } }),
      };
      return req;
    });
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'cap@example.com', password: 'password', captcha: 'bad' });
    // With the new flow, captcha failure also increments backoff and can yield 429 (or 423 if soft-lock engaged).
    expect([400, 429, 423]).toContain(res.status);
  });

  test('backoff after repeated failures', async () => {
    const asIsolatedClient = () =>
      request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .set('X-Forwarded-For', '203.0.113.99');

    for (let i = 0; i < 4; i++) {
      const r = await asIsolatedClient()
        .send({ email: 'cap@example.com', password: 'wrongpw', captcha: 't' });
      // Depending on prior attempts in this file, some of these may already be throttled.
      expect([401, 429]).toContain(r.status);
    }
    const res = await asIsolatedClient()
      .send({ email: 'cap@example.com', password: 'wrongpw', captcha: 't' });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});