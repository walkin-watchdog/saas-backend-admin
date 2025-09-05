export interface PublicPlan {
  id: string;
  marketingName: string;
  marketingDescription: string;
  featureHighlights: string[];
  billingFrequency: string;
  prices: {
    USD: { monthly: number; yearly: number };
    INR: { monthly: number; yearly: number };
  };
}

export interface PublicSignupRequest {
  companyName: string;
  ownerEmail: string;
  password: string;
  planId: string;
  currency?: 'USD' | 'INR';
  couponCode?: string;
  recovery?: string;
}

export interface PublicSignupResponse {
  tenantId: string;
  ownerUserId: string;
  subscriptionId?: string;
  checkoutUrl?: string;
  idempotent?: boolean;
}

export interface PublicRequestSubmission {
  kind: 'contact' | 'trial' | 'enterprise';
  email: string;
  company?: string;
  message?: string;
  utm?: Record<string, string>;
}

export interface PublicRequestResponse {
  id: string;
}

export interface SignupSessionPing {
  sessionId: string;
  email?: string;
  planId?: string;
  tenantCode?: string;
  utm?: Record<string, string>;
  currency?: 'USD' | 'INR';
}
