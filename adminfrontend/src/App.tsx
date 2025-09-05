import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { ProductForm } from './pages/ProductForm';
import { ProductPreview } from './pages/ProductPreview';
import { AbandonedCarts } from './pages/AbandonedCarts';
import { ManualBooking } from './pages/ManualBooking';
import { Availability } from './pages/Availability';
import { UserManagement } from './pages/UserManagement';
import { Coupons } from './pages/Coupons';
import { Bookings } from './pages/Bookings';
import { NewsletterAdmin } from './pages/NewsletterAdmin';
import { DestinationsAdmin } from './pages/DestinationsAdmin';
import { AttractionsAdmin } from './pages/AttractionsAdmin';
import { ExperienceCategoriesAdmin } from './pages/ExperienceCategoriesAdmin';
import { Requests } from './pages/Requests';
import { ToasterProvider } from './components/ui/toaster';
import { PlatformAuthProvider } from './contexts/PlatformAuthContext';
import PlatformLogin from './pages/platform/PlatformLogin';
import PlatformLayout from './pages/platform/PlatformLayout';
import PlatformRouter from './pages/platform/PlatformRouter';
import PlatformAcceptInvite from './pages/platform/PlatformAcceptInvite';
import { Toaster } from './components/ui/toast';
import { Gallery } from './pages/Gallery';
import { ContentIndex } from './pages/content/ContentIndex';
import { NotFound } from './pages/NotFound';
import { GetStarted } from './pages/GetStarted';
import { BookingDetails } from './pages/BookingDetails'
import { Proposals } from './pages/Proposals';
import { ProposalEditor } from './pages/ProposalEditor';
import { IntegrationSettings } from './pages/IntegrationSettings';
import { BrandSettings } from './pages/BrandSettings';
import { ThemeProvider } from './hooks/useTheme';
import { Plans } from './pages/billing/Plans';
import { PlansAndSubscriptions } from './pages/billing/PlansAndSubscriptions';
import { Invoices } from './pages/billing/Invoices';
import { Usage } from './pages/billing/Usage';
import { PaymentMethods } from './pages/billing/PaymentMethods';
import { setupPreconditionInterceptor } from './utils/preconditionHandler';
import { TwoFactorSetup } from './pages/TwoFactorSetup';
import { TenantStepUpAuth } from './components/ui/TenantStepUpAuth';
import OAuth2fa from './pages/OAuth2fa';

function PreconditionWrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const stepUpPromise = useRef<{ resolve: () => void; reject: (reason?: any) => void } | null>(null);

  useEffect(() => {
    const cleanup = setupPreconditionInterceptor(navigate, () => {
      setStepUpOpen(true);
      return new Promise<void>((resolve, reject) => {
        stepUpPromise.current = { resolve, reject };
      });
    });
    return cleanup;
  }, [navigate]);

  const handleClose = () => {
    stepUpPromise.current?.reject(new Error('STEP_UP_CANCELLED'));
    stepUpPromise.current = null;
    setStepUpOpen(false);
  };

  const handleSuccess = () => {
    stepUpPromise.current?.resolve();
    stepUpPromise.current = null;
    setStepUpOpen(false);
  };

  return (
    <>
      {children}
      <TenantStepUpAuth isOpen={stepUpOpen} onClose={handleClose} onSuccess={handleSuccess} />
    </>
  );
}

