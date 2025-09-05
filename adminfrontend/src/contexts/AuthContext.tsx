import { createContext, useContext, useEffect, useState } from 'react';
import { isTokenExpired, isTokenNearExpiry } from '../utils/auth';
import { useCallback, type ReactNode } from 'react';
import type { AuthContextType, User } from '@/types';
import type { PlatformCurrentUser } from '@/types/platform';
import type { Subscription } from '@/types/billing';
import { subscriptionApi } from '@/api/billing/subscription';
import { PlatformApiError } from '@/api/platform/base';
import { authApi } from '@/api/platform/auth';
import { oauthApi } from '@/api/platform/oauth';
import type { PlatformRoleCode } from '@/constants/platformRoles';

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = 'admin_token';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    sessionStorage.getItem('admin_token')
  );
  const [csrfToken, setCsrfToken] = useState<string | null>(
    sessionStorage.getItem('csrf_token')
  );
  const [isLoading, setIsLoading] = useState(true);
  const [platformUser, setPlatformUser] = useState<PlatformCurrentUser | null>(null);
  const [platformPermissions, setPlatformPermissions] = useState<string[]>([]);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [platformToken, setPlatformToken] = useState<string | null>(
    sessionStorage.getItem('platform_access_token')
  );
  const [platformCsrf, setPlatformCsrf] = useState<string | null>(
    sessionStorage.getItem('platform_csrf_token')
  );
  const [billingWarning, setBillingWarning] = useState(false);
  const [billingErrorCode, setBillingErrorCode] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => {
      setPlatformUser(null);
      setPlatformPermissions([]);
      setRequiresMfa(false);
      setPlatformToken(null);
      setPlatformCsrf(null);
      sessionStorage.removeItem('platform_access_token');
      sessionStorage.removeItem('platform_csrf_token');
      window.location.href = '/platform/login';
    };

    const handleMfaRequired = () => {
      setRequiresMfa(true);
    };

    window.addEventListener('platform:unauthorized', handleUnauthorized);
    window.addEventListener('platform:mfa-required', handleMfaRequired);

    return () => {
      window.removeEventListener('platform:unauthorized', handleUnauthorized);
      window.removeEventListener('platform:mfa-required', handleMfaRequired);
    };
  }, [csrfToken]);

  const login = async (
    email: string,
    password: string,
    opts?: { totp?: string; recoveryCode?: string; captcha?: string }
  ) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/login`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify({ email, password, ...opts }),
        }
      );

      if (response.status === 423) {
        const retry = parseInt(response.headers.get('Retry-After') || '0', 10);
        const err = new Error('Account temporarily locked');
        (err as any).code = 'LOCKED';
        (err as any).retryAfter = retry;
        throw err;
      }
      if (response.status === 429) {
        const retry = parseInt(response.headers.get('Retry-After') || '0', 10);
        const err = new Error('Too many attempts, please wait');
        (err as any).code = 'RATE_LIMIT';
        (err as any).retryAfter = retry;
        throw err;
      }

      if (!response.ok) {
        let data: any = null;
        try { data = await response.json(); } catch {}
        const err = new Error(data?.error || 'Login failed');
        (err as any).code = data?.error;
        throw err;
      }

      const { access, csrfToken: csrf, user: loggedInUser } = await response.json();
      setUser(loggedInUser);
      setToken(access);
      setCsrfToken(csrf);
      sessionStorage.setItem('admin_token', access);
      if (csrf) sessionStorage.setItem('csrf_token', csrf);
      await refreshSubscription();
    } catch (error) {
      throw error;
    }
  };

  const completeTenantOAuth = async (
    provider: string,
    payload: { totp?: string; recoveryCode?: string }
  ): Promise<void> => {
    const getCookie = (name: string): string | null => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    };

    const csrf = getCookie('oauth_csrf') || '';
    const res = await fetch(`/api/auth/oauth/${provider}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf,
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || 'OAuth completion failed');
      (err as any).code = data.error;
      throw err;
    }
    const { access, csrfToken: csrfNew, user: u } = await res.json();
    setUser(u);
    setToken(access);
    setCsrfToken(csrfNew);
    sessionStorage.setItem('admin_token', access);
    if (csrfNew) sessionStorage.setItem('csrf_token', csrfNew);
    await refreshSubscription();
  };

  const logout = useCallback(async () => {
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/logout`,
        {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
        }
      );
    } catch (_) {
    }
    setUser(null);
    setToken(null);
    setCsrfToken(null);
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('csrf_token');
    setSubscription(null);
  }, [csrfToken]);

  const refreshSubscription = useCallback(async (): Promise<Subscription | null> => {
    try {
      const sub = await subscriptionApi.getCurrent().catch(() => null);
      setSubscription(sub);
      return sub;
    } catch {
      setSubscription(null);
      return null;
    }
  }, []);

  const checkPlatformAccess = async (): Promise<boolean> => {
    const token = platformToken || sessionStorage.getItem('platform_access_token');
    if (!token) return false;
    try {
      const data = await authApi.getCurrentUser();
      setPlatformUser(data);
      setPlatformPermissions(data.permissions || []);
      return true;
    } catch (error) {
      const err = error as PlatformApiError;
      const msg = err.message?.toLowerCase() || '';
      if (
        (err.status === 403 || err.status === 401) &&
        (
          err.code === 'mfa_required' ||
          err.code === '2fa_required' ||
          msg.includes('mfa') ||
          msg.includes('2fa')
        )
      ) {
        setRequiresMfa(true);
      }
    }
    return false;
  };

  const platformLogin = async (
    email: string,
    password: string,
    mfaCode?: string,
    recoveryCode?: string
  ): Promise<void> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, mfaCode, recoveryCode }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        const msg = err.error?.toLowerCase() || '';
        const isMfa = err.code === 'mfa_required' || err.code === '2fa_required' || msg.includes('mfa') || msg.includes('2fa');
        if ((response.status === 403 || response.status === 401) && isMfa) {
          setRequiresMfa(true);
          if (!mfaCode) {
            throw new Error('MFA_REQUIRED');
          }
          throw new Error(err.error || 'Invalid MFA code');
        }
        throw new Error(err.message || err.error || 'Login failed');
      }

      const { user, access, csrfToken } = await response.json();
      const { passwordHash: _ph, ...userData } = user as any;
      setPlatformUser({
        ...userData,
        status: userData.status,
        roles: userData.roles as PlatformRoleCode[],
        permissions: userData.permissions || [],
      });
      setPlatformPermissions(userData.permissions || []);
      setRequiresMfa(false);
      setPlatformToken(access);
      setPlatformCsrf(csrfToken);
      sessionStorage.setItem('platform_access_token', access);
      sessionStorage.setItem('platform_csrf_token', csrfToken);
      await checkPlatformAccess();
    } catch (err) {
      console.error('Platform login failed:', err);
      throw err;
    }
  };

  const completeOAuthLogin = async (
    provider: string,
    totp: string,
    recoveryCode?: string
  ): Promise<void> => {
    const data = await oauthApi.complete(provider, { totp, recoveryCode });
    const { passwordHash: _ph, ...userData } = data.user as any;
    setPlatformUser({
      ...userData,
      roles: userData.roles as PlatformRoleCode[],
      permissions: userData.permissions || [],
    });
    setPlatformPermissions(userData.permissions || []);
    setRequiresMfa(false);
    setPlatformToken(data.access);
    setPlatformCsrf(data.csrfToken);
    sessionStorage.setItem('platform_access_token', data.access);
    sessionStorage.setItem('platform_csrf_token', data.csrfToken);
    sessionStorage.removeItem('platform_oauth_provider');
  };

  const platformLogout = async (): Promise<void> => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-csrf-token': platformCsrf || '',
          ...(platformToken ? { Authorization: `Bearer ${platformToken}` } : {}),
        },
      });
    } catch (error) {
      console.error('Platform logout failed:', error);
    }
    setPlatformUser(null);
    setPlatformPermissions([]);
    setRequiresMfa(false);
    setPlatformToken(null);
    setPlatformCsrf(null);
    sessionStorage.removeItem('platform_access_token');
    sessionStorage.removeItem('platform_csrf_token');
    window.location.href = '/platform/login';
  };

  const refreshPlatformUser = async (): Promise<void> => {
    await checkPlatformAccess();
  };

  useEffect(() => {
    const bc = new BroadcastChannel('token_refresh');
    bc.onmessage = ({ data }) => {
      if (data.type === 'TOKEN_REFRESHED') {
        const fresh = sessionStorage.getItem(TOKEN_KEY);
        if (fresh) {
          setToken(fresh);
        }
      }
    };
    return () => bc.close();
  }, []);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    let mounted = true;

    const interval = setInterval(async () => {
      if (!token || isTokenExpired(token)) {
        return;
      }

      if (isTokenNearExpiry(token, 5)) {
        let attempts = 0;
        const maxAttempts = 3;
        const baseDelay = 1000;

        const attemptRefresh = async (): Promise<void> => {
          try {
            const res = await fetch(`${API}/auth/refresh`, {
              method: 'POST',
              credentials: 'include',
              headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
            });
            if (!res.ok) throw new Error('refresh_failed');
            const { access, csrfToken: newCsrf } = await res.json();
            if (!mounted) return;
            setToken(access);
            if (newCsrf) {
              setCsrfToken(newCsrf);
              sessionStorage.setItem('csrf_token', newCsrf);
            }
            sessionStorage.setItem(TOKEN_KEY, access);
            // let other tabs know
            new BroadcastChannel('token_refresh').postMessage({ type: 'TOKEN_REFRESHED' });
          } catch (err) {
            if (++attempts < maxAttempts) {
              await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempts));
              return attemptRefresh();
            }
            console.error('Max refresh attempts reached', err);
            await logout();
          }
        };

        attemptRefresh();
      }
    }, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token, logout]);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    let mounted = true;

    const interval = setInterval(async () => {
      if (!platformToken || isTokenExpired(platformToken)) {
        return;
      }

      if (isTokenNearExpiry(platformToken, 5)) {
        try {
          const res = await fetch(`${API}/platform/auth/refresh`, {
            method: 'POST',
            headers: {
              'x-csrf-token': platformCsrf || '',
              ...(platformToken ? { Authorization: `Bearer ${platformToken}` } : {}),
            },
            credentials: 'include',
          });
          if (!res.ok) throw new Error('refresh_failed');
          const { access, csrfToken } = await res.json();
          if (!mounted) return;
          setPlatformToken(access);
          setPlatformCsrf(csrfToken);
          sessionStorage.setItem('platform_access_token', access);
          sessionStorage.setItem('platform_csrf_token', csrfToken);
        } catch (err) {
          console.error('Platform token refresh failed', err);
          setPlatformUser(null);
          setPlatformToken(null);
          setPlatformCsrf(null);
          sessionStorage.removeItem('platform_access_token');
          sessionStorage.removeItem('platform_csrf_token');
        }
      }
    }, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [platformToken, platformCsrf]);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = sessionStorage.getItem('admin_token');
      if (savedToken) {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/me`, {
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${savedToken}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(savedToken);
          } else {
            sessionStorage.removeItem('admin_token');
            setToken(null);
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          sessionStorage.removeItem('admin_token');
          setToken(null);
        }
      }
      const savedPlatformToken = sessionStorage.getItem('platform_access_token');
      const savedPlatformCsrf = sessionStorage.getItem('platform_csrf_token');
      if (savedPlatformToken) setPlatformToken(savedPlatformToken);
      if (savedPlatformCsrf) setPlatformCsrf(savedPlatformCsrf);
      await checkPlatformAccess();
      if (savedToken) await refreshSubscription();
      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const rawFetch = (window as any).fetch.bind(window);

    (window as any).fetch = async (
      input: RequestInfo | URL,
      init: RequestInit = {}
    ) => {
      const current = sessionStorage.getItem(TOKEN_KEY);
      const reqUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      const isPlatformRequest = reqUrl.includes('/platform/');
      const baseAuth: HeadersInit | undefined =
        current && !isPlatformRequest ? { Authorization: `Bearer ${current}` } : undefined;

      const mergeHeaders = (...parts: (HeadersInit | undefined)[]): Headers => {
        const h = new Headers();
        for (const part of parts) {
          if (!part) continue;
          if (part instanceof Headers) {
            part.forEach((v, k) => h.set(k, v));
          } else if (Array.isArray(part)) {
            part.forEach(([k, v]) => h.set(k, v));
          } else {
            Object.entries(part).forEach(([k, v]) => h.set(k, v as string));
          }
        }
        return h;
      };

      const doFetch = (extra: RequestInit = {}) => {
        const hasAuth =
          new Headers(init.headers).has('Authorization') ||
          new Headers(extra.headers).has('Authorization');
        return rawFetch(input, {
          ...init,
          ...extra,
          headers: mergeHeaders(
            init.headers,
            hasAuth ? undefined : baseAuth,
            extra.headers
          ),
          credentials: 'include',
        });
      };

      let res = await doFetch();
      if (res.status === 402) {
        const data = await res.clone().json().catch(() => ({}));
        setBillingWarning(true);
        setBillingErrorCode((data as any).error);
        return res;
      }
      if (res.status === 401) {
        const body = await res.clone().text().catch(() => '');
        const lower = body.toLowerCase();
        if (lower.includes('mfa') || lower.includes('2fa')) {
          setRequiresMfa(true);
          return res;
        }
      }
      if (res.status === 401 && !String(input).endsWith('/auth/refresh')) {
        const r = await rawFetch(`${API}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
        });
        if (r.ok) {
          const { access, csrfToken: newCsrf } = await r.json();
          sessionStorage.setItem(TOKEN_KEY, access);
          setToken(access);
          if (newCsrf) {
            setCsrfToken(newCsrf);
            sessionStorage.setItem('csrf_token', newCsrf);
          }

          new BroadcastChannel('token_refresh').postMessage({ type: 'TOKEN_REFRESHED' });
          res = await doFetch({ headers: { Authorization: `Bearer ${access}` } });
          if (res.status !== 401) return res;
        }
        await logout();
      }
      return res;
    };
    return () => {
      (window as any).fetch = rawFetch;
    };
  }, []);

  const isPlatformAdmin = Boolean(
    platformUser &&
    platformUser.status === 'active' &&
    platformUser.roles.length > 0
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isLoading,
        platformUser,
        isPlatformAdmin,
        platformPermissions,
        requiresMfa,
        platformLogin,
        completeOAuthLogin,
        completeTenantOAuth,
        platformLogout,
        refreshPlatformUser,
        billingWarning,
        billingErrorCode,
        clearBillingWarning: () => {
          setBillingWarning(false);
          setBillingErrorCode(null);
        },
        subscription,
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};