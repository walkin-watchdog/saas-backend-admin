import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type {
  SubscriberInfo,
  Subscriber,
  CreditNoteData as BaseCreditNoteData,
  CreditNote,
  CouponRedemption,
  Invoice,
} from '@/types/platform';

export interface SubscriberFilters extends PaginationParams {
  billingStatus?: string;
  kycStatus?: string;
  planId?: string;
  tags?: string[];
  assignedCsmId?: string;
  mrrBand?: string;
  churnRisk?: string;
}

export interface PlanChangeData {
  planId: string;
  scheduleAtPeriodEnd?: boolean;
}

export interface PlanChangePreview {
  amount: number;
  taxAmount: number;
  taxPercent: number;
}

export interface PlanChangeScheduleResult {
  effectiveAt: string;
}

export type CreditNoteData = Omit<BaseCreditNoteData, 'tenantId'>;

export interface TrialExtensionData {
  extensionDays: number;
  reason: string;
}

export interface CouponApplyData {
  couponCode: string;
  amountApplied: number;
  subscriptionId?: string;
  invoiceId?: string;
  planId?: string;
  currency: 'USD' | 'INR';
}

export interface SubscriberUpdateData {
  displayName?: string;
  ownerEmail?: string;
  billingStatus?: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  kycStatus?: 'pending' | 'verified' | 'rejected';
  tags?: string[];
  notes?: string;
  assignedCsmId?: string;
  mrrBand?: string;
  churnRisk?: string;
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

export interface SubscriberInvoice {
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

export const subscribersApi = {
  // List subscribers with filters
  async list(filters: SubscriberFilters = {}): Promise<PaginatedResponse<SubscriberInfo>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else {
          params.append(key, value.toString());
        }
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ subscribers: SubscriberInfo[]; pagination: PaginatedResponse<SubscriberInfo>['pagination'] }>(
      `/subscribers${query ? `?${query}` : ''}`
    );
    return { data: res.subscribers, pagination: res.pagination };
  },

  // Get subscriber details
  async getDetails(tenantId: string): Promise<SubscriberInfo> {
    return platformApiRequest(`/subscribers/${tenantId}`);
  },

  // Get usage history for subscriber
  async getUsageHistory(tenantId: string): Promise<UsageRecord[]> {
    const res = await platformApiRequest<{ usage: UsageRecord[] }>(`/subscribers/${tenantId}/usage-history`);
    return res.usage;
  },

  // Get invoices for subscriber
  async getInvoices(tenantId: string): Promise<SubscriberInvoice[]> {
    const res = await platformApiRequest<{ invoices: SubscriberInvoice[] }>(`/subscribers/${tenantId}/invoices`);
    return res.invoices;
  },

  // Update subscriber general information
  async update(tenantId: string, data: SubscriberUpdateData): Promise<Subscriber> {
    return platformApiRequest(`/subscribers/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Change subscription plan with proration preview
  async previewPlanChange(tenantId: string, data: PlanChangeData): Promise<PlanChangePreview> {
    return platformApiRequest(`/subscribers/${tenantId}/plan/preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Apply plan change
  async changePlan(
    tenantId: string,
    data: PlanChangeData
  ): Promise<Invoice | PlanChangeScheduleResult> {
    return platformApiRequest(`/subscribers/${tenantId}/plan`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Extend trial
  async extendTrial(tenantId: string, data: TrialExtensionData): Promise<{ newTrialEnd: string }> {
    return platformApiRequest(`/subscribers/${tenantId}/trial/extend`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Suspend/Resume subscription
  async suspend(tenantId: string, reason: string): Promise<{ message: string; noop: boolean }> {
    return platformApiRequest(`/subscribers/${tenantId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async resume(tenantId: string, reason: string): Promise<{ message: string }> {
    return platformApiRequest(`/subscribers/${tenantId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Apply coupon
  async applyCoupon(tenantId: string, data: CouponApplyData): Promise<CouponRedemption> {
    return platformApiRequest('/coupons/apply', {
      method: 'POST',
      body: JSON.stringify({ ...data, tenantId }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Issue credit note
  async issueCreditNote(tenantId: string, data: CreditNoteData): Promise<CreditNote> {
    return platformApiRequest(`/subscribers/${tenantId}/credit-notes`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Update subscriber metadata
  async updateTags(tenantId: string, tags: string[]): Promise<Subscriber> {
    return platformApiRequest(`/subscribers/${tenantId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async updateNotes(tenantId: string, notes: string): Promise<Subscriber> {
    return platformApiRequest(`/subscribers/${tenantId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Assign CSM
  async assignCsm(tenantId: string, csmId: string): Promise<Subscriber> {
    return platformApiRequest(`/subscribers/${tenantId}/assign-csm`, {
      method: 'POST',
      body: JSON.stringify({ csmId }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};