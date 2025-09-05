import express from 'express';
import crypto from 'crypto';
import superagent from 'superagent';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { UserRole } from '../../utils/jwt';
import { TenantRequest, withTenantContext, getTenantPrisma } from '../../middleware/tenantMiddleware';
import { PlatformConfigService } from '../../services/platformConfigService';
import { UserService } from '../../services/userService';
import { signAccess, signRefresh } from '../../utils/jwt';
import { EncryptionService } from '../../utils/encryption';
import { verifyTOTP } from '../../utils/totp';
import { getRedisClient } from '../../utils/redisClient';
import { EmailService } from '../../services/emailService';
import { createRemoteJWKSet, jwtVerify } from 'jose-node-cjs-runtime';

const router = express.Router();
const NONCE_TTL_MS = 10 * 60 * 1000;
// ID token "too-old iat" window:
// Default is **disabled** (Infinity) to avoid breaking existing providers.
// Tenants can enable by setting OAUTH_ID_TOKEN_MAX_AGE_SEC to a positive number.
const _parsedMaxAge = Number(process.env.OAUTH_ID_TOKEN_MAX_AGE_SEC);
const ID_TOKEN_MAX_AGE_SEC =
  Number.isFinite(_parsedMaxAge) && _parsedMaxAge > 0
    ? _parsedMaxAge
    : Number.POSITIVE_INFINITY;

// If true (default), we DO NOT auto-create (JIT) accounts for providers
// that don't return a verifiable OIDC id_token.
const JIT_REQUIRE_ID_TOKEN = process.env.OAUTH_JIT_REQUIRE_ID_TOKEN !== 'false';

const base64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

type Pending = {
  tenantId: string;
  userId: string;
  role: UserRole;
  tokenVersion: number;
  platformAdmin: boolean;
  createdAt: number;
};

const pendingOAuth2FA = new Map<string, Pending>();
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const clearCookie = (res: express.Response, name: string, isSecure: boolean) =>
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isSecure });

// Server-side nonce store (Redis with in-memory fallback)
const nonceMem = new Map<string, number>();
const nonceKey = (tenantId: string, provider: string, nonce: string) => `oauth:nonce:${tenantId}:${provider}:${nonce}`;
async function recordNonce(tenantId: string, provider: string, nonce: string) {
  const k = nonceKey(tenantId, provider, nonce);
  try {
    const client = await getRedisClient();
    if (client) {
      // Prefer Redis as the source of truth
      await client.set(k, '1', { PX: NONCE_TTL_MS, NX: true });
      return;
    }
  } catch {
    // fall through to in-memory
  }
  // In-memory fallback only when Redis is unavailable
  nonceMem.set(k, Date.now() + NONCE_TTL_MS);
}
async function consumeNonce(tenantId: string, provider: string, nonce: string): Promise<boolean> {
  const k = nonceKey(tenantId, provider, nonce);
  try {
    const client = await getRedisClient();
    if (client) {
      // Atomic consume: DEL returns 1 only once
      const del = await client.del(k);
      if (del === 1) {
        // keep in-memory fallback in sync if it exists
        nonceMem.delete(k);
        return true;
      }
    }
  } catch {}
  const exp = nonceMem.get(k);
  if (exp && exp > Date.now()) {
    nonceMem.delete(k);
    return true;
  }
  return false;
}

