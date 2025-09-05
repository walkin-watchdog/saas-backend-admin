// tests/authLoginCookieFlags.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';

describe('Login sets secure refresh cookie attributes', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'LoginCookie', status: 'active', dedicated: false },
    });
    // No CAPTCHA config on purpose → verifyCaptcha() returns true for this tenant
    const hash = await bcrypt.hash('password', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'cookie@login.test',
        password: hash,
        name: 'LC',
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {}); 
  });

  it('Set-Cookie on /login has secure flags for rt', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      // Force `secure` cookie via the same logic used in your code:
      // req.secure || x-forwarded-proto === 'https' || NODE_ENV === 'production'
      .set('x-forwarded-proto', 'https')
      .send({ email: 'cookie@login.test', password: 'password' });

    expect(res.status).toBe(200);

    const raw = res.headers['set-cookie'] as undefined | string | string[];
    const setCookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const rtCookie = setCookies.find((c) => c.startsWith('rt='));
    expect(rtCookie).toBeTruthy();

    const cookie = String(rtCookie);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });
});