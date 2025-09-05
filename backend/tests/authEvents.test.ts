// tests/authEvents.test.ts
import request from 'supertest';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { app } from '../src/app';
import { eventBus, AUTH_EVENTS } from '../src/utils/eventBus';
import { prisma, withAdminRls, disconnectAllPrisma } from '../src/utils/prisma';

describe('Auth auditing events', () => {
  const email = 'a@co.com';     // must pass zod email()
  const goodPass = 'goodpass';  // >= 6 chars
  const badPass = 'wrongpw';    // >= 6 chars

  let tenant: { id: string; apiKey: string };
  let user: { id: string };

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'AuditCo', status: 'active' },
      select: { id: true, apiKey: true },
    });

    const passwordHash = await bcrypt.hash(goodPass, 10);
    await withAdminRls(async (tx) => {
      user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          password: passwordHash,
          name: 'A',
          role: UserRole.ADMIN,
        },
        select: { id: true },
      });
    });
  });

  afterAll(async () => {
    await withAdminRls(async (tx) => {
      await tx.user.deleteMany({ where: { tenantId: tenant.id } });
      await tx.tenantDomain.deleteMany({ where: { tenantId: tenant.id } });
      await tx.tenant.delete({ where: { id: tenant.id } });
    });
    await disconnectAllPrisma();
  });

  it('publishes login_failed and starts backoff at threshold (429 + Retry-After); no lockout event yet', async () => {
    const spy = jest.spyOn(eventBus, 'publish');

    // First 4 failures -> 401
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', tenant.apiKey)
        .send({ email, password: badPass })
        .expect(401);
    }

    // 5th failure now triggers backoff -> 429 + Retry-After (not a hard lock)
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', tenant.apiKey)
      .send({ email, password: badPass })
      .expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

    // Events during failure + lockout
    expect(spy).toHaveBeenCalledWith(
      AUTH_EVENTS.LOGIN_FAILED,
      expect.objectContaining({ tenantId: tenant.id, userId: user.id })
    );
    // No hard lock yet → no LOCKOUT_ENGAGED at this stage
    expect(spy).not.toHaveBeenCalledWith(
      AUTH_EVENTS.LOCKOUT_ENGAGED,
      expect.anything()
    );
    spy.mockRestore();
  });
});