router.get('/:provider', async (req: TenantRequest, res) => {
  const cfg = await PlatformConfigService.getConfig<any>('oauth', 'platform');
  const prov = cfg?.[req.params.provider];
  if (!prov) return res.sendStatus(404);
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  res.cookie(`oauth_state_${req.params.provider}`, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
  });
  res.cookie(`oauth_nonce_${req.params.provider}`, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
  });
  // Record nonce server-side to prevent replay across requests/devices
  if (req.tenantId) {
    await recordNonce(req.tenantId, req.params.provider, nonce);
  }
  res.cookie(`oauth_verifier_${req.params.provider}`, verifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: 5 * 60 * 1000,
  });
  const url = `${prov.authUrl}?client_id=${prov.clientId}&redirect_uri=${encodeURIComponent(
    prov.redirectUri,
  )}&response_type=code&scope=${encodeURIComponent(prov.scope || '')}&state=${state}&nonce=${nonce}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(url);
});

router.get('/:provider/callback', async (req: TenantRequest, res) => {
  const cfg = await PlatformConfigService.getConfig<any>('oauth', 'platform');
  const prov = cfg?.[req.params.provider];
  if (!prov) return res.sendStatus(404);
  const stateCookie = req.cookies[`oauth_state_${req.params.provider}`];
  const nonceCookie = req.cookies[`oauth_nonce_${req.params.provider}`];
  const verifierCookie = req.cookies[`oauth_verifier_${req.params.provider}`];
  if (!stateCookie || stateCookie !== req.query.state) {
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
    return res.status(400).send('invalid_state');
  }
  if (typeof req.query.error === 'string') {
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    // Clear transient cookies
    clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
    return res.status(400).send(req.query.error);
  }
  if (!verifierCookie) return res.status(400).send('invalid_verifier');
  const code = req.query.code as string;
  let tokenResp: any;
  try {
    tokenResp = await superagent
      .post(prov.tokenUrl)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        client_id: prov.clientId,
        client_secret: prov.clientSecret,
        redirect_uri: prov.redirectUri,
        code_verifier: verifierCookie,
      });
  } catch (err: any) {
    // Surface provider outage / non-200 as a proper HTTP error response
    const status =
      typeof err?.status === 'number' ? err.status : 502;
    const message =
      (err?.response && (err.response.text ||
        err.response.body?.error_description ||
        err.response.body?.error)) ||
      err?.message ||
      'token_exchange_failed';
    return res.status(status).send(message);
  }
  const accessToken = tokenResp.body.access_token;
  // If provider returns an id_token (OIDC), validate signature and claims
  const idToken = tokenResp.body.id_token as string | undefined;
  let idPayload: any | undefined;
  if (idToken) {
    if (!prov.jwksUri || !prov.issuer) {
      return res.status(500).send('idp_config_missing');
    }
    try {
      const JWKS = createRemoteJWKSet(new URL(prov.jwksUri));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: prov.issuer,
        audience: prov.clientId,
        algorithms: ['RS256', 'PS256', 'ES256'],
        clockTolerance: 60,
      });
      const now = Math.floor(Date.now() / 1000);
      const skew = 60;
      if (typeof payload.iat !== 'number' || payload.iat > now + skew || (now - payload.iat) > ID_TOKEN_MAX_AGE_SEC) {
        return res.status(400).send('invalid_id_token');
      }
      idPayload = payload;
    } catch {
      return res.status(400).send('invalid_id_token');
    }
    if (!nonceCookie || idPayload?.nonce !== nonceCookie) {
      return res.status(400).send('invalid_nonce');
    }
    if (!(await consumeNonce(req.tenantId!, req.params.provider, nonceCookie))) {
      const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
      clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
      clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
      clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
      return res.status(400).send('invalid_nonce');
    }
  }

  let userInfo: any;
  try {
    userInfo = await superagent
      .get(prov.userInfoUrl)
      .set('Authorization', `Bearer ${accessToken}`);
  } catch (err: any) {
    const status =
      typeof err?.status === 'number' ? err.status : 502;
    const message =
      (err?.response && (err.response.text ||
        err.response.body?.error_description ||
        err.response.body?.error)) ||
      err?.message ||
      'userinfo_fetch_failed';
    return res.status(status).send(message);
  }
  const { email, name } = userInfo.body;
  let user = await UserService.findUserByEmail(email);
  let created = false;

  // Option B: Disallow JIT signup when provider doesn't return a verifiable id_token.
  // (We consider it "verifiable" if an id_token existed and we successfully verified it above,
  // which would have produced a non-undefined idPayload.)
  if (!user && JIT_REQUIRE_ID_TOKEN && !idPayload) {
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    // Clean transient cookies
    clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
    return res.status(403).json({ error: 'JIT_DISABLED_FOR_PROVIDER' });
  }

  if (!user) {
    const randomPass = crypto.randomBytes(16).toString('hex');
    await withTenantContext(req.tenant!, async (tp) => {
      await UserService.createUser({ email, password: randomPass, name: name || email });
    });
    user = await UserService.findUserByEmail(email);
    created = true;
  }
  if (!user) return res.sendStatus(500);

  // If this was a first-time OAuth creation, align emailVerified with OIDC when available.
  // Safe default: false unless id_token explicitly says email_verified === true.
  if (created && user) {
    const explicitlyVerified =
      !!(idPayload && typeof idPayload.email_verified === 'boolean' && idPayload.email_verified === true);
    const desired = explicitlyVerified ? true : false;
    if (user.emailVerified !== desired) {
      await withTenantContext(req.tenant!, async () => {
        await UserService.updateUser(user.id, { emailVerified: desired });
        user.emailVerified = desired;
      });
    }

    // Option A: if not verified by OIDC, send our verification email now.
    if (!user.emailVerified) {
      try {
        const verificationToken = `${req.tenantId}.${crypto.randomUUID()}`;
        const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await withTenantContext(req.tenant!, async () => {
          await UserService.updateUser(user.id, {
            verificationToken,
            verificationTokenExpiry: verificationExpiry,
          });
        });
        const verifyUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/verify-email/${encodeURIComponent(verificationToken)}`;
        await EmailService.sendEmail({
          to: user.email,
          subject: 'Verify your email',
          text: `Click to verify: ${verifyUrl}`,
        });
      } catch {
        // don't block login flow decisioning on email send; we still gate below on emailVerified
      }
    }
  }

  // BLOCK OAuth login if email isn't verified yet (parity with password login).
  if (!user.emailVerified) {
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    // Clear transient PKCE/nonce/state cookies to avoid reuse
    clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
  }

  // If we're "linking" an existing local account by email (first OAuth login),
  // bump tokenVersion so any previously issued tokens are invalidated.
  // (Without per-provider linkage state, we conservatively bump on existing users.)
  let effectiveTokenVersion = user.tokenVersion;
  if (!created) {
    const upd = await UserService.updateUser(user.id, { tokenVersion: { increment: 1 } as any });
    effectiveTokenVersion = upd.tokenVersion;
  }

  const u = user!;
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  const amr: string[] | undefined = Array.isArray(idPayload?.amr) ? idPayload.amr : undefined;
  const acr: string | undefined = typeof idPayload?.acr === 'string' ? idPayload.acr : undefined;
  const amrLower = amr?.map((a) => (typeof a === 'string' ? a.toLowerCase() : a));
  // Accept MFA if provider signals 'mfa' or an OTP/TOTP factor, or AAL2+ in acr
  const providerMfaOk =
    !!(amrLower?.includes('mfa') || amrLower?.includes('otp') || amrLower?.includes('totp')) ||
    !!(acr && /aal2|aal3|mfa|high/i.test(acr));

  if (u.twoFaEnabled && !providerMfaOk) {
    // Gate with local TOTP before issuing tokens
    const pendingId = crypto.randomUUID();
    pendingOAuth2FA.set(pendingId, {
      tenantId: req.tenantId!,
      userId: u.id,
      role: u.role,
      tokenVersion: effectiveTokenVersion,
      platformAdmin: u.platformAdmin,
      createdAt: Date.now(),
    });
    // Short-lived CSRF for completion step
    const oauthCsrf = crypto.randomBytes(20).toString('hex');
    res.cookie('oauth_pending', pendingId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecure,
      maxAge: PENDING_TTL_MS,
    });
    res.cookie('oauth_csrf', oauthCsrf, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isSecure,
      maxAge: PENDING_TTL_MS,
    });
    // Clear transient PKCE/nonce/state cookies
    clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
    clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
    // Prefer redirect for top-level browser navigations; fall back to JSON for XHR
    const wantsJson = /json/i.test(req.get('accept') || '');
    if (wantsJson) {
      return res.status(401).json({ error: '2fa_required' });
    }
    const twoFaRoute = `${process.env.ADMIN_URL || ''}/oauth/2fa`;
    return res.redirect(twoFaRoute);
  }

  // MFA acceptable or not required -> issue tokens
  const rfid = crypto.randomUUID();
  const accessClaims = {
    sub: u.id,
    tenantId: req.tenantId!,
    role: u.role,
    tokenVersion: effectiveTokenVersion,
    platformAdmin: u.platformAdmin,
  };
  const refreshClaims = { ...accessClaims, rfid };
  const jti = crypto.randomUUID();
  const access = signAccess(accessClaims, jti);
  const refresh = signRefresh(refreshClaims, jti);
  const csrfToken = crypto.randomBytes(20).toString('hex');
  res.cookie('rt', refresh, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('csrf', csrfToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  // Clear transient PKCE/nonce/state cookies on success
  clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
  clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
  clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
  res.json({
    access,
    csrfToken,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      platformAdmin: u.platformAdmin,
    },
  });
});

