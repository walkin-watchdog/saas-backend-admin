import type { MobileMenuContextType } from '@/types';
import { createContext, useState } from 'react';

export const MobileMenuContext = createContext<MobileMenuContextType>({
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <MobileMenuContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </MobileMenuContext.Provider>
  );
}