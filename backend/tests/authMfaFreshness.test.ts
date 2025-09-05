import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { generateTOTP } from '../src/utils/totp';

describe('MFA freshness (step-up auth) for sensitive actions', () => {
  let tenant: any;
  let user: any;
  let access: string;
  let secret: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'MFA Fresh', status: 'active', dedicated: false } });
    const hash = await bcrypt.hash('oldpw1', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'fresh@example.com',
        password: hash,
        name: 'Fresh',
        role: 'ADMIN',
      },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'fresh@example.com', password: 'oldpw1' });
    expect(login.status).toBe(200);
    access = login.body.access;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});    
  });

  it('requires reauth; then allows change-password after /2fa/reauth', async () => {
    // Enable 2FA for the user first (setup → verify)
    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ password: 'oldpw1' });
    expect(setup.status).toBe(200);
    secret = setup.body.secret;
    const verify = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token: generateTOTP(secret) });
    expect(verify.status).toBe(200);

    // Because enabling 2FA bumps tokenVersion in the server,
    // the original access token is now invalid. Log in again with TOTP
    // to get a fresh access token for subsequent calls.
    const relog = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'fresh@example.com', password: 'oldpw1', totp: generateTOTP(secret) });
    expect(relog.status).toBe(200);
    access = relog.body.access;

    // The sensitive action should still be BLOCKED (needs step-up reauth)
    const nowBlocked = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ currentPassword: 'oldpw1', newPassword: 'newpw1' });
    expect(nowBlocked.status).toBe(401);
    expect(nowBlocked.body?.error).toBe('mfa_freshness_required');

    // Step-up reauth marks freshness again
    const reauth = await request(app)
      .post('/api/auth/2fa/reauth')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ totp: generateTOTP(secret) });
    expect(reauth.status).toBe(200);

    // Now the sensitive action succeeds
    const ok = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ currentPassword: 'oldpw1', newPassword: 'newpw1' });
    expect(ok.status).toBe(200);

    // And login with new password works (still requires TOTP since 2FA is enabled)
    const relog2 = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: 'fresh@example.com', password: 'newpw1', totp: generateTOTP(secret) });
    expect(relog.status).toBe(200);
  });
});