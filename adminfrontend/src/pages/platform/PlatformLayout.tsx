import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart3,
  Users,
  Building,
  Ticket,
  ShoppingCart,
  MessageSquare,
  Shield,
  UserCheck,
  Settings,
  Webhook,
  FileText,
  CreditCard,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  Eye,
  BookOpen,
  ShieldCheck
} from 'lucide-react';
import { PERMISSIONS } from '@/constants/permissions';
import { Link } from 'react-router-dom';

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export default function PlatformLayout({ children }: PlatformLayoutProps) {
  const { platformUser, isPlatformAdmin, platformPermissions, requiresMfa, platformLogout } = usePlatformAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Show 403 for non-platform users (let PlatformLayout handle it, not redirect)
  if (!isPlatformAdmin && !requiresMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Shield className="h-16 w-16 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access the platform administration area.
          </p>
          <Button onClick={platformLogout} variant="outline">
            Return to Login
          </Button>
        </div>
      </div>
    );
  }


  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  // Filter navigation items based on permissions
  const filteredNavigation = [
    { to: '/platform', icon: BarChart3, label: 'Dashboard', exact: true, permission: null },
    { to: '/platform/subscribers', icon: Users, label: 'Subscribers', permission: PERMISSIONS.SUBSCRIBERS.READ },
    { to: '/platform/tenants', icon: Building, label: 'Tenants', permission: PERMISSIONS.TENANTS.READ },
    { to: '/platform/coupons', icon: Ticket, label: 'Coupons & Discounts', permission: PERMISSIONS.COUPONS.READ },
    { to: '/platform/orders', icon: ShoppingCart, label: 'Orders', permission: PERMISSIONS.ORDERS.READ },
    { to: '/platform/invoices', icon: CreditCard, label: 'Invoices', permission: PERMISSIONS.INVOICES.READ },
    { to: '/platform/credit-notes', icon: FileText, label: 'Credit Notes', permission: PERMISSIONS.CREDIT_NOTES.READ },
    { to: '/platform/abandoned-carts', icon: ShoppingCart, label: 'Abandoned Carts', permission: PERMISSIONS.ABANDONED_CARTS.READ },
    { to: '/platform/requests', icon: MessageSquare, label: 'Requests', permission: PERMISSIONS.REQUESTS.READ },
    { to: '/platform/kyc', icon: UserCheck, label: 'KYC Review', permission: PERMISSIONS.KYC.READ },
    { to: '/platform/users', icon: Shield, label: 'Users & Roles', permission: PERMISSIONS.PLATFORM_USERS.READ },
    { to: '/platform/permissions', icon: ShieldCheck, label: 'Permissions', permission: PERMISSIONS.PERMISSIONS.READ },
    { to: '/platform/impersonation', icon: Eye, label: 'Impersonation', permission: PERMISSIONS.IMPERSONATION.READ },
    { to: '/platform/plans', icon: BookOpen, label: 'Plans', permission: PERMISSIONS.PLANS.READ },
    { to: '/platform/webhooks', icon: Webhook, label: 'Webhooks', permission: PERMISSIONS.WEBHOOKS.READ },
    { to: '/platform/audit-log', icon: FileText, label: 'Audit Log', permission: PERMISSIONS.AUDIT.READ },
    { to: '/platform/settings', icon: Settings, label: 'Global Settings', permission: PERMISSIONS.CONFIG.READ },
  ].filter(item => !item.permission || hasPermission(item.permission));

  const handleLogout = async () => {
    await platformLogout();
  };

  const isActive = (path: string, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* MFA Required Banner */}
      {requiresMfa && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Multi-factor authentication is required. Please complete MFA setup to continue.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-6 border-b">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <span className="font-semibold">Platform Admin</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4">
              <ul className="space-y-1 px-3">
                {filteredNavigation.map((item) => {
                  const active = isActive(item.to, item.exact);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={`
                          flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
                          ${active 
                            ? 'bg-primary text-primary-foreground' 
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }
                        `}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* User Info */}
            <div className="border-t p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {platformUser?.name?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {platformUser?.name || 'Admin User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {platformUser?.email}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {platformUser?.mfaEnabled && (
                      <Badge variant="secondary" size="sm" className="text-xs">
                        <Shield className="h-2 w-2 mr-1" />
                        2FA
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                  >
                    <Link to="/platform/mfa-settings" title="MFA Settings">
                      <Shield className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-full items-center justify-between px-6">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {platformUser?.roles
                    .map(r => r.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
                    .join(', ')}
                </span>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}