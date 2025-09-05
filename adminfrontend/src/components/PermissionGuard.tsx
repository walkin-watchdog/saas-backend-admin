import type { ReactNode } from 'react';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
}

export default function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const allowed =
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(permission);

  if (!allowed) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}