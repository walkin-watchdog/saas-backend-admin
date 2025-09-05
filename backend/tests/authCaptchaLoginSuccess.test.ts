import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { GlobalConfigService } from '../src/services/globalConfigService';
import superagent from 'superagent';

describe('Captcha login success (isolated)', () => {
  test('login succeeds when captcha provider says success and sets refresh cookie', async () => {
    // Arrange: create isolated tenant + user
    const okTenant = await prisma.tenant.create({
      data: { name: 'Cap-OK', status: 'active', dedicated: false },
    });
    await GlobalConfigService.set('captcha', {
      provider: 'recaptcha',
      secretKey: 'x',
    }, { scope: 'global' });
    const okHash = await bcrypt.hash('password', 10);
    const okUser = await prisma.user.create({
      data: {
        tenantId: okTenant.id,
        email: 'cap-ok@example.com',
        password: okHash,
        name: 'Cap OK',
        role: 'ADMIN',
      },
    });

    // Chainable mock: post().type().send()
    const saPost = jest.spyOn(superagent, 'post').mockImplementation(() => {
      const req: any = {
        type: jest.fn().mockReturnThis(),
        send: jest.fn().mockResolvedValue({ body: { success: true, score: 0.9 } }),
      };
      return req;
    });

    try {
      // Trigger captcha requirement
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('x-api-key', okTenant.apiKey)
          .send({ email: 'cap-ok@example.com', password: 'wrongpw' })
          .expect(res => {
            // Backoff may return 429 on later attempts; either is acceptable
            expect([401, 429]).toContain(res.status);
          });
      }
      // Act with valid captcha
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-api-key', okTenant.apiKey)
        .send({ email: 'cap-ok@example.com', password: 'password', captcha: 'ok' });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body?.access).toBeTruthy();
      const raw = res.headers['set-cookie'] as undefined | string | string[];
      const setCookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      expect(setCookies.some((c) => c.includes('rt='))).toBe(true);
      expect(saPost).toHaveBeenCalled();
    } finally {
      // Cleanup
      saPost.mockRestore();
      await prisma.user.delete({ where: { id: okUser.id } });
      await prisma.tenant.delete({ where: { id: okTenant.id } });
    }
  });
});

afterAll(async () => {
  // Clean up global captcha config
  await GlobalConfigService.delete('captcha', 'global').catch(() => {});
});