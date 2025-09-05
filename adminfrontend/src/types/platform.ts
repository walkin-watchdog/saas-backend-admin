import type { PlatformRoleCode } from '@/constants/platformRoles';

export interface TotpSetupData {
  password: string;
}

export interface TotpSetupResponse {
  secret: string;
  qr: string;
}

export interface TotpEnableData {
  totp: string;
}

export interface TotpEnableResponse {
  recoveryCodes: string[];
}

export type TotpDisableData =
  | { password: string; totp: string; recoveryCode?: string }
  | { password: string; recoveryCode: string; totp?: string };

export type TotpReauthData =
  | { totp: string; recoveryCode?: string }
  | { recoveryCode: string; totp?: string };

export interface TotpReauthResponse {
  ok: boolean;
  ttlSec: number;
}

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
  lastLoginAt?: string;
  ipAllowlist?: string[];
  ssoSubject?: string;
  roles: PlatformUserRole[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Alias for the full platform user representation including role objects.
 */
export type PlatformUserDetailed = PlatformUser;

/**
 * Platform user representation where roles are represented by their codes.
 * createdAt and updatedAt are optional as some endpoints may omit them.
 */
export type PlatformUserSummary = Omit<PlatformUserDetailed, 'roles' | 'createdAt' | 'updatedAt'> & {
  roles: PlatformRoleCode[];
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Current authenticated platform user. Alias of PlatformUserSummary for clarity.
 */
export type PlatformCurrentUser = PlatformUserSummary;

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

export interface Subscriber {
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
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriberInfo extends Subscriber {
  tenant: {
    name: string;
    status: string;
    createdAt: string;
  };
  subscription?: {
    status: string;
    currency: 'USD' | 'INR';
    price: number;
    plan: {
      marketingName: string;
    };
  };
  usageRecords?: UsageRecord[];
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  meter: string;
  quantity: number;
  unit: string;
  occurredAt: string;
  resourceId?: string;
  metadata?: any;
}

export interface PlatformCouponData {
  code: string;
  type: 'percent' | 'fixed';
  amount?: number;
  amountUsd?: number;
  amountInr?: number;
  currency?: string; // legacy
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number;
  appliesToPlanIds?: string[];
  maxRedemptions?: number;
  redeemBy?: string;
  active?: boolean;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  tenantId: string;
  subscriptionId?: string;
  invoiceId?: string;
  redeemedAt: string;
  redeemedByPlatformUserId?: string;
  amountApplied: number;
  redemptionKey: string;
  redeemedBy?: { name: string; email: string } | null;
}

export interface OrderData {
  tenantId: string;
  type: 'invoice' | 'refund' | 'adjustment';
  gateway: 'razorpay' | 'paypal' | 'manual';
  gatewayRefId?: string;
  status: string;
  total: number;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  metadata?: any;
}

// Add full Order interface that matches the API expectations
export interface Order {
  id: string;
  tenantId: string;
  type: 'invoice' | 'refund' | 'adjustment';
  gateway: 'razorpay' | 'paypal' | 'manual';
  gatewayRefId?: string;
  status: string;
  total: number;
  currency: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface CreditNoteData {
  tenantId: string;
  amount: number;
  currency?: string;
  reason: string;
  invoiceId?: string;
  note?: string;
}

export interface CreditNote {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  reason: string;
  invoiceId?: string;
  note?: string;
  status: 'open' | 'applied' | 'cancelled';
  issuedById: string;
  appliedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
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

export interface KycRecord extends KycRecordData {
  id: string;
  submittedAt: string;
  reviewedById?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImpersonationGrantData {
  tenantId: string;
  reason: string;
  scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
  durationMinutes?: number;
}

export interface PlatformAbandonedCart {
  id: string;
  email?: string;
  planId?: string;
  priceId?: string;
  tenantCode?: string;
  sessionId: string;
  utm?: Record<string, any>;
  lastSeenAt: string;
  reminderCount: number;
  recoveredAt?: string;
  currency: string;
  status: 'open' | 'recovered' | 'discarded';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRequest {
  id: string;
  kind: 'contact' | 'trial' | 'enterprise';
  email: string;
  company?: string;
  message?: string;
  attachments?: any;
  utm?: Record<string, string>;
  status: 'new' | 'in_review' | 'converted' | 'rejected';
  assignedToId?: string;
  assignedTo?: { id: string; name: string; email: string } | null;
  assignedAt?: string;
  convertedTenantId?: string;
  convertedAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequestRecord = Omit<PlatformRequest, 'assignedTo'>;

export interface WebhookDelivery {
  id: string;
  provider: string;
  eventId: string;
  status: 'received' | 'processed' | 'skipped' | 'failed';
  payloadHash: string;
  receivedAt: string;
  processedAt?: string;
  error?: string | null;
}

export interface WebhookEndpoint {
  id: string;
  provider: string;
  kind: string;
  url: string;
  secretMasked?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImpersonationGrant {
  id: string;
  tenantId: string;
  reason: string;
  scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
  issuedById: string;
  issuedBy: {
    id: string;
    name?: string;
    email?: string;
  };
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface GlobalConfig {
  id: string;
  scope: string;
  key: string;
  data?: any;
  secretData?: string;
  source?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  code: string;
  prices: {
    USD: { monthly: number; yearly: number };
    INR: { monthly: number; yearly: number };
  };
  billingFrequency: string;
  marketingName: string;
  marketingDescription: string;
  featureHighlights: string[];
  public: boolean;
  active: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  number: string;
  status: string;
  amount: number;
  currency?: string;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PlatformMetrics {
  mrr: number;
  churnRate: number;
  arpa: number;
  ltv: number;
  newSignups: number;
  conversionRate: number;
  errorSpikes: number;
}

export interface PlanChangeData {
  planId: string;
  prorate?: boolean;
}

export interface TrialExtensionData {
  days: number;
  reason: string;
}

export interface KycSubmission {
  id: string;
  tenantId: string;
  tenantName: string;
  status: 'pending' | 'approved' | 'rejected';
  documents: {
    type: string;
    url: string;
    uploadedAt: string;
  }[];
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface UserLoginHistory {
  id: string;
  createdAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  reason?: string | null;
}