import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { GlobalConfigService } from '../src/services/globalConfigService';
import superagent from 'superagent';

describe('Username-wide CAPTCHA/backoff across IPs', () => {
  let tenant: any;
  let user: any;
  let saPost: jest.SpyInstance;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'WideCap', status: 'active', dedicated: false } });
    const hash = await bcrypt.hash('goodpw', 10);
    user = await prisma.user.create({
      data: { tenantId: tenant.id, email: 'wide@example.com', password: hash, name: 'Wide', role: 'ADMIN' },
    });
    await GlobalConfigService.set('captcha', { provider: 'recaptcha', secretKey: 'x' }, { scope: 'global' });
  });

  beforeEach(() => {
    saPost = jest.spyOn(superagent, 'post').mockImplementation(() => {
      const req: any = { type: jest.fn().mockReturnThis(), send: jest.fn().mockResolvedValue({ body: { success: true } }) };
      return req;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    // Clean up global captcha config
    await GlobalConfigService.delete('captcha', 'global').catch(() => {});
  });

  it('requires captcha after failures *across different IPs* for the same username', async () => {
    // Three failed attempts from three different IPs (username-wide aggregation)
    const tryBad = async (ip: string) =>
      request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .set('X-Forwarded-For', ip)
        .send({ email: 'wide@example.com', password: 'wrong1' })
        .expect(401);

    await tryBad('203.0.113.10');
    await tryBad('203.0.113.11');
    await tryBad('203.0.113.12');

    // Now a correct password *without* captcha should be rejected (captcha required)
    const needsCaptcha = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .set('X-Forwarded-For', '203.0.113.20')
      .send({ email: 'wide@example.com', password: 'goodpw' });
    expect(needsCaptcha.status).toBe(400);
  });
});