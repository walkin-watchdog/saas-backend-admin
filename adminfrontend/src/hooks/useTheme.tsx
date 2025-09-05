import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { ThemeConfig } from '@/types/config';
import type { ReactNode } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const API_ROOT = API_BASE.replace(/\/api\/?$/, '');

// Theme context for sharing theme data across components
const ThemeContext = createContext<{
  theme: ThemeConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshTheme: () => Promise<void>;
}>({
  theme: null,
  isLoading: false,
  error: null,
  refreshTheme: async () => {}
});

export const useTheme = () => useContext(ThemeContext);

// Hook for login page theming (public endpoint)
export const usePublicTheme = () => {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(`${API_ROOT}/public/branding`, {
          headers: {
            'Cache-Control': 'max-age=60'
          }
        });
        
        if (response.ok) {
          const themeData = await response.json();
          setTheme(themeData);
          
          // Apply CSS custom properties for immediate theming
          if (themeData.colors) {
            document.documentElement.style.setProperty('--brand-primary', themeData.colors.primary);
            document.documentElement.style.setProperty('--brand-secondary', themeData.colors.secondary);
            document.documentElement.style.setProperty('--brand-tertiary', themeData.colors.tertiary);
          }
        }
      } catch (err) {
        setError('Failed to load theme');
        console.warn('Theme loading failed, using defaults:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTheme();
  }, []);

  return { theme, isLoading, error };
};

// Hook for authenticated admin theming
export const useAuthenticatedTheme = (token: string | null) => {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTheme = useCallback(async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/tenant/branding`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const themeData = await response.json();
        setTheme(themeData);
        
        // Apply CSS custom properties for admin UI theming
        if (themeData.colors) {
          document.documentElement.style.setProperty('--brand-primary', themeData.colors.primary);
          document.documentElement.style.setProperty('--brand-secondary', themeData.colors.secondary);
          document.documentElement.style.setProperty('--brand-tertiary', themeData.colors.tertiary);
        }
        
        // Apply logo if available
        if (themeData.logoUrl) {
          document.documentElement.style.setProperty('--brand-logo-url', `url(${themeData.logoUrl})`);
        }
      }
    } catch (err) {
      setError('Failed to load admin theme');
      console.warn('Admin theme loading failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshTheme();
  }, [refreshTheme]);

  return { theme, isLoading, error, refreshTheme };
};

// Theme provider component
export const ThemeProvider = ({ children, token }: { children: ReactNode; token: string | null }) => {
  const { token: authToken } = useAuth();
  const actualToken = token || authToken;
  const { theme, isLoading, error, refreshTheme } = useAuthenticatedTheme(actualToken);

  return (
    <ThemeContext.Provider value={{ theme, isLoading, error, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};