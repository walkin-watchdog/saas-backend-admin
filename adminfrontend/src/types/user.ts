// User and authentication related types
import type { UserRole } from './auth';
import type { Subscription } from './billing';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  createdAt: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (
    email: string,
    password: string,
    opts?: { totp?: string; recoveryCode?: string; captcha?: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  billingWarning: boolean;
  billingErrorCode: string | null;
  clearBillingWarning: () => void;
  subscription: Subscription | null;
  refreshSubscription: () => Promise<Subscription | null>;

  completeTenantOAuth?: (
    provider: string,
    payload: { totp?: string; recoveryCode?: string }
  ) => Promise<void>;

  // Platform admin fields
  platformUser: import('./platform').PlatformCurrentUser | null;
  isPlatformAdmin: boolean;
  platformPermissions: string[];
  requiresMfa: boolean;
  platformLogin: (
    email: string,
    password: string,
    mfaCode?: string,
    recoveryCode?: string
  ) => Promise<void>;
  completeOAuthLogin: (provider: string, totp: string, recoveryCode?: string) => Promise<void>;
  platformLogout: () => Promise<void>;
  refreshPlatformUser: () => Promise<void>;
}

export interface Newsletter {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}
