import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export const usePlatformAuth = useAuth;

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
