import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { generateTOTP } from '../src/utils/totp';
import { getRedisClient } from '../src/utils/redisClient';

describe('TOTP 2FA flow', () => {
  let tenant: any;
  let user: any;
  let access: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'TwoFA', status: 'active', dedicated: false } });
    const hash = await bcrypt.hash('secret', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: '2fa@example.com',
        password: hash,
        name: 'TFA',
        role: 'ADMIN',
      },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: '2fa@example.com', password: 'secret' });
    access = login.body.access;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  test('setup and verify enables 2FA and requires token on login', async () => {
    // verify cannot proceed without reauth
    const preVerify = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token: '123456' });
    expect(preVerify.status).toBe(401);

    const setup = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ password: 'secret' });
    expect(setup.status).toBe(200);
    const client = await getRedisClient();
    if (client) {
      const ttl = await client.pTTL(`auth:reauth:${user.id}`);
      expect(ttl).toBeGreaterThan(0);
    }
    const token = generateTOTP(setup.body.secret);

    const verify = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', `Bearer ${access}`)
      .set('x-api-key', tenant.apiKey)
      .send({ token });
    expect(verify.status).toBe(200);

    if (client) {
      const ttlAfter = await client.pTTL(`auth:reauth:${user.id}`);
      expect(ttlAfter).toBeLessThanOrEqual(0);
    }

    const fail = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: '2fa@example.com', password: 'secret' });
    expect(fail.status).toBe(401);

    const ok = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email: '2fa@example.com', password: 'secret', totp: generateTOTP(setup.body.secret) });
    expect(ok.status).toBe(200);
  });
});

