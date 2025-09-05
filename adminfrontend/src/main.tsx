import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css'
import App from './App.tsx'
import { MobileMenuProvider } from './contexts/MobileMenuContext';
import { queryClient } from './lib/queryClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MobileMenuProvider>
        <App />
      </MobileMenuProvider>
    </QueryClientProvider>
  </StrictMode>,
)