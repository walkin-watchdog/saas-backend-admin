import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePublicTheme } from '@/hooks/useTheme';
import { brandColors } from '@/utils/brandColors';
import { Captcha } from '@/components/auth/Captcha';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [showMfa, setShowMfa] = useState(false);
  const [totp, setTotp] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login, completeTenantOAuth } = useAuth();
  const { theme } = usePublicTheme();

  const expired = searchParams.get('expired');
  const oauthProvider = searchParams.get('oauth');
  const oauthMfa = searchParams.get('mfa') === '1';

  useEffect(() => {
    if (oauthProvider && oauthMfa) {
      setShowMfa(true);
    }
  }, [oauthProvider, oauthMfa]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/auth/oauth/providers`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setOauthProviders(data);
          } else if (Array.isArray(data.providers)) {
            setOauthProviders(data.providers);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Check for existing admin users
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/check-admin`);
        if (res.ok) {
          const data = await res.json();
          if (!data.exists) {
            navigate('/get-started');
            return;
          }
        }
      } finally {
        setChecking(false);
      }
    })();
  }, [navigate]);

  if (user) return <Navigate to="/" replace />;
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (oauthProvider && oauthMfa) {
        await completeTenantOAuth?.(oauthProvider, { totp, recoveryCode });
        navigate('/');
        return;
      }
      await login(email, password, { totp, recoveryCode, captcha });
    } catch (err: any) {
      if (err.code === 'LOCKED') {
        setLockoutUntil(Date.now() + (err.retryAfter || 0) * 1000);
      } else if (err.code === 'RATE_LIMIT') {
        setLockoutUntil(Date.now() + (err.retryAfter || 0) * 1000);
      } else if (err.code === 'MFA_REQUIRED') {
        setShowMfa(true);
      } else if (err.code === 'CAPTCHA_REQUIRED' || err.code === 'captcha_required') {
        setNeedCaptcha(true);
      } else if (err.code === 'CAPTCHA_FAILED' || err.code === 'captcha_failed') {
        setCaptcha('');
        setNeedCaptcha(true);
        setError('CAPTCHA verification failed. Please try again.');
      } else if (err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email before signing in.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const primaryColor = theme?.colors?.primary || brandColors.primary;
  const secondaryColor = theme?.colors?.secondary || brandColors.secondary;
  const logoUrl = theme?.logoUrl;

  const remainingLockout = lockoutUntil ? Math.max(0, lockoutUntil - Date.now()) : 0;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: `linear-gradient(to bottom right, ${secondaryColor}, ${primaryColor})` }}
    >
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 mx-auto mb-4 object-contain" />
          ) : (
            <div className="text-3xl font-bold mb-2">
              <span style={{ color: primaryColor }}>Luxé</span>
              <span style={{ color: secondaryColor }} className="ml-1">TimeTravel</span>
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
          <p className="text-gray-600 mt-2">Sign in to manage your platform</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {expired === 'true' && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              Session expired. Please log in again.
            </div>
          )}

          {lockoutUntil && remainingLockout > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
              Too many attempts. Try again in {Math.ceil(remainingLockout / 1000)}s.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!oauthProvider && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  placeholder="email address"
                  required
                />
              </div>
            </div>
          )}

          {!oauthProvider && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  {showPassword ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>
          )}

          {showMfa && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Authenticator Code</label>
              <input
                type="text"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none"
                maxLength={6}
              />
              <div className="mt-2 text-sm text-center">
                <button type="button" className="underline" onClick={() => setRecoveryCode('')}>
                  {recoveryCode ? 'Use authenticator code' : 'Use recovery code'}
                </button>
              </div>
              {recoveryCode && (
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  className="mt-2 block w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none"
                />
              )}
            </div>
          )}

          {needCaptcha && <Captcha onToken={setCaptcha} />}

          <button
            type="submit"
            disabled={isLoading || (lockoutUntil !== null && remainingLockout > 0)}
            className="w-full text-white py-3 px-4 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: primaryColor, '--tw-ring-color': primaryColor } as React.CSSProperties}
          >
            {isLoading ? 'Signing in...' : oauthProvider && oauthMfa ? 'Verify' : 'Sign In'}
          </button>
        </form>

        {!oauthProvider && oauthProviders.length > 0 && (
          <div className="mt-4 space-y-2">
            {oauthProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => {
                  sessionStorage.setItem('tenant_oauth_provider', provider);
                  window.location.href = `/api/auth/oauth/${provider}`;
                }}
                className="w-full border border-gray-300 rounded-lg py-2 text-sm"
              >
                {`Continue with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            to="/forgot-password"
            className="text-sm transition-colors"
            style={{ color: secondaryColor }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.color = primaryColor;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.color = secondaryColor;
            }}
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
};
