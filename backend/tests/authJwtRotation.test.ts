import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';

describe('Auth JWT rotation', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'Rot Co', status: 'active', dedicated: false } });
    const hash = await bcrypt.hash('password', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'rot@example.com',
        password: hash,
        name: 'Rot',
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  test('refresh reuse revokes the ENTIRE family; new sibling token is rejected', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'rot@example.com', password: 'password' });
    expect(login.status).toBe(200);
    const loginCookies = login.headers['set-cookie'] ?? [];
    const cookie = (Array.isArray(loginCookies) ? loginCookies : [loginCookies])
      .map((c: string) => c.split(';')[0])
      .join('; ');
    const csrf = login.body.csrfToken;

    const first = await request(app)
      .post('/api/auth/refresh')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf);
    expect(first.status).toBe(200);
    const refreshCookies = first.headers['set-cookie'] ?? [];
    const newCookie = (Array.isArray(refreshCookies) ? refreshCookies : [refreshCookies])
      .map((c: string) => c.split(';')[0])
      .join('; ');
    const newCsrf = first.body.csrfToken;

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf);
    expect(reuse.status).toBe(401);

    const second = await request(app)
      .post('/api/auth/refresh')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', newCookie)
      .set('x-csrf-token', newCsrf);
    // With refresh-token family revocation-on-reuse, *all* tokens in the family
    // (including this freshly rotated one) are now invalid.
    expect(second.status).toBe(401);
  });
});