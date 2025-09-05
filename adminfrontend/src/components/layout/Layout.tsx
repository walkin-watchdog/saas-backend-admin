import React, { useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BillingBanner } from '../billing/BillingBanner';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme?.colors) {
      document.documentElement.style.setProperty('--brand-primary', theme.colors.primary);
      document.documentElement.style.setProperty('--brand-secondary', theme.colors.secondary);
      document.documentElement.style.setProperty('--brand-tertiary', theme.colors.tertiary);
    }
    if (theme?.logoUrl) {
      document.documentElement.style.setProperty('--brand-logo-url', `url(${theme.logoUrl})`);
    }
  }, [theme]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
        <BillingBanner />
          {children}
        </main>
      </div>
    </div>
  );
};