import { Routes, Route, Navigate } from 'react-router-dom';
import PermissionGuard from '@/components/PermissionGuard';
import PlatformDashboard from './PlatformDashboard';
import PlatformSubscribers from './PlatformSubscribers';
import PlatformCoupons from './PlatformCoupons';
import PlatformOrders from './PlatformOrders';
import PlatformInvoices from './PlatformInvoices';
import PlatformAbandonedCarts from './PlatformAbandonedCarts';
import PlatformRequests from './PlatformRequests';
import PlatformKyc from './PlatformKyc';
import PlatformUsers from './PlatformUsers';
import PlatformImpersonation from './PlatformImpersonation';
import PlatformPlans from './PlatformPlans';
import PlatformWebhooks from './PlatformWebhooks';
import PlatformWebhookEndpoints from './PlatformWebhookEndpoints';
import PlatformAuditLog from './PlatformAuditLog';
import PlatformSettings from './PlatformSettings';
import PlatformDiagnostics from './PlatformDiagnostics';
import PlatformCreditNotes from './PlatformCreditNotes';
import PlatformTenants from './PlatformTenants';
import PlatformTenantDetails from './PlatformTenantDetails';
import PlatformChangePassword from './PlatformChangePassword';
import PlatformMfaSettings from './PlatformMfaSettings';
import PlatformPermissions from './PlatformPermissions';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformRouter() {
  return (
    <Routes>
      <Route
        index
        element={
          <PermissionGuard permission={PERMISSIONS.METRICS.READ}>
            <PlatformDashboard />
          </PermissionGuard>
        }
      />
      <Route
        path="dashboard"
        element={
          <PermissionGuard permission={PERMISSIONS.METRICS.READ}>
            <PlatformDashboard />
          </PermissionGuard>
        }
      />
      
      <Route
        path="subscribers"
        element={
          <PermissionGuard permission={PERMISSIONS.SUBSCRIBERS.READ}>
            <PlatformSubscribers />
          </PermissionGuard>
        }
      />

      <Route
        path="coupons"
        element={
          <PermissionGuard permission={PERMISSIONS.COUPONS.READ}>
            <PlatformCoupons />
          </PermissionGuard>
        }
      />

      <Route
        path="orders"
        element={
          <PermissionGuard permission={PERMISSIONS.ORDERS.READ}>
            <PlatformOrders />
          </PermissionGuard>
        }
      />

      <Route
        path="invoices"
        element={
          <PermissionGuard permission={PERMISSIONS.INVOICES.READ}>
            <PlatformInvoices />
          </PermissionGuard>
        }
      />

      <Route
        path="credit-notes"
        element={
          <PermissionGuard permission={PERMISSIONS.CREDIT_NOTES.READ}>
            <PlatformCreditNotes />
          </PermissionGuard>
        }
      />

      <Route
        path="abandoned-carts"
        element={
          <PermissionGuard permission={PERMISSIONS.ABANDONED_CARTS.READ}>
            <PlatformAbandonedCarts />
          </PermissionGuard>
        }
      />

      <Route
        path="requests"
        element={
          <PermissionGuard permission={PERMISSIONS.REQUESTS.READ}>
            <PlatformRequests />
          </PermissionGuard>
        }
      />

      <Route
        path="kyc"
        element={
          <PermissionGuard permission={PERMISSIONS.KYC.READ}>
            <PlatformKyc />
          </PermissionGuard>
        }
      />

      <Route
        path="users"
        element={
          <PermissionGuard permission={PERMISSIONS.PLATFORM_USERS.READ}>
            <PlatformUsers />
          </PermissionGuard>
        }
      />

      <Route
        path="permissions"
        element={
          <PermissionGuard permission={PERMISSIONS.PERMISSIONS.READ}>
            <PlatformPermissions />
          </PermissionGuard>
        }
      />

      <Route
        path="impersonation"
        element={
          <PermissionGuard permission={PERMISSIONS.IMPERSONATION.READ}>
            <PlatformImpersonation />
          </PermissionGuard>
        }
      />

      <Route
        path="plans"
        element={
          <PermissionGuard permission={PERMISSIONS.PLANS.READ}>
            <PlatformPlans />
          </PermissionGuard>
        }
      />

      <Route
        path="webhooks"
        element={
          <PermissionGuard permission={PERMISSIONS.WEBHOOKS.READ}>
            <PlatformWebhooks />
          </PermissionGuard>
        }
      />

      <Route
        path="webhooks/endpoints"
        element={
          <PermissionGuard permission={PERMISSIONS.WEBHOOKS.READ}>
            <PlatformWebhookEndpoints />
          </PermissionGuard>
        }
      />

      <Route
        path="audit-log"
        element={
          <PermissionGuard permission={PERMISSIONS.AUDIT.READ}>
            <PlatformAuditLog />
          </PermissionGuard>
        }
      />

      <Route
        path="settings"
        element={
          <PermissionGuard permission={PERMISSIONS.CONFIG.READ}>
            <PlatformSettings />
          </PermissionGuard>
        }
      />

      <Route
        path="diagnostics"
        element={
          <PermissionGuard permission={PERMISSIONS.TENANTS.READ}>
            <PlatformDiagnostics />
          </PermissionGuard>
        }
      />

      <Route
        path="tenants"
        element={
          <PermissionGuard permission={PERMISSIONS.TENANTS.READ}>
            <PlatformTenants />
          </PermissionGuard>
        }
      />

      <Route
        path="tenants/:tenantId"
        element={
          <PermissionGuard permission={PERMISSIONS.TENANTS.READ}>
            <PlatformTenantDetails />
          </PermissionGuard>
        }
      />

      <Route
        path="change-password"
        element={<PlatformChangePassword />}
      />
      
      <Route
        path="mfa-settings"
        element={<PlatformMfaSettings />}
      />
      {/* Fallback to dashboard */}
      <Route path="*" element={<Navigate to="/platform" replace />} />
    </Routes>
  );
}