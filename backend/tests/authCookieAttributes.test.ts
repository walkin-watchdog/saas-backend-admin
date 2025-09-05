// tests/authCookieAttributes.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signRefresh } from '../src/utils/jwt';

describe('Refresh cookie attributes', () => {
  let tenant: any, user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'CookieCo', status: 'active' } });
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: 'c@co', password: 'x', name: 'c', role: 'EDITOR' },
    });
  });

  afterAll(async () => {
  });

  it('Set-Cookie has secure attributes', async () => {
    const csrf = 'cookieco-csrf';
    const rt = signRefresh(
      {
        sub: user.id,
        tenantId: tenant.id,
        role: 'EDITOR',
        tokenVersion: 0,
        platformAdmin: false,
      },
      'cookieco-jti-1'
    );

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('x-api-key', tenant.apiKey)
      .set('x-forwarded-proto', 'https') // force Secure attribute
      .set('Cookie', [`rt=${rt}`, `csrf=${csrf}`])
      .set('x-csrf-token', csrf)
      .send({});

    expect(res.status).toBe(200);

    // ---- FIX: normalize the header to string[] ----
    const raw = res.headers['set-cookie'] as undefined | string | string[];
    const setCookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const refreshCookie = setCookies.find((c) => c.startsWith('rt='));
    expect(refreshCookie).toBeTruthy();

    const cookie = String(refreshCookie);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });
});