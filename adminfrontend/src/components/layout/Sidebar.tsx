import { useLocation } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { useState, useContext } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { MobileMenuContext } from '../../contexts/MobileMenuContext';
import {
  LayoutDashboard,
  Package,
  Calendar,
  CreditCard,
  Settings,
  Palette,
  FileText,
  BarChart3,
  MapPin,
  Tag,
  Camera,
  UserCheck,
  Newspaper,
  ShoppingCart,
  Clipboard,
  MessageSquare,
  Star,
  Layers,
  RefreshCcw,
  Activity,
  X,
  Pin,
  PinOff
} from 'lucide-react';

export const Sidebar = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { mobileOpen, setMobileOpen } = useContext(MobileMenuContext);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isCollapsed = !isPinned && !isHovered && !mobileOpen;
  const { isActive, hasFeature } = useSubscription();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Products',
      href: '/products',
      icon: Package,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Bookings',
      href: '/bookings',
      icon: Calendar,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Proposals',
      href: '/proposals',
      icon: Clipboard,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Requests',
      href: '/requests',
      icon: MessageSquare,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Availability',
      href: '/availability',
      icon: BarChart3,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Coupons',
      href: '/coupons',
      icon: CreditCard,
      roles: ['ADMIN', 'EDITOR'],
      requiredFeature: 'coupons',
    },
    {
      name: 'User Management',
      href: '/user-management',
      icon: UserCheck,
      roles: ['ADMIN']
    },
    {
      name: 'Newsletter',
      href: '/newsletter',
      icon: Newspaper,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Destinations',
      href: '/destinations-admin',
      icon: MapPin,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Experience Categories',
      href: '/experience-categories',
      icon: Tag,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Attractions',
      href: '/attractions-admin',
      icon: Star,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Content',
      href: '/content',
      icon: FileText,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Gallery',
      href: '/gallery',
      icon: Camera,
      roles: ['ADMIN', 'EDITOR', 'VIEWER']
    },
    {
      name: 'Abandoned Carts',
      href: '/abandoned-carts',
      icon: ShoppingCart,
      roles: ['ADMIN', 'EDITOR', 'VIEWER'],
      requiredFeature: 'abandoned_carts',
    },
  ];

  const billingNavigation = [
    {
      name: 'Plans',
      href: '/billing/plans',
      icon: Layers,
      roles: ['ADMIN', 'EDITOR', 'VIEWER'],
    },
    {
      name: 'Subscriptions',
      href: '/billing/plans-and-subscriptions',
      icon: RefreshCcw,
      roles: ['ADMIN', 'EDITOR', 'VIEWER'],
    },
    {
      name: 'Invoices',
      href: '/billing/invoices',
      icon: FileText,
      roles: ['ADMIN', 'EDITOR', 'VIEWER'],
    },
    {
      name: 'Usage',
      href: '/billing/usage',
      icon: Activity,
      roles: ['ADMIN', 'EDITOR', 'VIEWER'],
    },
    {
      name: 'Payment Methods',
      href: '/billing/payment-methods',
      icon: CreditCard,
      roles: ['ADMIN'],
    },
  ];

  const settingsNavigation = [
    {
      name: 'Integration Settings',
      href: '/settings/integrations',
      icon: Settings,
      roles: ['ADMIN']
    },
    {
      name: 'Brand Settings',
      href: '/settings/brand',
      icon: Palette,
      roles: ['ADMIN', 'EDITOR']
    },
  ];

  const filteredNavigation = navigation.filter(item =>
    user && item.roles.includes(user.role)
  );

  const filteredBillingNavigation = billingNavigation.filter(item =>
    user && item.roles.includes(user.role)
  );

  const filteredSettingsNavigation = settingsNavigation.filter(item =>
    user && item.roles.includes(user.role)
  );

  const isLinkActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${mobileOpen ? 'flex fixed inset-0 z-50 w-full' : 'hidden md:flex'} ${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex-col min-h-screen overflow-y-auto transition-all duration-300`}
    >
      {isCollapsed ? (
        <div className="mt-6 ml-4 w-16">
          <div className="text-2xl font-bold">
            <span className="text-[var(--brand-primary)]">L</span>
            <span className="text-gray-900">TT</span>
          </div>
        </div>
      ) : (
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">
              <span className="text-[var(--brand-primary)]">Luxé</span>
              <span className="text-gray-900 ml-1">TimeTravel</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Admin Dashboard</p>
          </div>
          {mobileOpen ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 md:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => setIsPinned(!isPinned)}
              className="p-2 rounded-lg hover:bg-gray-100 hidden md:inline-flex"
              aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            >
              {isPinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
            </button>
          )}
        </div>
      )}
      
      <nav className="px-4 pb-4 space-y-1">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const disabled =
            !isActive || (item.requiredFeature && !hasFeature(item.requiredFeature));
          return (
            <NavLink
              key={item.name}
              to={disabled ? '#' : item.href}
              onClick={() => !disabled && mobileOpen && setMobileOpen(false)}
              className={({ isActive: active }) =>
                `flex items-center ${isCollapsed ? 'justify-center' : ''} px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  active || isLinkActive(item.href)
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                } ${disabled ? 'pointer-events-none opacity-50' : ''}`
              }
              title={isCollapsed ? item.name : ''}
            >
              <Icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
              {!isCollapsed && item.name}
            </NavLink>
          );
        })}

        {filteredBillingNavigation.length > 0 && (
          <div className="pt-4 mt-4 border-t border-gray-200">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Billing
            </div>
            {filteredBillingNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => mobileOpen && setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center ${isCollapsed ? 'justify-center' : ''} px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive || isLinkActive(item.href)
                        ? 'bg-[var(--brand-primary)] text-white'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                  title={isCollapsed ? item.name : ''}
                >
                  <Icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                  {!isCollapsed && item.name}
                </NavLink>
              );
            })}
          </div>
        )}

        {filteredSettingsNavigation.length > 0 && (
          <div className="pt-4 mt-4 border-t border-gray-200">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Settings
            </div>
            {filteredSettingsNavigation.map((item) => {
              const Icon = item.icon;
              const disabled = !isActive;
              return (
                <NavLink
                  key={item.name}
                  to={disabled ? '#' : item.href}
                  onClick={() => !disabled && mobileOpen && setMobileOpen(false)}
                  className={({ isActive: active }) =>
                    `flex items-center ${isCollapsed ? 'justify-center' : ''} px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      active || isLinkActive(item.href)
                        ? 'bg-[var(--brand-primary)] text-white'
                        : 'text-gray-700 hover:bg-gray-50'
                    } ${disabled ? 'pointer-events-none opacity-50' : ''}`
                  }
                  title={isCollapsed ? item.name : ''}
                >
                  <Icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                  {!isCollapsed && item.name}
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
};