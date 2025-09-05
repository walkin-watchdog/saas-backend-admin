import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { User, LogOut, ChevronDown, X, Lock, Menu } from 'lucide-react';
import { PasswordChangeForm } from '../auth/PasswordChangeForm';
import { useState, useContext } from 'react';
import { MobileMenuContext } from '../../contexts/MobileMenuContext';

export const Header = () => {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { setMobileOpen } = useContext(MobileMenuContext);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Mobile hamburger to open sidebar (re-added) */}
          <button
            className="md:hidden p-2 mr-4 text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Open sidebar"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          {theme?.logoUrl && theme.scope === 'tenant' && (
            <img 
              src={theme.logoUrl} 
              alt="Company Logo" 
              className="h-8 object-contain"
            />
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 text-gray-700 hover:text-gray-900"
            >
              <div className="relative">
                <div className="bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-tertiary)] rounded-full h-10 w-10 flex items-center justify-center shadow-lg ring-2 ring-white">
                  <User className="text-white font-semibold text-sm" />
                </div>
                {/* Online status dot (re-added) */}
                <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-400 border-2 border-white rounded-full"></div>
              </div>
              <span className="text-sm font-medium">{user?.name}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <div className="py-1">
                  {/* ACCOUNT label (re-added) */}
                  <div className="px-4 py-2 border-b text-xs font-medium text-gray-500">
                    ACCOUNT
                  </div>
                  {/* Change Password action (re-added) */}
                  <div
                    onClick={(e) => { e.stopPropagation(); setShowPasswordModal(true); }}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Lock className="h-4 w-4 mr-3 text-gray-500" />
                    Change Password
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <LogOut className="h-4 w-4 mr-3 text-gray-500" />
                    Logout
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <PasswordChangeForm onClose={() => setShowPasswordModal(false)} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};