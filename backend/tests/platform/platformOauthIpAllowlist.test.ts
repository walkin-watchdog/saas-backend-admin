import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import superagent from 'superagent';
import { jwtVerify } from 'jose-node-cjs-runtime';
import { AuditService } from '../../src/services/auditService';

jest.mock('jose-node-cjs-runtime', () => ({
  createRemoteJWKSet: () => jest.fn(),
  jwtVerify: jest.fn(),
}));

describe('Platform OAuth IP allowlist', () => {
  let user: any;

  beforeAll(async () => {
    await PlatformConfigService.setConfig('oauth', {
      test: {
        clientId: 'id',
        clientSecret: 'secret',
        authUrl: 'https://auth.example',
        tokenUrl: 'https://token.example',
        redirectUri: 'https://platform.example/cb',
        issuer: 'https://issuer.example',
        jwksUri: 'https://jwks.example',
      },
    });
    user = await prisma.platformUser.create({
      data: {
        email: 'sso@example.com',
        name: 'SSO User',
        status: 'active',
        ssoSubject: 'test:sub123',
        ipAllowlist: ['1.1.1.1'],
      },
    });
  });

  afterAll(async () => {
    await prisma.platformUser.delete({ where: { id: user.id } });
    await PlatformConfigService.deleteConfig('oauth');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('denies OAuth login from disallowed IP', async () => {
    jest.spyOn(superagent, 'post').mockImplementation(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { id_token: 'fake' } }),
      }),
    }) as any);

    const start = await request(app)
      .get('/api/platform/auth/oauth/test')
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    (jwtVerify as jest.Mock).mockResolvedValueOnce({
      payload: { sub: 'sub123', nonce, email: 'sso@example.com', amr: ['pwd'], iat: Math.floor(Date.now()/1000) }
    });

    const auditSpy = jest
      .spyOn(AuditService, 'log')
      .mockResolvedValue(undefined as any);

    const resp = await request(app)
      .get(`/api/platform/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie])
      .set('X-Real-IP', '5.5.5.5');

    expect(resp.status).toBe(403);
    expect(resp.text).toBe('ip_not_allowed');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId: user.id,
        action: 'platform.auth.ip_denied',
        ipAddress: '5.5.5.5',
      }),
    );
  });
});