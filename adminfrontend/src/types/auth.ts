// Authentication token types
export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface AuthTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  tokenVersion: number;
  platformAdmin?: boolean;
  jti: string;
  iat: number;
  exp: number;
}
