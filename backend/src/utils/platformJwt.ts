import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

const PLATFORM_ACCESS_TTL = '8h';
const PLATFORM_REFRESH_TTL = '7d';
const IMPERSONATION_TTL = '2h';
const ISSUER = 'saas-platform';
const IMPERSONATION_SECRET = process.env.IMPERSONATION_JWT_SECRET || 'impersonation-secret';

export interface PlatformTokenClaims {
  sub: string;        // platformUserId
  email: string;
  roles: string[];
  permissions: string[];
  jti: string;
  iat?: number;
  exp?: number;
}

export interface ImpersonationTokenClaims {
  sub: string;        // platformUserId
  tenantId: string;
  scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
  reason: string;
  grantId: string;
  jti: string;
  iat?: number;
  exp?: number;
}

function signPlatform(payload: Omit<PlatformTokenClaims, 'jti'>, aud: 'platform' | 'platform-refresh', ttl: string, jti?: string) {
  const jwtid = jti ?? crypto.randomUUID();
  const options: SignOptions = {
    expiresIn: ttl as any,
    issuer: ISSUER,
    audience: aud,
    algorithm: 'HS256',
    jwtid,
  };
  return jwt.sign(payload, process.env.JWT_SECRET as Secret, options);
}

export function signPlatformAccess(payload: Omit<PlatformTokenClaims, 'jti'>, jti?: string) {
  return signPlatform(payload, 'platform', PLATFORM_ACCESS_TTL, jti);
}

export function signPlatformRefresh(payload: Omit<PlatformTokenClaims, 'jti'>, jti?: string) {
  return signPlatform(payload, 'platform-refresh', PLATFORM_REFRESH_TTL, jti);
}

export function signImpersonationToken(
  payload: Omit<ImpersonationTokenClaims, 'jti'>,
  aud: 'tenant-api' | 'platform-api' = 'tenant-api',
  jti?: string
) {
  const jwtid = jti ?? crypto.randomUUID();
  const options: SignOptions = {
    expiresIn: IMPERSONATION_TTL as any,
    issuer: ISSUER,
    audience: aud,
    algorithm: 'HS256',
    jwtid,
  };
  return jwt.sign(payload, IMPERSONATION_SECRET as Secret, options);
}

function verifyPlatform(token: string, aud: 'platform' | 'platform-refresh'): PlatformTokenClaims {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    issuer: ISSUER,
    audience: aud,
    algorithms: ['HS256'],
  }) as JwtPayload as PlatformTokenClaims;
}

export function verifyPlatformAccess(token: string): PlatformTokenClaims {
  return verifyPlatform(token, 'platform');
}

export function verifyPlatformRefresh(token: string): PlatformTokenClaims {
  return verifyPlatform(token, 'platform-refresh');
}

export function verifyImpersonationToken(
  token: string,
  aud: 'tenant-api' | 'platform-api'
): ImpersonationTokenClaims {
  const payload = jwt.verify(token, IMPERSONATION_SECRET as Secret, {
    issuer: ISSUER,
    audience: aud,
    algorithms: ['HS256'],
  }) as JwtPayload as ImpersonationTokenClaims;

  if (!payload.jti) {
    throw new Error('missing_jti');
  }

  return payload;
}