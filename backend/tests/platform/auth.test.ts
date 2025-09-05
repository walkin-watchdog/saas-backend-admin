import request from 'supertest';
import { app } from '../../src/app';
import express from 'express';
import cookieParser from 'cookie-parser';
import platformAuthRoutes from '../../src/routes/platform/auth';
import { prisma } from '../../src/utils/prisma';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import { PlatformUserService } from '../../src/services/platformUserService';
import { AuditService } from '../../src/services/auditService';
import { EncryptionService } from '../../src/utils/encryption';
import { generateTOTP } from '../../src/utils/totp';
import { signPlatformRefresh } from '../../src/utils/platformJwt';
import superagent from 'superagent';
import { jwtVerify } from 'jose-node-cjs-runtime';

// Helper: normalize Set-Cookie header to an array (Supertest/Node can return string or string[])
function getSetCookieArray(h: string | string[] | undefined): string[] {
  if (Array.isArray(h)) return h;
  if (typeof h === 'string') return [h];
  return [];
}

// Helper: decode JWT payload without verification (safe for test assertions)
function decodeJwtPayload<T = any>(token: string): T {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

function cookieVal(cookies: string[], name: string) {
  const raw = cookies.find(c => c.startsWith(`${name}=`));
  return raw?.split(';')[0].split('=')[1];
}

// Helper: unique IP generator to avoid rate limiter bleed across tests
let __ipCounter = 10;
function nextIp(): string {
  __ipCounter += 1;
  return `198.51.100.${__ipCounter}`;
}

// Mock external dependencies
jest.mock('../../src/services/emailService', () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('jose-node-cjs-runtime', () => ({
  createRemoteJWKSet: () => jest.fn(),
  jwtVerify: jest.fn(),
}));

describe('Platform Authentication & Authorization', () => {
  let platformUser: any;
  let userWithMfa: any;
  let userWithIpAllowlist: any;
  let adminRole: any;
  let viewerRole: any;

  beforeAll(async () => {
    // Create platform roles
    adminRole = await prisma.platformRole.create({
      data: {
        code: 'platform_admin',
        name: 'Platform Admin',
        description: 'Full platform access'
      }
    });

    viewerRole = await prisma.platformRole.create({
      data: {
        code: 'platform_viewer',
        name: 'Platform Viewer', 
        description: 'Read-only platform access'
      }
    });

    // Create permissions
    const readPerm = await prisma.platformPermission.create({
      data: { code: 'platform.read', description: 'Read platform data' }
    });

    const writePerm = await prisma.platformPermission.create({
      data: { code: 'platform.write', description: 'Write platform data' }
    });

    // Needed by /api/platform/metrics/dashboard
    const metricsPerm = await prisma.platformPermission.create({
      data: { code: 'metrics.read', description: 'Read metrics' }
    });

    // Assign permissions to roles
    await prisma.platformRolePermission.createMany({
      data: [
        { platformRoleId: adminRole.id, permissionId: readPerm.id },
        { platformRoleId: adminRole.id, permissionId: writePerm.id },
        // Allow admin to access metrics dashboard during maintenance-mode bypass test
        { platformRoleId: adminRole.id, permissionId: metricsPerm.id },
        { platformRoleId: viewerRole.id, permissionId: readPerm.id }
      ]
    });

    // Create test users
    const passwordHash = await PlatformUserService.hashPassword('password123');

    platformUser = await prisma.platformUser.create({
      data: {
        email: 'admin@platform.test',
        name: 'Platform Admin',
        passwordHash,
        status: 'active'
      }
    });

    userWithMfa = await prisma.platformUser.create({
      data: {
        email: 'mfa@platform.test',
        name: 'MFA User',
        passwordHash,
        status: 'active',
        mfaEnabled: true,
        twoFaSecret: EncryptionService.encrypt('JBSWY3DPEHPK3PXP')
      }
    });

    userWithIpAllowlist = await prisma.platformUser.create({
      data: {
        email: 'restricted@platform.test',
        name: 'IP Restricted User',
        passwordHash,
        status: 'active',
        ipAllowlist: ['127.0.0.1', '192.168.1.0/24', '2001:db8::/32']
      }
    });

    // Assign roles
    await prisma.platformUserRole.createMany({
      data: [
        { platformUserId: platformUser.id, platformRoleId: adminRole.id },
        { platformUserId: userWithMfa.id, platformRoleId: adminRole.id },
        { platformUserId: userWithIpAllowlist.id, platformRoleId: viewerRole.id }
      ]
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
    await prisma.platformSession.deleteMany();
  });

  describe('Happy Paths', () => {
    test('successful email/password login returns platform JWT with correct claims', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const res = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('access');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('admin@platform.test');

      // Check cookie flags
      const cookies = getSetCookieArray(res.headers['set-cookie']);
      const refreshCookie = cookies.find(c => c.startsWith('platform_rt='));
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('SameSite=Strict');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId: platformUser.id,
          action: 'platform.auth.login_success'
        })
      );

      auditSpy.mockRestore();
    });

    test('access token contains expected base claims', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      const token = res.body.access as string;
      const payload = decodeJwtPayload(token) as {
        sub: string;
        email: string;
        roles: string[];
        permissions: string[];
        iss: string;
        aud: string;
      };

      expect(payload.sub).toBeTruthy();
      expect(payload.email).toBe('admin@platform.test');
      expect(Array.isArray(payload.roles)).toBe(true);
      expect(payload.roles).toContain('platform_admin');
      expect(payload.permissions).toEqual(expect.arrayContaining(['platform.read'])); // minimal, avoids brittle coupling
    });

    test('refresh flow works and returns new tokens', async () => {
      // First login to get refresh token
      const loginRes = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      const cookies = getSetCookieArray(loginRes.headers['set-cookie']);
      const refreshCookie = cookies.find(c => c.startsWith('platform_rt='))?.split(';')[0];
      const csrfCookie = cookies.find(c => c.startsWith('platform_csrf='))?.split(';')[0];
      const csrfValue = csrfCookie?.split('=')[1];

      // Use refresh token
      const refreshRes = await request(app)
        .post('/api/platform/auth/refresh')
        .set('Cookie', [refreshCookie!, csrfCookie!])
        .set('x-csrf-token', csrfValue!);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('access');
      expect(refreshRes.body).toHaveProperty('csrfToken');
    });

    test('TOTP-enabled user requires valid MFA code', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'mfa@platform.test',
          password: 'password123',
          mfaCode: generateTOTP('JBSWY3DPEHPK3PXP')
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('access');
    });

    test('IP allowlist permits requests from allowed IPs', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '127.0.0.1')
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(200);
    });

    test('session revocation invalidates refresh token', async () => {
      // Login and get session
      const loginRes = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'admin@platform.test', 
          password: 'password123'
        });

      const token = loginRes.body.access;
      const cookies = getSetCookieArray(loginRes.headers['set-cookie']);
      const refreshCookie = cookies.find(c => c.startsWith('platform_rt='))?.split(';')[0];
      const csrfCookie = cookies.find(c => c.startsWith('platform_csrf='))?.split(';')[0];
      const csrfValue = csrfCookie?.split('=')[1];

      // Revoke all sessions
      const revokeRes = await request(app)
        .post('/api/platform/auth/revoke-sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(revokeRes.status).toBe(204);

      // Try to refresh - should fail
      const refreshRes = await request(app)
        .post('/api/platform/auth/refresh')
        .set('Cookie', [refreshCookie!, csrfCookie!])
        .set('x-csrf-token', csrfValue!);

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('Sad Paths', () => {
    test('invalid credentials return 401', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'admin@platform.test',
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    test('TOTP required but missing/invalid returns 401', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .send({
          email: 'mfa@platform.test',
          password: 'password123',
          mfaCode: '000000' // invalid code
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid MFA code');
    });

    test('IP not in allowlist returns 403', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '10.0.0.1') // not in allowlist
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied from this IP address');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.auth.ip_denied',
          ipAddress: '10.0.0.1'
        })
      );

      auditSpy.mockRestore();
    });

    test('IP allowlist permits IPv6 address inside allowed range', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '2001:db8::1') // inside 2001:db8::/32
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });
      expect(res.status).toBe(200);
    });

    test('IP allowlist denies IPv6 outside allowed range', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '2001:db9::1') // outside 2001:db8::/32
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied from this IP address');
    });

    test('IP allowlist permits IPv4 address via CIDR range', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '192.168.1.42') // inside 192.168.1.0/24
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });
      expect(res.status).toBe(200);
    });

    test('X-Forwarded-For is honored when X-Real-IP absent', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        // No X-Real-IP
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          email: 'restricted@platform.test',
          password: 'password123'
        });
      expect(res.status).toBe(200);
    });

    test('missing authentication returns 401', async () => {
      const res = await request(app)
        .get('/api/platform/metrics/dashboard');

      expect(res.status).toBe(401);
    });

    test('insufficient permissions return 403', async () => {
      // Create token for viewer role
      // Login as viewer to obtain a real session-backed token
      const viewerLogin = await request(app)
        .post('/api/platform/auth/login')
        .send({ email: 'restricted@platform.test', password: 'password123' });
      const token = viewerLogin.body.access;

      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          name: 'Test User'
        });

      expect(res.status).toBe(403);
    });

    test('rate limiting triggers 429 with Retry-After header', async () => {
      // Exhaust rate limit for platform auth
      const promises: Array<request.Test> = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          request(app)
            .post('/api/platform/auth/login')
            .set('X-Real-IP', '203.0.113.100')
            .send({
              email: 'nonexistent@platform.com',
              password: 'wrongpw'
            })
        );
      }

      await Promise.all(promises);

      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '203.0.113.100')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });

    test('rate limiting is IP-scoped across different users', async () => {
      const ip = '198.51.100.77';
      // Hit the limit with bogus user
      for (let i = 0; i < 21; i++) {
        // 20 is the typical window; 21 ensures we trip it without being too slow
        await request(app)
          .post('/api/platform/auth/login')
          .set('X-Real-IP', ip)
          .send({ email: `nope${i}@example.com`, password: 'wrongpw' });
      }
      // Now try a valid user from the SAME IP — expect throttled
      const throttled = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', ip)
        .send({ email: 'admin@platform.test', password: 'password123' });
      expect(throttled.status).toBe(429);
      expect(throttled.headers['retry-after']).toBeDefined();

      // Different IP should not be throttled
      const ok = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '198.51.100.88')
        .send({ email: 'admin@platform.test', password: 'password123' });
      expect(ok.status).toBe(200);
    });

    test('refresh limiter keys on userId+IP: other user at same IP is not throttled', async () => {
      // Bypass the global /api/platform/auth IP limiter by using a minimal app
      // that mounts only the platform auth routes. This lets us exercise ONLY
      // the per-user+IP refresh limiter on the refresh endpoint.
      const local = express();
      local.set('trust proxy', 2);
      local.use(cookieParser());
      local.use('/api/platform/auth', platformAuthRoutes);
      const ip = '198.51.100.200';

      // Mint refresh tokens for two different users (so limiter key differs by sub)
      const rtA = signPlatformRefresh({
        sub: platformUser.id,
        email: 'admin@platform.test',
        roles: ['platform_admin'],
        permissions: ['platform.read', 'platform.write']
      });
      const rtB = signPlatformRefresh({
        sub: userWithMfa.id,
        email: 'mfa@platform.test',
        roles: ['platform_admin'],
        permissions: ['platform.read', 'platform.write']
      });

      // Saturate limit for User A @ the same IP (platformRefreshLimiter max=60/min)
      for (let i = 0; i < 61; i++) {
        await request(local)
          .post('/api/platform/auth/refresh')
          .set('X-Real-IP', ip)
          .set('Cookie', [`platform_rt=${rtA}`, 'platform_csrf=test'])
          .set('x-csrf-token', 'test');
      }

      // User A should now be throttled
      const aThrottled = await request(local)
        .post('/api/platform/auth/refresh')
        .set('X-Real-IP', ip)
        .set('Cookie', [`platform_rt=${rtA}`, 'platform_csrf=test'])
        .set('x-csrf-token', 'test');
      expect(aThrottled.status).toBe(429);

      // Same IP, different user (different sub) should NOT be throttled
      const bResponse = await request(local)
        .post('/api/platform/auth/refresh')
        .set('X-Real-IP', ip)
        .set('Cookie', [`platform_rt=${rtB}`, 'platform_csrf=test'])
        .set('x-csrf-token', 'test');
      expect(bResponse.status).not.toBe(429); // could be 200 or 403 (CSRF), but not rate-limited
    });

    test('refresh with bad origin returns 403', async () => {
      const token = signPlatformRefresh({
        sub: platformUser.id,
        email: 'admin@platform.test',
        roles: ['platform_admin'],
        permissions: ['platform.read', 'platform.write']
      });

      const res = await request(app)
        .post('/api/platform/auth/refresh')
        .set('Origin', 'https://evil.example.com')
        .set('Cookie', [`platform_rt=${token}`, 'platform_csrf=test'])
        .set('x-csrf-token', 'test');

      expect(res.status).toBe(403);
    });

    test('refresh with CSRF mismatch returns 403', async () => {
      const token = signPlatformRefresh({
        sub: platformUser.id,
        email: 'admin@platform.test',
        roles: ['platform_admin'],
        permissions: ['platform.read', 'platform.write']
      });

      const res = await request(app)
        .post('/api/platform/auth/refresh')
        .set('Cookie', [`platform_rt=${token}`, 'platform_csrf=correct'])
        .set('x-csrf-token', 'wrong');

      expect(res.status).toBe(403);
    });

    test('maintenance mode blocks non-platform routes', async () => {
      // Enable maintenance mode
      await PlatformConfigService.setMaintenanceMode(true, {
        message: 'Platform is under maintenance'
      });

      // Non-platform route should be blocked
      const res = await request(app)
        .get('/api/about');

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Service temporarily unavailable');

      // Disable maintenance mode
      await PlatformConfigService.setMaintenanceMode(false);
    });

    test('platform routes bypass maintenance mode', async () => {
      // Enable maintenance mode
      // Get a real access token
      const adminLogin = await request(app)
        .post('/api/platform/auth/login')
        .send({ email: 'admin@platform.test', password: 'password123' });
      const token = adminLogin.body.access;
      
      // Enable maintenance mode
      await PlatformConfigService.setMaintenanceMode(true);

      // Platform route should work
      const res = await request(app)
        .get('/api/platform/metrics/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      // Disable maintenance mode
      await PlatformConfigService.setMaintenanceMode(false);
    });
  });

  describe('OIDC Integration', () => {
    test('OIDC start returns client error when provider not configured', async () => {
      // Temporarily make oauth config missing for platform scope
      const spy = jest.spyOn(PlatformConfigService, 'getConfig').mockResolvedValueOnce(null as any);
      const res = await request(app).get('/api/platform/auth/oauth/google');
      // Implementation may return 400 or 404; accept either to avoid brittleness
      expect([400, 404]).toContain(res.status);
      spy.mockRestore();
    });
    beforeEach(() => {
      // Mock OIDC configuration
      jest.spyOn(PlatformConfigService, 'getConfig').mockImplementation(async (key, scope) => {
        if (key === 'oauth' && scope === 'platform') {
          return {
            google: {
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              authUrl: 'https://accounts.google.com/oauth/authorize',
              tokenUrl: 'https://oauth2.googleapis.com/token',
              redirectUri: 'https://platform.test/oauth/callback',
              issuer: 'https://accounts.google.com',
              jwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
            }
          };
        }
        return null;
      });
    });

    test('successful OIDC login creates session and audit event', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      // 1) Start the flow to seed server-side state/nonce
      const start = await request(app).get('/api/platform/auth/oauth/google');
      expect(start.status).toBe(302);
      const startCookies = getSetCookieArray(start.headers['set-cookie']);
      const state = new URL(start.headers.location).searchParams.get('state')!;
      const nonce = cookieVal(startCookies, 'oauth_nonce_google')!;
      const cookieJar = startCookies.map(c => c.split(';')[0]); // name=value only

      // Mock token exchange
      jest.spyOn(superagent, 'post').mockImplementation(() => ({
        type: () => ({
          send: () => Promise.resolve({
            body: { id_token: 'mock-id-token', access_token: 'mock-access' }
          })
        })
      }) as any);

      // Mock ID token verification
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: 'google-sub-123',
          email: 'admin@platform.test',
          iat: Math.floor(Date.now() / 1000),
          nonce, // must match what start set
          amr: ['pwd']
        }
      });

      // Mock user existence
      jest.spyOn(PlatformUserService, 'findUserBySsoSubject')
        .mockResolvedValue(platformUser);

      const res = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=test-code&state=${state}`)
        .set('Cookie', cookieJar);

      expect(res.status).toBe(302); // redirect on success
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId: platformUser.id,
          action: 'platform.auth.login_success'
        })
      );

      auditSpy.mockRestore();
    });

    test('OIDC nonce replay is rejected', async () => {
      // Start the flow
      const start = await request(app).get('/api/platform/auth/oauth/google');
      expect(start.status).toBe(302);
      const startCookies = getSetCookieArray(start.headers['set-cookie']);
      const state = new URL(start.headers.location).searchParams.get('state')!;
      const nonce = cookieVal(startCookies, 'oauth_nonce_google')!;
      const cookieJar = startCookies.map(c => c.split(';')[0]);

      // Mock token exchange
      jest.spyOn(superagent, 'post').mockImplementation(() => ({
        type: () => ({
          send: () => Promise.resolve({
            body: { id_token: 'mock-id-token', access_token: 'mock-access' }
          })
        })
      }) as any);

      // First callback succeeds
      (jwtVerify as jest.Mock).mockResolvedValueOnce({
        payload: {
          sub: 'google-sub-123',
          email: 'admin@platform.test',
          iat: Math.floor(Date.now() / 1000),
          nonce,
          amr: ['pwd']
        }
      });
      jest.spyOn(PlatformUserService, 'findUserBySsoSubject').mockResolvedValueOnce(platformUser);
      const ok = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=test-code&state=${state}`)
        .set('Cookie', cookieJar);
      expect(ok.status).toBe(302);

      // Re-using same nonce/state should now fail
      (jwtVerify as jest.Mock).mockResolvedValueOnce({
        payload: {
          sub: 'google-sub-123',
          email: 'admin@platform.test',
          iat: Math.floor(Date.now() / 1000),
          nonce,
          amr: ['pwd']
        }
      });
      const replay = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=test-code&state=${state}`)
        .set('Cookie', cookieJar);
      expect(replay.status).toBe(400);
      // Different builds use either specific or generic error text; accept either
      expect(['invalid_nonce', 'oauth_error']).toContain(replay.text);
    });

    test('invalid state parameter returns 400', async () => {
      const res = await request(app)
        .get('/api/platform/auth/oauth/google/callback?code=test-code&state=wrong-state')
        .set('Cookie', ['oauth_state_google=correct-state'])
        .set('X-Real-IP', nextIp());

      expect(res.status).toBe(400);
      expect(res.text).toBe('invalid_state');
    });

    test('wrong issuer in ID token returns 400', async () => {
      const ip = nextIp();
      const start = await request(app).get('/api/platform/auth/oauth/google').set('X-Real-IP', ip);
      expect(start.status).toBe(302);
      const startCookies = getSetCookieArray(start.headers['set-cookie']);
      const state = new URL(start.headers.location!, 'https://platform.test').searchParams.get('state')!;
      const cookieJar = startCookies.map(c => c.split(';')[0]);
      jest.spyOn(superagent, 'post').mockImplementation(() => ({
        type: () => ({
          send: () => Promise.resolve({
            body: { id_token: 'mock-token', access_token: 'mock-access' }
          })
        })
      }) as any);

      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid issuer'));

      const res = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=test-code&state=${state}`)
        .set('Cookie', cookieJar)
        .set('X-Real-IP', ip);

      expect(res.status).toBe(400);
      expect(res.text).toBe('oauth_error');
    });
    test('wrong audience in ID token returns 400 oauth_error', async () => {
      const ip = nextIp();
      const start = await request(app).get('/api/platform/auth/oauth/google').set('X-Real-IP', ip);
      expect(start.status).toBe(302);
      const cookieJar = getSetCookieArray(start.headers['set-cookie']).map(c => c.split(';')[0]);
      const state = new URL(start.headers.location!, 'https://platform.test').searchParams.get('state')!;
      jest.spyOn(superagent, 'post').mockImplementation(() => ({
        type: () => ({ send: () => Promise.resolve({ body: { id_token: 'mock', access_token: 'x' } }) })
      }) as any);
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('audience mismatch'));
      const res = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=c&state=${state}`)
        .set('Cookie', cookieJar)
        .set('X-Real-IP', ip);
      expect(res.status).toBe(400);
      expect(res.text).toBe('oauth_error');
    });

    test('expired ID token returns 400 oauth_error', async () => {
      const ip = nextIp();
      const start = await request(app).get('/api/platform/auth/oauth/google').set('X-Real-IP', ip);
      expect(start.status).toBe(302);
      const cookieJar = getSetCookieArray(start.headers['set-cookie']).map(c => c.split(';')[0]);
      const state = new URL(start.headers.location!, 'https://platform.test').searchParams.get('state')!;
      jest.spyOn(superagent, 'post').mockImplementation(() => ({
        type: () => ({ send: () => Promise.resolve({ body: { id_token: 'mock', access_token: 'x' } }) })
      }) as any);
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('JWT expired'));
      const res = await request(app)
        .get(`/api/platform/auth/oauth/google/callback?code=c&state=${state}`)
        .set('Cookie', cookieJar)
        .set('X-Real-IP', ip);
      expect(res.status).toBe(400);
      expect(res.text).toBe('oauth_error');
    });
  });

  describe('MFA Flows', () => {
    test('recovery code works once and rotates codes', async () => {
      const ip = nextIp();
      const initialCodes = ['code1', 'code2', 'code3'];
      const hashedCodes = await Promise.all(
        initialCodes.map(code => PlatformUserService.hashPassword(code))
      );

      await prisma.platformUser.update({
        where: { id: userWithMfa.id },
        data: { twoFaRecoveryCodes: hashedCodes }
      });

      // First use of recovery code
      const res1 = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', ip)
        .send({
          email: 'mfa@platform.test',
          password: 'password123',
          recoveryCode: 'code1'
        });

      expect(res1.status).toBe(200);

      // Verify code was removed
      const updatedUser = await prisma.platformUser.findUnique({
        where: { id: userWithMfa.id },
        select: { twoFaRecoveryCodes: true }
      });

      expect(updatedUser?.twoFaRecoveryCodes).toHaveLength(2);

      // Try to reuse same recovery code
      const res2 = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', ip)
        .send({
          email: 'mfa@platform.test',
          password: 'password123',
          recoveryCode: 'code1'
        });

      expect(res2.status).toBe(401);
    });
  });

  describe('Security Headers and Cookies', () => {
    test('refresh cookie has proper security attributes', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        .set('X-Real-IP', '127.0.0.2')
        .set('X-Forwarded-Proto', 'https')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(200);

      const cookies = getSetCookieArray(res.headers['set-cookie']);
      const refreshCookie = cookies.find(c => c.startsWith('platform_rt='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Secure');
      expect(refreshCookie).toContain('SameSite=Strict');
      expect(refreshCookie).toContain('Path=/');
    });

    test('refresh cookie omits Secure when request is not over HTTPS', async () => {
      const res = await request(app)
        .post('/api/platform/auth/login')
        // Intentionally DO NOT set X-Forwarded-Proto to https
        .set('X-Real-IP', '127.0.0.3')
        .send({
          email: 'admin@platform.test',
          password: 'password123'
        });

      expect(res.status).toBe(200);

      const cookies = getSetCookieArray(res.headers['set-cookie']);
      const refreshCookie = cookies.find(c => c.startsWith('platform_rt='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      // Some environments always mark Secure; only assert NOT present when server respects proto
      // Your app adds Secure only if req.secure or X-Forwarded-Proto === 'https'
      expect(refreshCookie!.includes('Secure')).toBe(false);
      expect(refreshCookie).toContain('SameSite=Strict');
      expect(refreshCookie).toContain('Path=/');
    });
  });
});