export interface AttachPaymentMethodBody {
  token: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  name?: string;
}

export interface PaymentMethodDTO {
  id: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  name?: string;
  default: boolean;
}

export interface PriceSnapshot {
  currency: 'USD' | 'INR';
  monthly: number;
  yearly: number;
}

export interface TaxSnapshot {
  percent: number;
  amount: number;
}

// Plan and subscription types
export interface Plan {
  id: string;
  code?: string;
  marketingName: string;
  marketingDescription: string;
  featureHighlights: string[];
  billingFrequency: string;
  prices: {
    USD: { monthly: number; yearly: number };
    INR: { monthly: number; yearly: number };
  };
  public?: boolean;
  active?: boolean;
}

export type PublicPlan = Omit<Plan, 'public' | 'active'> & {
  public?: boolean;
  active?: boolean;
};

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  currency: string;
  status: string;
  platformCustomerId?: string;
  platformSubscriptionId?: string;
  currentPeriodEnd?: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialConvertedAt?: string;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
}

export interface Invoice {
  id: string;
  number: string;
  tenantId: string;
  subscriptionId: string;
  currency: string;
  platformInvoiceId?: string;
  hostedInvoiceUrl?: string;
  amount: number;
  status: string;
  priceSnapshot: PriceSnapshot;
  taxSnapshot: TaxSnapshot;
  planVersion: number;
  taxPercent?: number;
  taxAmount?: number;
  jurisdiction?: string;
  usageAmount?: number;
  createdAt: string;
  subscription?: {
    plan: Plan;
  };
}

export interface CreateSubscriptionRequest {
  planId: string;
  currency?: 'USD' | 'INR';
  provider?: 'razorpay' | 'paypal';
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  status: string;
  providerId?: string;
}

export interface ChangePlanRequest {
  planId: string;
}

export interface ChangePlanResponse {
  invoiceId: string;
  secureUrl?: string;
  expiresAt?: string;
}

export interface CancelSubscriptionRequest {
  reason?: string;
}

export interface SubscriptionActionResponse {
  subscriptionId: string;
  status: string;
}

export interface InvoiceFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface InvoicesResponse {
  invoices: Invoice[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface PdfTokenResponse {
  secureUrl: string;
  expiresAt: string;
}

export interface VerifyMandateRequest {
  provider: 'razorpay' | 'upi' | 'paypal';
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
  subscriptionId?: string;
}

export interface VerifyMandateResponse {
  verified: boolean;
  status?: string;
}