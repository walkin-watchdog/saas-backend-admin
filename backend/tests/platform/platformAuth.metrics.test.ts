import request from 'supertest';
import express from 'express';
import { authenticatePlatform } from '../../src/middleware/platformAuth';
import { signPlatformAccess, signImpersonationToken } from '../../src/utils/platformJwt';

jest.mock('../../src/services/platformUserService', () => ({
  PlatformUserService: {
    findUserById: jest.fn((id: string) => ({
      id,
      email: 'p@example.com',
      status: 'active',
      ipAllowlist: [], // no IP restriction
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
    })),
  },
}));

jest.mock('../../src/services/platformSessionService', () => ({
  PlatformSessionService: {
    isActive: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/platformConfigService', () => ({
  PlatformConfigService: {
    getConfig: jest.fn().mockResolvedValue(false), // MFA not enforced at root for this test
  },
}));

jest.mock('../../src/utils/metrics', () => ({
  authFailureCounter: { inc: jest.fn() },
  hashTenantId: () => 'platform',
}));

const { authFailureCounter } = jest.requireMock('../../src/utils/metrics');

describe('authenticatePlatform', () => {
  const makeApp = () => {
    const app = express();
    app.get('/api/platform/ping', authenticatePlatform as any, (_req, res) => res.json({ ok: true }));
    return app;
  };

  beforeEach(() => jest.clearAllMocks());

  it('happy: platform access token passes', async () => {
    const token = signPlatformAccess({
      sub: 'P1',
      email: 'p@example.com',
      roles: ['admin'],
      permissions: ['*'],
    }, 'JTI1');

    const r = await request(makeApp()).get('/api/platform/ping').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(authFailureCounter.inc).not.toHaveBeenCalled();
  });

  it('sad: impersonation token rejected on platform API', async () => {
    const imp = signImpersonationToken({ sub: 'X', tenantId: 't', scope: 'read_only', reason: 't', grantId: 'g' }, 'platform-api');
    const r = await request(makeApp()).get('/api/platform/ping').set('Authorization', `Bearer ${imp}`);
    expect(r.status).toBe(401);
    expect(authFailureCounter.inc).toHaveBeenCalledWith({ tenant: 'platform' });
  });

  it('sad: missing token increments failures', async () => {
    const r = await request(makeApp()).get('/api/platform/ping');
    expect(r.status).toBe(401);
    expect(authFailureCounter.inc).toHaveBeenCalledWith({ tenant: 'platform' });
  });
});