// Complete OAuth when local TOTP is required
router.post('/:provider/complete', async (req: TenantRequest, res) => {
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  const csrfCookie = req.cookies['oauth_csrf'];
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || csrfCookie !== csrfHeader) return res.sendStatus(403);

  const pendingId = req.cookies['oauth_pending'];
  if (!pendingId) return res.sendStatus(401);
  const pending = pendingOAuth2FA.get(pendingId);
  if (!pending || pending.tenantId !== req.tenantId! || Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pendingOAuth2FA.delete(pendingId);
    clearCookie(res, 'oauth_pending', isSecure);
    res.clearCookie('oauth_csrf', { httpOnly: false, sameSite: 'lax', secure: isSecure });
    return res.sendStatus(401);
  }

  const { totp, recoveryCode } = z
    .object({ totp: z.string().optional(), recoveryCode: z.string().optional() })
    .parse(req.body || {});

  const prisma = getTenantPrisma();
  const user = await prisma.user.findFirst({
    where: { id: pending.userId, tenantId: pending.tenantId },
    select: {
      emailVerified: true,
      id: true,
      email: true,
      name: true,
      role: true,
      platformAdmin: true,
      tokenVersion: true,
      twoFaEnabled: true,
      twoFaSecret: true,
      twoFaRecoveryCodes: true,
    },
  });
  if (!user || !user.twoFaEnabled) return res.sendStatus(401);
  // Enforce email verification at the 2FA completion step as well
  if (!user.emailVerified) {
    const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
    clearCookie(res, 'oauth_pending', isSecure);
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
  }

  let twoFaOk = false;
  if (recoveryCode && Array.isArray(user.twoFaRecoveryCodes)) {
    for (const [idx, codeHash] of user.twoFaRecoveryCodes.entries()) {
      if (await bcrypt.compare(recoveryCode, codeHash)) {
        // consume used recovery code
        const updated = [...user.twoFaRecoveryCodes];
        updated.splice(idx, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFaRecoveryCodes: updated },
        });
        twoFaOk = true;
        break;
      }
    }
  }

  if (!twoFaOk && totp) {
    const secret =
      user.twoFaSecret ? EncryptionService.decrypt(user.twoFaSecret) : null;
    if (secret) {
      twoFaOk = verifyTOTP(totp, secret);
    }
  }
  if (!twoFaOk) return res.status(401).json({ error: 'Invalid 2FA' });

  const rfid = crypto.randomUUID();
  // Issue tokens now
  const accessClaims = {
    sub: user.id,
    tenantId: pending.tenantId,
    role: user.role as UserRole,
    tokenVersion: user.tokenVersion,
    platformAdmin: !!user.platformAdmin,
  };
  const refreshClaims = { ...accessClaims, rfid };
  const jti = crypto.randomUUID();
  const access = signAccess(accessClaims, jti);
  const refresh = signRefresh(refreshClaims, jti);
  const csrfToken = crypto.randomBytes(20).toString('hex');

  res.cookie('rt', refresh, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie('csrf', csrfToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  // Cleanup pending + transient cookies
  pendingOAuth2FA.delete(pendingId);
  clearCookie(res, 'oauth_pending', isSecure);
  res.clearCookie('oauth_csrf', { httpOnly: false, sameSite: 'lax', secure: isSecure });
  clearCookie(res, `oauth_state_${req.params.provider}`, isSecure);
  clearCookie(res, `oauth_nonce_${req.params.provider}`, isSecure);
  clearCookie(res, `oauth_verifier_${req.params.provider}`, isSecure);
  res.json({
    access,
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      platformAdmin: user.platformAdmin,
    },
  });
});

export default router;