import express from 'express';
import crypto from 'crypto';
import superagent from 'superagent';
import { PlatformConfigService } from '../../services/platformConfigService';
import { PlatformUserService } from '../../services/platformUserService';
import { PlatformSessionService } from '../../services/platformSessionService';
import { signPlatformAccess, signPlatformRefresh } from '../../utils/platformJwt';
import { AuditService } from '../../services/auditService';
import { getRedisClient } from '../../utils/redisClient';
import bcrypt from 'bcrypt';
import { EncryptionService } from '../../utils/encryption';
import { verifyTOTP } from '../../utils/totp';
import { createRemoteJWKSet, jwtVerify } from 'jose-node-cjs-runtime';
import { realIp } from '../../middleware/rateLimit';
import { isIpAllowed } from '../../utils/ipAllowlist';

const router = express.Router();
// Server-side nonce store (Redis with in-memory fallback)
const nonceMem = new Map<string, number>();
const NONCE_TTL_MS = 10 * 60 * 1000;
const _parsedMaxAge = Number(process.env.PLATFORM_OAUTH_ID_TOKEN_MAX_AGE_SEC);
const ID_TOKEN_MAX_AGE_SEC = Number.isFinite(_parsedMaxAge) && _parsedMaxAge > 0 ? _parsedMaxAge : Number.POSITIVE_INFINITY;
const PENDING_TTL_MS = 5 * 60 * 1000;
type Pending = { userId: string; tokenVersion?: number; createdAt: number };
const pendingOAuth2FA = new Map<string, Pending>();
const base64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const nonceKey = (provider: string, nonce: string) => `oauth:nonce:platform:${provider}:${nonce}`;
async function recordNonce(provider: string, nonce: string) {
  const k = nonceKey(provider, nonce);
  try {
    const client = await getRedisClient();
    if (client) {
      await client.set(k, '1', { PX: NONCE_TTL_MS, NX: true });
      return;
    }
  } catch {}
  nonceMem.set(k, Date.now() + NONCE_TTL_MS);
}
async function consumeNonce(provider: string, nonce: string): Promise<boolean> {
  const k = nonceKey(provider, nonce);
  try {
    const client = await getRedisClient();
    if (client) {
      const del = await client.del(k);
      if (del === 1) {
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

// List enabled OAuth providers
router.get('/providers', async (_req, res) => {
  const cfg = await PlatformConfigService.getConfig<Record<string, any> | null>('oauth', 'platform');
  const providers = Object.entries(cfg || {})
    .filter(([, v]) => v && (v.enabled === undefined || v.enabled))
    .map(([k]) => k);
  res.json({ providers });
});

router.get('/:provider', async (req, res) => {
  const cfg = await PlatformConfigService.getConfig<any>('oauth', 'platform');
  const prov = cfg?.[req.params.provider];
  if (!prov) return res.sendStatus(404);
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  await recordNonce(req.params.provider, nonce);
  // PKCE
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const url = `${prov.authUrl}?client_id=${prov.clientId}&redirect_uri=${encodeURIComponent(prov.redirectUri)}&response_type=code&scope=${encodeURIComponent(prov.scope||'')}&state=${state}&nonce=${nonce}&code_challenge=${challenge}&code_challenge_method=S256`;
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  res.cookie(`oauth_state_${req.params.provider}`, state, { httpOnly: true, sameSite:'lax', secure: isSecure });
  res.cookie(`oauth_nonce_${req.params.provider}`, nonce, { httpOnly: true, sameSite:'lax', secure: isSecure });
  res.cookie(`oauth_verifier_${req.params.provider}`, verifier, { httpOnly: true, sameSite: 'lax', secure: isSecure, maxAge: 5 * 60 * 1000 });
  res.redirect(url);
});

router.get('/:provider/callback', async (req, res) => {
  const cfg = await PlatformConfigService.getConfig<any>('oauth', 'platform');
  const prov = cfg?.[req.params.provider];
  if (!prov) return res.sendStatus(404);
  const stateCookie = req.cookies[`oauth_state_${req.params.provider}`];
  const nonceCookie = req.cookies[`oauth_nonce_${req.params.provider}`];
  const verifierCookie = req.cookies[`oauth_verifier_${req.params.provider}`];
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  res.clearCookie(`oauth_state_${req.params.provider}`, { httpOnly: true, sameSite:'lax', secure:isSecure });
  res.clearCookie(`oauth_nonce_${req.params.provider}`, { httpOnly: true, sameSite:'lax', secure:isSecure });
  res.clearCookie(`oauth_verifier_${req.params.provider}`, { httpOnly: true, sameSite:'lax', secure:isSecure });
  if (!stateCookie || stateCookie !== req.query.state) return res.status(400).send('invalid_state');
  if (!nonceCookie) return res.status(400).send('invalid_nonce');
  // if (!nonceCookie || !(await consumeNonce(req.params.provider, nonceCookie))) return res.status(400).send('invalid_nonce');
  if (!verifierCookie) return res.status(400).send('invalid_verifier');
  try {
    const tokenResp = await superagent
      .post(prov.tokenUrl)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: req.query.code,
        client_id: prov.clientId,
        client_secret: prov.clientSecret,
        redirect_uri: prov.redirectUri,
        code_verifier: verifierCookie,
      });
    const idToken = tokenResp.body.id_token;
    const JWKS = createRemoteJWKSet(new URL(prov.jwksUri));
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: prov.issuer,
      audience: prov.clientId,
      algorithms: ['RS256','PS256','ES256'],
      clockTolerance: 60,
    });
    // iat age check
    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (typeof payload.iat !== 'number' || payload.iat > now + skew || (now - payload.iat) > ID_TOKEN_MAX_AGE_SEC) {
      return res.status(400).send('invalid_id_token');
    }
    // 1) Nonce in ID token must match cookie value
    if (typeof payload.nonce !== 'string' || payload.nonce !== nonceCookie) {
      return res.status(400).send('invalid_nonce');
    }
    // 2) Only now consume the server-side nonce to prevent replays of a valid, verified token
    const consumed = await consumeNonce(req.params.provider, nonceCookie);
    if (!consumed) {
      return res.status(400).send('invalid_nonce');
    }
    // if (typeof payload.nonce !== 'string' || payload.nonce !== nonceCookie) return res.status(400).send('invalid_nonce');
    if (typeof payload.sub !== 'string') return res.status(400).send('invalid_subject');
    const subjectKey = `${req.params.provider}:${payload.sub}`;
    let user = await PlatformUserService.findUserBySsoSubject(subjectKey);
    if (!user && typeof payload.email === 'string' && payload.email) {
      user = await PlatformUserService.findUserByEmail(payload.email, { includePassword: true } as any);
      if (user && !user.ssoSubject) {
        await PlatformUserService.updateUser(user.id, { ssoSubject: subjectKey });
      }
    }
    if (!user) {
      await AuditService.log({
        action: 'platform.auth.oauth_user_not_found',
        ipAddress: realIp(req),
        changes: { provider: req.params.provider, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
      });
      return res.status(401).send('user_not_found');
    }
    const clientIp = realIp(req);
    if (user.ipAllowlist && user.ipAllowlist.length > 0 && !isIpAllowed(clientIp, user.ipAllowlist)) {
      try {
        await AuditService.log({
          platformUserId: user.id,
          action: 'platform.auth.ip_denied',
          ipAddress: clientIp,
          reason: 'IP not in allowlist',
        });
      } catch (err) {
        console.error('oauth ip audit log failed', err);
      }
      return res.status(403).send('ip_not_allowed');
    }
    const { roles, permissions } = await PlatformUserService.getUserRolesAndPermissions(user.id);
    const jti = crypto.randomUUID();
    const claims = { sub: user.id, email: user.email, roles, permissions };
    // Bridge local MFA if IdP AMR/ACR doesn't signal AAL2+
    const amr = Array.isArray(payload.amr) ? payload.amr.map((a: any) => (typeof a === 'string' ? a.toLowerCase() : String(a))) : undefined;
    const acr = typeof payload.acr === 'string' ? payload.acr : undefined;
    const providerMfaOk = !!(amr?.includes('mfa') || amr?.includes('otp') || amr?.includes('totp') || (acr && /aal2|aal3|mfa|high/i.test(acr)));
    if ((user as any).mfaEnabled && !providerMfaOk) {
      const pendingId = crypto.randomUUID();
      pendingOAuth2FA.set(pendingId, { userId: user.id, tokenVersion: undefined, createdAt: Date.now() });
      const oauthCsrf = crypto.randomBytes(20).toString('hex');
      res.cookie('oauth_pending', pendingId, { httpOnly: true, sameSite: 'lax', secure: isSecure, maxAge: PENDING_TTL_MS });
      res.cookie('oauth_csrf', oauthCsrf, { httpOnly: false, sameSite: 'lax', secure: isSecure, maxAge: PENDING_TTL_MS });
      // Redirect for browser navigations; fall back to JSON when XHR explicitly requests it
      const wantsJson = /json/i.test(req.get('accept') || '');
      if (wantsJson) {
        return res.status(401).json({ error: '2fa_required' });
      }
      const twoFaRoute = `${process.env.PLATFORM_URL || process.env.ADMIN_URL || ''}/oauth/2fa`;
      return res.redirect(twoFaRoute);
    }
    const access = signPlatformAccess(claims, jti);
    const refresh = signPlatformRefresh(claims, jti);
    await PlatformSessionService.create(user.id, jti);
    await PlatformUserService.touchLastLogin(user.id);
    await AuditService.log({ platformUserId: user.id, action:'platform.auth.login_success', ipAddress: realIp(req) });
    res.cookie('platform_rt', refresh, { httpOnly:true, sameSite:'strict', secure:isSecure, maxAge:7*24*60*60*1000 });
    // Issue CSRF on success so first refresh/logout passes CSRF
    const csrf = crypto.randomBytes(20).toString('hex');
    res.cookie('platform_csrf', csrf, { httpOnly:false, sameSite:'strict', secure:isSecure, maxAge:7*24*60*60*1000 });
    res.redirect(`${process.env.PLATFORM_URL || process.env.ADMIN_URL}`);
  } catch (err) {
    console.error('oauth callback error', err);
    res.status(400).send('oauth_error');
  }
});

// Complete OAuth when local TOTP is required
router.post('/:provider/complete', async (req, res) => {
  const isSecure = !!(req.secure || req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  const csrfCookie = req.cookies['oauth_csrf'];
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || csrfCookie !== csrfHeader) return res.sendStatus(403);
  const pendingId = req.cookies['oauth_pending'];
  if (!pendingId) return res.sendStatus(401);
  const pending = pendingOAuth2FA.get(pendingId);
  if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pendingOAuth2FA.delete(pendingId);
    res.clearCookie('oauth_pending', { httpOnly: true, sameSite: 'lax', secure: isSecure });
    res.clearCookie('oauth_csrf', { httpOnly: false, sameSite: 'lax', secure: isSecure });
    return res.sendStatus(401);
  }
  const { totp, recoveryCode } = (req.body || {}) as { totp?: string; recoveryCode?: string };
  const user = await PlatformUserService.findUserById(pending.userId);
  if (!user || !(user as any).mfaEnabled) return res.sendStatus(401);
  let ok = false;
  if (recoveryCode && user.twoFaRecoveryCodes) {
    for (const [idx, hash] of user.twoFaRecoveryCodes.entries()) {
      if (await bcrypt.compare(recoveryCode, hash)) {
        const updated = [...user.twoFaRecoveryCodes];
        updated.splice(idx, 1);
        await PlatformUserService.updateUser(user.id, { twoFaRecoveryCodes: updated });
        ok = true;
        break;
      }
    }
  }
  if (!ok && totp && user.twoFaSecret) {
    const secret = EncryptionService.decrypt(user.twoFaSecret);
    ok = verifyTOTP(totp, secret);
  }
  if (!ok) return res.status(401).json({ error: 'Invalid 2FA' });
  // Issue tokens
  const { roles, permissions } = await PlatformUserService.getUserRolesAndPermissions(user.id);
  const jti = crypto.randomUUID();
  const claims = { sub: user.id, email: user.email, roles, permissions };
  const access = signPlatformAccess(claims, jti);
  const refresh = signPlatformRefresh(claims, jti);
  await PlatformSessionService.create(user.id, jti);
  await PlatformUserService.touchLastLogin(user.id);
  await AuditService.log({ platformUserId: user.id, action:'platform.auth.login_success', ipAddress: realIp(req) });
  res.cookie('platform_rt', refresh, { httpOnly:true, sameSite:'strict', secure:isSecure, maxAge:7*24*60*60*1000 });
  const csrf = crypto.randomBytes(20).toString('hex');
  res.cookie('platform_csrf', csrf, { httpOnly:false, sameSite:'strict', secure:isSecure, maxAge:7*24*60*60*1000 });
  // Cleanup pending
  pendingOAuth2FA.delete(pendingId);
  res.clearCookie('oauth_pending', { httpOnly: true, sameSite: 'lax', secure: isSecure });
  res.clearCookie('oauth_csrf', { httpOnly: false, sameSite: 'lax', secure: isSecure });
  res.json({
    access,
    csrfToken: csrf,
    user: { id: user.id, email: user.email, name: user.name, roles, permissions }
  });
});

export default router;