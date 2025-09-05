import { UserRole } from '../utils/jwt';

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
