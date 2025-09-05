import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { PlatformConfigService } from '../src/services/platformConfigService';
import superagent from 'superagent';
import { EncryptionService } from '../src/utils/encryption';
import { generateTOTP } from '../src/utils/totp';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { withTenantContext } from '../src/middleware/tenantMiddleware';
import { generateKeyPairSync, KeyObject } from 'crypto';

jest.mock('../src/services/emailService', () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('jose-node-cjs-runtime', () => {
  const actual = jest.requireActual('jose');
  return {
    ...actual,
    // Return a GetKeyFunction that hands back our in-memory public key
    createRemoteJWKSet: () => {
      return async () => (global as any).__TEST_PUBLIC_KEY__;
    },
  };
});

let saPost: jest.SpyInstance;
let saGet: jest.SpyInstance;
let jwk: any;
let privateKey: KeyObject;

describe('OAuth providers', () => {
  let tenant: any;
  const sign = (payload: any, opts: SignOptions = {}) =>
    jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      audience: 'id',
      issuer: 'https://issuer.example',
      expiresIn: '5m',
      keyid: jwk.kid,
      ...opts,
    });

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'OAuth', status: 'active', dedicated: false } });
    // Generate RSA keypair for RS256 signing and publish public key via JWKS
    const { publicKey, privateKey: pk } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pk;
    (global as any).__TEST_PUBLIC_KEY__ = publicKey;
    // Export public key as JWK; add kid/alg like a real IdP JWKS
    jwk = publicKey.export({ format: 'jwk' }) as any;
    jwk.kid = 'test-key';
    jwk.alg = 'RS256';
    await PlatformConfigService.setConfig('oauth', {
      test: {
        clientId: 'id',
        clientSecret: 'secret',
        authUrl: 'https://auth.example',
        tokenUrl: 'https://token.example',
        userInfoUrl: 'https://me.example',
        redirectUri: 'https://app.example/cb',
        issuer: 'https://issuer.example',
        jwksUri: 'https://jwks.example',
      },
    }, undefined, { scope: 'platform' });
  });

  // Establish default chainable mocks per test to avoid leakage between tests
  beforeEach(() => {
    // jose fetches the JWKS itself via global fetch (not superagent).
    // Provide a minimal fetch mock that serves our test JWKS.
    (global as any).fetch = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.href;
      if (url === 'https://jwks.example') {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ keys: [jwk] }),
          text: async () => JSON.stringify({ keys: [jwk] }),
          arrayBuffer: async () =>
            new TextEncoder().encode(JSON.stringify({ keys: [jwk] })).buffer,
        } as any;
      }
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
        text: async () => '{}',
        arrayBuffer: async () => new ArrayBuffer(0),
      } as any;
    });
    saPost = jest.spyOn(superagent, 'post').mockImplementation((..._args: any[]) => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov' } } as any),
      }),
    }) as any);
    saGet = jest.spyOn(superagent, 'get').mockImplementation((...args: any[]) => {
      const url = args[0] as string;
      // userInfo call is chained with .set(...).send() not used, so return a chainable object
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email: 'oauth@example.com', name: 'OAuth' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any) as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    // Clean up platform OAuth config
    await PlatformConfigService.deleteConfig('oauth', 'platform').catch(() => {});
  });

  test('completes OAuth flow', async () => {
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    expect(start.status).toBe(302);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    expect(start.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(start.headers['set-cookie'][1]).toContain('SameSite=Lax');
    expect(start.headers['set-cookie'][2]).toContain('SameSite=Lax');
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];
    expect(stateCookie.startsWith('oauth_state_test=')).toBe(true);
    expect(nonceCookie.startsWith('oauth_nonce_test=')).toBe(true);
    expect(verifierCookie.startsWith('oauth_verifier_test=')).toBe(true);
    expect(nonce).toBeTruthy();

    const idToken = sign({ nonce, amr: ['pwd'], email_verified: true });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(200);
    expect(cb.body.user.email).toBe('oauth@example.com');
    expect(cb.body.access).toBeDefined();
  });
  test('rejects id_token with wrong issuer', async () => {
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];
    const badToken = sign({ nonce, amr: ['pwd'] }, {
      issuer: 'https://evil.example',
    });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: badToken } } as any),
      }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(400);
    expect(cb.text).toBe('invalid_id_token');
  });
  test('rejects id_token issued in the future', async () => {
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];
    const future = Math.floor(Date.now() / 1000) + 600;
    const badToken = jwt.sign(
      { nonce, amr: ['pwd'], iat: future, exp: future + 300 },
      privateKey,
      {
        algorithm: 'RS256',
        audience: 'id',
        issuer: 'https://issuer.example',
        keyid: jwk.kid,
        noTimestamp: true,
      },
    );
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: badToken } } as any),
      }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(400);
    expect(cb.text).toBe('invalid_id_token');
  });
  test('rejects when id_token present but nonce cookie is missing', async () => {
    // Start flow
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    // Intentionally do NOT send nonce cookie
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    // Force token endpoint to return an id_token with the correct nonce
    const idToken = sign({ nonce, amr: ['pwd'] });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      // Omit nonce cookie on purpose; send state + verifier only
      .set('Cookie', [stateCookie, verifierCookie]);
    expect(cb.status).toBe(400);
    expect(cb.text).toBe('invalid_nonce');
  });

  test('server-side nonce store blocks replay (second callback with same nonce ⇒ 400)', async () => {
    // Start flow to get cookies (state, nonce, verifier)
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    expect(start.status).toBe(302);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    // First callback succeeds
    const idToken1 = sign({ nonce, amr: ['pwd'], email_verified: true });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken1 } } as any),
      }),
    }));
    const ok = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(ok.status).toBe(200);

    // Second callback attempt *replays* the same nonce/state → server-side store should reject
    const idToken2 = sign({ nonce, amr: ['pwd'], email_verified: true });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken2 } } as any),
      }),
    }));
    const replay = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(replay.status).toBe(400);
    expect(replay.text).toBe('invalid_nonce');
  });

  test('requires local TOTP when user has 2FA and id_token does not prove MFA', async () => {
    // Create user with 2FA
    const email = 'mfa-gated@example.com';
    const secret = 'JBSWY3DPEHPK3PXP'; // sample base32
    const enc = EncryptionService.encrypt(secret);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        password: 'x',
        name: 'Gate',
        role: 'ADMIN',
        twoFaEnabled: true,
        twoFaSecret: enc,
      },
    });
    // Adjust mock so userInfo returns this user
    (saGet as any).mockImplementation((url: string) => {
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email, name: 'Gate' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any);
    });

    // Start
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    // Token endpoint returns id_token with same nonce but no MFA in amr/acr
    const idToken = sign({ nonce, amr: ['pwd'] });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Accept', 'application/json')
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(401);
    expect(cb.body.error).toBe('2fa_required');
    const setCookie = cb.headers['set-cookie'] as string[] | string | undefined;
    const cookiesArr = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
    const oauthPending = cookiesArr.find((c) => c.startsWith('oauth_pending='));
    const oauthCsrf = cookiesArr.find((c) => c.startsWith('oauth_csrf='));
    if (!oauthPending || !oauthCsrf) {
      throw new Error('Expected oauth_pending and oauth_csrf cookies to be set');
    }
    expect(oauthPending).toBeTruthy();
    expect(oauthCsrf).toBeTruthy();
    const pendingCookie = oauthPending.split(';')[0];
    const csrfCookie = oauthCsrf.split(';')[0];
    const csrfValue = csrfCookie.split('=')[1];

    // Complete with TOTP
    const complete = await request(app)
      .post('/api/auth/oauth/test/complete')
      .set('x-api-key', tenant.apiKey)
      .set('x-csrf-token', csrfValue)
      .set('Cookie', [pendingCookie, csrfCookie])
      .send({ totp: generateTOTP(secret) });
    expect(complete.status).toBe(200);
    expect(complete.body.access).toBeDefined();
    expect(complete.body.user.email).toBe(email);
  });

  test('accepts provider MFA (amr contains mfa) and issues tokens directly', async () => {
    const email = 'mfa-direct@example.com';
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        password: 'x',
        name: 'Direct',
        role: 'ADMIN',
        twoFaEnabled: true,
      },
    });
    // userInfo returns this user
    (saGet as any).mockImplementation((url: string) => {
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email, name: 'Direct' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any);
    });
    // Start
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];
    // Token with amr = ['mfa']
    const idToken = sign({ nonce, amr: ['mfa'] });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(200);
    expect(cb.body.user.email).toBe(email);
    expect(cb.body.access).toBeDefined();
  });
  test('rejects when OAuth callback has mismatched state', async () => {
    // Start flow to get cookies
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    // Tamper state
    const badState = 'evilstate';

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${badState}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);

    expect(cb.status).toBe(400);
    expect(cb.text).toBe('invalid_state');
  });

  test('rejects when provider returns error=access_denied on callback', async () => {
    // Start flow to get cookies
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    // Use the real state value so we exercise the error branch specifically
    const realState = /state=([^&]+)/.exec(start.headers.location)![1];

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?error=access_denied&state=${realState}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie]);

    expect(cb.status).toBe(400);
    expect(cb.text).toBe('access_denied');
  });

  test('rejects when id_token nonce mismatches cookie', async () => {
    // Start
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];

    // Force token endpoint to return an id_token with WRONG nonce
    const idToken = sign({ nonce: 'WRONG_NONCE', amr: ['pwd'] });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(400);
    expect(cb.text).toBe('invalid_nonce');
  });

  test('token exchange failure surfaces as an error response (non-200)', async () => {
    // Start
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    // Next POST to token endpoint rejects
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({ send: () => Promise.reject(new Error('provider_down')) }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, verifierCookie]);
    expect([400, 502, 500]).toContain(cb.status);
  });

  test('blocks brand-new OAuth user if IdP does not set email_verified=true (EMAIL_NOT_VERIFIED)', async () => {
    // Make userInfo return a unique email we know does not exist yet
    const email = 'jit-block@example.com';
    (saGet as any).mockImplementation((url: string) => {
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email, name: 'JIT Block' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any);
    });

    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    // Intentionally omit email_verified to simulate IdP not asserting it
    const idToken = sign({ nonce, amr: ['pwd'] });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any),
      }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(403);
    expect(cb.body.error).toBe('EMAIL_NOT_VERIFIED');

    // User should now exist but be unverified
    // const row = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    const row = await withTenantContext({ id: tenant.id } as any, (tp) =>
      (tp as typeof prisma).user.findFirst({ where: { email } })
    );
    expect(row).toBeTruthy();
    expect((row as any)?.emailVerified).toBe(false);
  });

  test('JIT signup requires id_token by default; without id_token ⇒ JIT_DISABLED_FOR_PROVIDER', async () => {
    // Make userInfo return a unique email we know does not exist yet
    const email = 'jit-no-idtoken@example.com';
    (saGet as any).mockImplementation((url: string) => {
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email, name: 'No IDToken' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any);
    });

    // Start OAuth
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];

    // No id_token returned from token endpoint (default beforeEach mock already does this)
    // Ensure our next token POST uses the default (access_token only)
    saPost.mockRestore();
    saPost = jest.spyOn(superagent, 'post').mockImplementation((..._args: any[]) => ({
      type: () => ({
        send: () => Promise.resolve({ body: { access_token: 'prov' } } as any),
      }),
    }) as any);

    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, verifierCookie]);
    expect(cb.status).toBe(403);
    expect(cb.body.error).toBe('JIT_DISABLED_FOR_PROVIDER');

    // And no user should have been created
    const row = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    expect(row).toBeNull();
  });

  test('blocks OAuth login for an existing but unverified user (EMAIL_NOT_VERIFIED)', async () => {
    const email = 'existing-unverified@example.com';
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        password: 'x',
        name: 'Unverified',
        role: 'ADMIN',
        emailVerified: false,
      },
    });
    // userInfo returns this existing user
    (saGet as any).mockImplementation((url: string) => {
      if (url === 'https://me.example') {
        return { set: () => Promise.resolve({ body: { email, name: 'Unverified' } } as any) } as any;
      }
      return Promise.resolve({ body: { keys: [jwk] } } as any);
    });

    // Start OAuth
    const start = await request(app)
      .get('/api/auth/oauth/test')
      .set('x-api-key', tenant.apiKey)
      .redirects(0);
    const stateCookie = start.headers['set-cookie'][0].split(';')[0];
    const nonceCookie = start.headers['set-cookie'][1].split(';')[0];
    const verifierCookie = start.headers['set-cookie'][2].split(';')[0];
    const state = /state=([^&]+)/.exec(start.headers.location)![1];
    const nonce = /nonce=([^&]+)/.exec(start.headers.location)![1];

    // id_token present (so flow is "happy path"), but user remains unverified locally
    const idToken = sign({ nonce, amr: ['pwd'], email_verified: true });
    (saPost as any).mockImplementationOnce(() => ({
      type: () => ({ send: () => Promise.resolve({ body: { access_token: 'prov', id_token: idToken } } as any) }),
    }));
    const cb = await request(app)
      .get(`/api/auth/oauth/test/callback?code=abc&state=${state}`)
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [stateCookie, nonceCookie, verifierCookie]);
    expect(cb.status).toBe(403);
    expect(cb.body.error).toBe('EMAIL_NOT_VERIFIED');
  });
});