/**
 * Tests for /api/auth/refresh security hardening:
 * - Origin/Referer check
 * - Double-submit CSRF
 * - Blacklist rejection
 * - Rate limiting
 * - Happy path (Origin allowed)
 * - Happy path (Referer allowed, Origin missing)
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Set allowed origins BEFORE importing the router (module reads env at import time)
process.env.FRONTEND_URL = 'http://good.test';
process.env.ADMIN_URL = 'http://admin.test';
process.env.ALLOWED_ORIGINS = 'http://good.test,http://admin.test';

import authRoutes from '../src/routes/auth';
import * as captcha from '../src/utils/captcha';
import * as jwt from '../src/utils/jwt';
import * as blacklist from '../src/utils/blacklist';
import { logger } from '../src/utils/logger';

// Mock TenantConfig-dependent captcha as always-ok for these tests
jest.mock('../src/utils/captcha', () => ({
  verifyCaptcha: jest.fn().mockResolvedValue(true),
}));

// Mock UserService so refresh can pass user/tokenVersion checks on green paths
jest.mock('../src/services/userService', () => ({
  UserService: {
    findUserById: jest.fn().mockResolvedValue({ id: 'U1', tokenVersion: 0 }),
  },
}));

// We'll spy and override per test where needed
jest.spyOn(jwt, 'verifyRefresh');
jest.spyOn(blacklist, 'isBlacklisted').mockResolvedValue(false);
jest.spyOn(blacklist, 'addToBlacklist').mockResolvedValue(undefined as any);

// If your jwt.sign* functions require env secrets, mock them to deterministic values
// (keeps tests hermetic and avoids env coupling)
const spySignAccess = jest.spyOn(jwt as any, 'signAccess' as any).mockReturnValue('ACCESS_TOKEN');
const spySignRefresh = jest.spyOn(jwt as any, 'signRefresh' as any).mockReturnValue('REFRESH_TOKEN');

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Inject a test tenant (bypasses full resolveTenant middleware)
  app.use((req, _res, next) => {
    (req as any).tenantId = 'T1';
    next();
  });

  // Mount only the auth routes under the same path as production
  app.use('/api/auth', authRoutes);

  return app;
}

describe('POST /api/auth/refresh security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // restore signers in case a test changed them
    spySignAccess.mockReturnValue('ACCESS_TOKEN');
    spySignRefresh.mockReturnValue('REFRESH_TOKEN');
    (blacklist.isBlacklisted as jest.Mock).mockResolvedValue(false);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
    jest.spyOn(logger, 'info').mockImplementation(() => logger as any);
  });

  afterEach(() => {
    (logger.warn as unknown as jest.SpyInstance).mockRestore();
    (logger.info as unknown as jest.SpyInstance).mockRestore();
  });

  test('denies with 403 when Origin is not allowed and logs auth.refresh_denied', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://evil.test') // not in allowed list
      .send({});

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_denied',
      expect.objectContaining({
        tenantId: 'T1',
        reason: 'bad_origin',
        origin: 'http://evil.test',
      })
    );
  });

  test('denies with 403 on CSRF mismatch and logs auth.refresh_failed (csrf_mismatch)', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://good.test') // allowed
      .set('x-csrf-token', 'wrong') // header != cookie
      .set('Cookie', ['csrf=expected'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_failed',
      expect.objectContaining({
        tenantId: 'T1',
        reason: 'csrf_mismatch',
      })
    );
  });

  test('rejects with 401 when jti is blacklisted and logs auth.refresh_rejected_blacklisted', async () => {
    const app = makeApp();

    // Arrange a valid refresh cookie & CSRF
    const payload = {
      sub: 'U1',
      tenantId: 'T1',
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false,
      jti: 'J1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    } as any;

    (jwt.verifyRefresh as jest.Mock).mockReturnValue(payload);
    (blacklist.isBlacklisted as jest.Mock).mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://good.test')
      .set('x-csrf-token', 'abc')
      .set('Cookie', ['csrf=abc', 'rt=dummy']) // value is irrelevant because we mock verifyRefresh
      .send({ captcha: 'ok' });

    expect(res.status).toBe(401);
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh_rejected_blacklisted',
      expect.objectContaining({
        tenantId: 'T1',
        userId: 'U1',
        jti: 'J1',
        reason: 'jti_blacklisted',
      })
    );
  });

  // test('rate limits after 12 requests/min and logs auth.refresh_rate_limited', async () => {
  //   const app = makeApp();

  //   // Use same key each time (no cookies, so limiter keys to tenantId:ip)
  //   for (let i = 0; i < 12; i++) {
  //     // These will likely 403 due to missing CSRF, but still increment the limiter counter.
  //     // eslint-disable-next-line no-await-in-loop
  //     await request(app).post('/api/auth/refresh').send({});
  //   }

  //   // 13th call should hit the limiter handler (429)
  //   const lastRes = await request(app).post('/api/auth/refresh').send({});

  //   expect(lastRes.status).toBe(429);
  //   expect(lastRes.body).toEqual({ error: 'Too many refresh attempts' });
  //   expect(logger.warn).toHaveBeenCalledWith(
  //     'auth.refresh_rate_limited',
  //     expect.objectContaining({
  //       tenantId: 'T1',
  //       path: '/api/auth/refresh',
  //     })
  //   );
  // });

  test('rate limits after the configured requests/min and logs auth.refresh_rate_limited', async () => {
    const app = makeApp();
    // Prime 1 request to read headers
    let res = await request(app).post('/api/auth/refresh').send({});
    const limit = parseInt(String(res.headers['ratelimit-limit'] ?? '60'), 10);
    let remaining = parseInt(String(res.headers['ratelimit-remaining'] ?? (limit - 1)), 10);

    // Burn through the remaining allowance
    while (remaining > 0) {
      // eslint-disable-next-line no-await-in-loop
      res = await request(app).post('/api/auth/refresh').send({});
      remaining = parseInt(String(res.headers['ratelimit-remaining'] ?? '0'), 10);
    }

    // Next call should hit the limiter handler (429)
    const lastRes = await request(app).post('/api/auth/refresh').send({});
    expect(lastRes.status).toBe(429);
    expect(lastRes.body).toEqual({ error: 'Too many refresh attempts' });
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_rate_limited',
      expect.objectContaining({ tenantId: 'T1', path: '/api/auth/refresh' })
    );
  });

  //
  // NEW: Happy-path test (Origin allowed)
  //
  test('succeeds with allowed Origin, matching CSRF + valid rt, returns access and logs auth.refresh_success', async () => {
    const app = makeApp();

    const payload = {
      sub: 'U1',
      tenantId: 'T1',
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false,
      jti: 'OLDJTI',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    } as any;

    (jwt.verifyRefresh as jest.Mock).mockReturnValue(payload);
    (blacklist.isBlacklisted as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://good.test')
      .set('x-csrf-token', 'abc')
      .set('Cookie', ['csrf=abc', 'rt=validRefresh'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(200);
    // access token present (we stub to ACCESS_TOKEN)
    expect(res.body).toHaveProperty('access', 'ACCESS_TOKEN');
    // CSRF token rotated and present
    expect(res.body).toHaveProperty('csrfToken');
    // success log with expected shape
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh_success',
      expect.objectContaining({
        tenantId: 'T1',
        userId: 'U1',
        // jti will be new; we don't assert exact value
      })
    );
  });

  //
  // NEW: Referer fallback test (no Origin, allowed Referer)
  //
  test('succeeds when Origin is missing but Referer is allowed (fallback branch) and logs auth.refresh_success', async () => {
    const app = makeApp();

    const payload = {
      sub: 'U1',
      tenantId: 'T1',
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false,
      jti: 'OLDJTI',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    } as any;

    (jwt.verifyRefresh as jest.Mock).mockReturnValue(payload);
    (blacklist.isBlacklisted as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/refresh')
      // No Origin header on purpose
      .set('Referer', 'http://good.test/some/path?q=1')
      .set('x-csrf-token', 'xyz')
      .set('Cookie', ['csrf=xyz', 'rt=validRefresh'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access', 'ACCESS_TOKEN');
    expect(res.body).toHaveProperty('csrfToken');
    expect(logger.info).toHaveBeenCalledWith(
      'auth.refresh_success',
      expect.objectContaining({
        tenantId: 'T1',
        userId: 'U1',
      })
    );
  });
  
  //
  // NEW: 403 when Origin missing and Referer host NOT allowed
  //
  test('denies with 403 when Origin missing and Referer not in allowlist (bad_referer)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      // No Origin header
      .set('Referer', 'http://evil.test/page')
      .set('x-csrf-token', 't')
      .set('Cookie', ['csrf=t', 'rt=dummy'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_denied',
      expect.objectContaining({
        tenantId: 'T1',
        reason: 'bad_referer',
        referer: 'http://evil.test/page',
      })
    );
  });

  //
  // NEW: 403 when Referer is malformed (URL parse throws)
  //
  test('denies with 403 when Referer header is malformed (malformed_referer)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      // No Origin, intentionally malformed Referer
      .set('Referer', ':::::/not-a-url')
      .set('x-csrf-token', 't')
      .set('Cookie', ['csrf=t', 'rt=dummy'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_denied',
      expect.objectContaining({
        tenantId: 'T1',
        reason: 'malformed_referer',
      })
    );
  });

  //
  // NEW: 403 when CSRF header present but cookie missing (double-submit failure)
  //
  test('denies with 403 when CSRF header is present but csrf cookie is missing', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://good.test') // allowed
      .set('x-csrf-token', 'only-header') // no matching cookie
      .set('Cookie', ['rt=dummy'])
      .send({ captcha: 'ok' });

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.refresh_failed',
      expect.objectContaining({ tenantId: 'T1', reason: 'csrf_mismatch' })
    );
  });
});