export interface PlatformUserRole {
  role: {
    code: string;
    name: string;
    description: string;
  };
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  mfaEnabled: boolean;
  lastLoginAt?: Date;
  ipAllowlist?: string[];
  ssoSubject?: string;
  roles: PlatformUserRole[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformAuthTokenPayload {
  sub: string; // platformUserId
  email: string;
  roles: string[];
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
}

export interface ImpersonationTokenPayload {
  sub: string; // platformUserId
  tenantId: string;
  scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
  reason: string;
  grantId: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface SubscriberInfo {
  tenantId: string;
  displayName: string;
  ownerEmail: string;
  billingStatus: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  kycStatus: 'pending' | 'verified' | 'rejected';
  tags: string[];
  notes?: string;
  assignedCsmId?: string;
  mrrBand?: string;
  churnRisk?: string;
  tenant: {
    name: string;
    status: string;
    createdAt: Date;
  };
  subscription?: {
    status: string;
    currency: string;
    price: number;
    plan: {
      marketingName: string;
    };
  };
  usageRecords?: import('@prisma/client').UsageRecord[];
}

export interface PlatformCouponData {
  code: string;
  type: 'percent' | 'fixed';
  amount?: number;
  amountUsd?: number;
  amountInr?: number;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number;
  appliesToPlanIds?: string[];
  maxRedemptions?: number;
  redeemBy?: Date;
  active?: boolean;
}

export interface OrderData {
  tenantId: string;
  type: 'invoice' | 'refund' | 'adjustment';
  gateway: 'razorpay' | 'paypal' | 'manual';
  gatewayRefId?: string;
  status: string;
  total: number;
  currency?: string;
  periodStart?: Date;
  periodEnd?: Date;
  metadata?: any;
}

export interface CreditNoteData {
  tenantId: string;
  amount: number;
  currency: string;
  reason: string;
  invoiceId?: string;
  note?: string;
}

export interface RequestFormData {
  kind: 'contact' | 'trial' | 'enterprise';
  email: string;
  company?: string;
  message?: string;
  attachments?: any;
  utm?: Record<string, string>;
}

export interface KycRecordData {
  tenantId: string;
  status: 'pending' | 'verified' | 'rejected';
  provider?: string;
  refId?: string;
  notes?: string;
}

export interface ImpersonationGrantData {
  tenantId: string;
  reason: string;
  scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
  durationMinutes?: number;
}

export interface AuditLogEntry {
  platformUserId?: string;
  tenantId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  requestId?: string;
}