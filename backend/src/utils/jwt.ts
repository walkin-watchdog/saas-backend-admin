import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const ISSUER = 'saas';

export interface TokenClaims {
  sub: string;        // userId
  tenantId: string;
  role: UserRole;
  tokenVersion: number;
  platformAdmin?: boolean;
  rfid?: string;
  jti: string;
  iat?: number;
  exp?: number;
}

function sign(payload: Omit<TokenClaims, 'jti'>, aud: 'user' | 'refresh', ttl: string, jti?: string) {
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

export function signAccess(payload: Omit<TokenClaims, 'jti'>, jti?: string) {
  return sign(payload, 'user', ACCESS_TTL, jti);
}

export function signRefresh(payload: Omit<TokenClaims, 'jti'>, jti?: string) {
  return sign(payload, 'refresh', REFRESH_TTL, jti);
}

function verify(token: string, aud: 'user' | 'refresh'): TokenClaims {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    issuer: ISSUER,
    audience: aud,
    algorithms: ['HS256'],
  }) as JwtPayload as TokenClaims;
}

export function verifyAccess(token: string): TokenClaims {
  return verify(token, 'user');
}

export function verifyRefresh(token: string): TokenClaims {
  return verify(token, 'refresh');
}