function AdminCheckRoute({ children }: { children: React.ReactElement }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/auth/check-admin`
        );
        const { exists } = await res.json();
        if (exists && !cancelled) {
          navigate('/404', { replace: true });
        } else if (!cancelled) {
          setAllowed(true);
        }
      } catch {
        if (!cancelled) setAllowed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (allowed === null) return null;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <PlatformAuthProvider>
        <ThemeProvider token={null}>
          <ToasterProvider>
            <Router>
              <PreconditionWrapper>
                <div className="min-h-screen bg-gray-50">
                  <Routes>
                  {/* Platform Admin Routes */}
                  <Route path="/platform/login" element={<PlatformLogin />} />
                  <Route path="/platform/accept-invite/:token" element={<PlatformAcceptInvite />} />
                  <Route path="/oauth/2fa" element={<OAuth2fa />} />
                  <Route path="/platform/*" element={
                    <PlatformLayout>
                      <PlatformRouter />
                    </PlatformLayout>
                  } />

                  {/* Existing routes */}
                  <Route
                    path="/get-started"
                    element={
                      <AdminCheckRoute>
                        <GetStarted />
                      </AdminCheckRoute>
                    }
                  />
                  <Route path="/login" element={<Login />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/oauth/verify" element={<Navigate to="/oauth/2fa" replace />} />
                  <Route path="/" element={
                    <ProtectedRoute>
                      <Layout>
                          <Dashboard />
                        </Layout>
                    </ProtectedRoute>
                  } />
                <Route path="/products" element={
                  <ProtectedRoute>
                    <Layout>
                        <Products />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/products/new" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR']}>
                    <Layout>
                        <ProductForm />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/products/:id/edit" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR']}>
                    <Layout>
                        <ProductForm />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/products/:id/preview" element={
                  <ProtectedRoute>
                    <Layout>
                        <ProductPreview />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/settings/integrations" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <IntegrationSettings />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/settings/brand" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR']}>
                    <Layout>
                        <BrandSettings />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/settings/security" element={
                  <ProtectedRoute>
                    <Layout>
                        <TwoFactorSetup />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/availability" element={
                  <ProtectedRoute>
                    <Layout>
                        <Availability />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/coupons" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR']}>
                    <Layout>
                        <Coupons />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/bookings" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR', 'VIEWER']}>
                    <Layout>
                        <Bookings />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/bookings/new" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR']}>
                    <Layout>
                        <ManualBooking />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/bookings/:id/details" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR', 'VIEWER']}>
                    <Layout>
                        <BookingDetails/>
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/proposals" element={
                  <ProtectedRoute>
                    <Layout>
                        <Proposals />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/proposals/new" element={
                  <ProtectedRoute requiredRoles={['ADMIN','EDITOR']}>
                    <Layout>
                        <ProposalEditor />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/proposals/:id/edit" element={
                  <ProtectedRoute requiredRoles={['ADMIN','EDITOR']}>
                    <Layout>
                        <ProposalEditor />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/requests" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR', 'VIEWER']}>
                    <Layout>
                        <Requests />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/user-management" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <UserManagement />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/newsletter" element={
                  <ProtectedRoute requiredRoles={['ADMIN', 'EDITOR', 'VIEWER']}>
                    <Layout>
                        <NewsletterAdmin />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/destinations-admin" element={
                  <ProtectedRoute>
                    <Layout>
                        <DestinationsAdmin />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/experience-categories" element={
                  <ProtectedRoute>
                    <Layout>
                        <ExperienceCategoriesAdmin />
                      </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/attractions-admin" element={
                  <ProtectedRoute>
                    <Layout>
                        <AttractionsAdmin />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/content" element={
                  <ProtectedRoute>
                    <Layout>
                        <ContentIndex />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/gallery" element={
                  <ProtectedRoute>
                    <Layout>
                        <Gallery />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/billing/plans" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <Plans />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/billing/plans-and-subscriptions" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <PlansAndSubscriptions />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/billing/invoices" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <Invoices />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/billing/usage" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <Usage />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/billing/payment-methods" element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Layout>
                        <PaymentMethods />
                      </Layout>
                  </ProtectedRoute>
                } />
                <Route path="/abandoned-carts" element={
                  <ProtectedRoute>
                    <Layout>
                        <AbandonedCarts />
                      </Layout>
                  </ProtectedRoute>
                } />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </div>
              </PreconditionWrapper>
            </Router>
          </ToasterProvider>
          <Toaster />
        </ThemeProvider>
      </PlatformAuthProvider>
    </AuthProvider>
  );
}

export default App;
