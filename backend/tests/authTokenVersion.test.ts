// tests/authTokenVersion.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signRefresh } from '../src/utils/jwt';

describe('tokenVersion invalidation', () => {
  let tenant: any, user: any;

  beforeAll(async () => {
    // Create a tenant and a user (password hash not needed since we won't call /login)
    tenant = await prisma.tenant.create({ data: { name: 'TokV', status: 'active' } });
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: 'tv@co', password: 'x', name: 'tv', role: 'EDITOR' },
    });
  });

  afterAll(async () => {
  });

  it('refresh fails after tokenVersion bump', async () => {
    // Craft a refresh token using the CURRENT tokenVersion (0 by default)
    const csrf = 'tokv-csrf';
    const rt = signRefresh(
      {
        sub: user.id,
        tenantId: tenant.id,
        role: 'EDITOR',
        tokenVersion: 0, // matches initial DB value
        platformAdmin: false,
      },
      'tokv-jti-1'
    );

    // Bump tokenVersion to simulate password reset / 2FA enable etc.
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } }, // now 1 in DB
    });

    // Call refresh with the old refresh cookie + matching CSRF header/cookie.
    // Resolve tenant via x-api-key so the middleware sets req.tenantId properly.
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [`rt=${rt}`, `csrf=${csrf}`])
      .set('x-csrf-token', csrf)
      .send({}); // no captcha needed (auto-passes when not configured)

    // The handler returns 401 (no JSON body) on token_version_mismatch
    expect(res.status).toBe(401);
  });
});