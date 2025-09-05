import request from 'supertest';
import express from 'express';
import { authenticate, AuthRequest } from '../../src/middleware/auth';
import { requestId } from '../../src/middleware/requestId';
import { signAccess } from '../../src/utils/jwt';

const mockPrisma = {
  user: {
    findUnique: jest.fn(({ where }: any) =>
      where.id === 'U1'
        ? Promise.resolve({ id: 'U1', email: 'u@example.com', role: 'ADMIN', tokenVersion: 0, platformAdmin: false })
        : Promise.resolve(null)
    ),
  },
};

jest.mock('../../src/middleware/tenantMiddleware', () => ({
  getTenantId: jest.fn(() => 't-1234'),
  getTenantPrisma: jest.fn(() => mockPrisma),
}));

jest.mock('../../src/utils/metrics', () => ({
  authFailureCounter: { inc: jest.fn() },
  authLockoutCounter: { inc: jest.fn() },
  hashTenantId: () => 'abcd1234',
}));

const { authFailureCounter } = jest.requireMock('../../src/utils/metrics');
const { getTenantPrisma } = jest.requireMock('../../src/middleware/tenantMiddleware');

describe('authenticate metrics + ALS userId', () => {
  const makeApp = () => {
    const app = express();
    app.use(requestId);
    app.get('/protected', authenticate, (req: AuthRequest, res) => {
      // pick up ALS via requestContext through logger logic; expose minimally for test
      res.json({ userId: req.user?.id });
    });
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy: valid token sets user and does not increment failures', async () => {
    const token = signAccess({ sub: 'U1', tenantId: 't-1234', tokenVersion: 0, role: 'ADMIN' });
    const r = await request(makeApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.userId).toBe('U1');
    expect(authFailureCounter.inc).not.toHaveBeenCalled();
    // also ensures prisma was queried
    expect(getTenantPrisma().user.findUnique).toHaveBeenCalled();
  });

  it('sad: missing token increments failure counter', async () => {
    const r = await request(makeApp()).get('/protected');
    expect(r.status).toBe(401);
    expect(authFailureCounter.inc).toHaveBeenCalledWith({ tenant: 'abcd1234' });
  });

  it('sad: cross-tenant mismatch increments failure', async () => {
    const token = signAccess({ sub: 'U1', tenantId: 'other-tenant', tokenVersion: 0, role: 'ADMIN' });
    const r = await request(makeApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(403);
    expect(authFailureCounter.inc).toHaveBeenCalledWith({ tenant: 'abcd1234' });
  });

  it('sad: invalid tokenVersion increments failure', async () => {
    const token = signAccess({ sub: 'U1', tenantId: 't-1234', tokenVersion: 2, role: 'ADMIN' });
    const r = await request(makeApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
    expect(authFailureCounter.inc).toHaveBeenCalledWith({ tenant: 'abcd1234' });
  });
});