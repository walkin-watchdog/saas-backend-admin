import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isTokenExpired, parseAccessToken } from '../../utils/auth';
import type { UserRole } from '@/types/auth';

export const ProtectedRoute = ({ children, requiredRoles }: {children: ReactNode, requiredRoles?: UserRole[]}) => {
  const { user, token, isLoading, logout } = useAuth();
  const location = useLocation();

  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!isLoading) setChecked(true);
  }, [isLoading]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  const wasTokenPresent = Boolean(token);
  const payload = token ? parseAccessToken(token) : null;
  const unauthenticated = !token || isTokenExpired(token) || !payload;

  if (unauthenticated) {
    if (wasTokenPresent) {
      logout();
    }
    return (
      <Navigate
        to={`/login${wasTokenPresent ? '?expired=true' : ''}`}
        replace
        state={{ from: location }}
      />
    );

  }

  const tenantMismatch =
    !payload?.tenantId || !user?.tenantId || payload.tenantId !== user.tenantId;

  if (tenantMismatch) {
    logout();
    return (
      <Navigate to="/login" replace state={{ from: location }} />
    );
  }

  const role: UserRole | undefined = payload?.role ?? user?.role;
  if (requiredRoles && role && !requiredRoles.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};