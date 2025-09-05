import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginatedResponse } from './base';
import type { PlatformCouponData, CouponRedemption } from '@/types/platform';

export interface CouponFilters {
  active?: boolean;
  type?: 'percent' | 'fixed';
  planId?: string;
  limit?: number;
  offset?: number;
}

export interface CouponPreview {
  valid: boolean;
  discount: number;
  finalAmount: number;
}

export interface CouponValidation {
  valid: boolean;
  coupon?: PlatformCouponData & { id: string };
  error?: string;
}

export interface CouponCreateData extends PlatformCouponData {}

export interface CouponUpdateData extends Partial<Omit<PlatformCouponData, 'code'>> {}

export const couponsApi = {
  // List coupons with filters
  async list(filters: CouponFilters = {}): Promise<PaginatedResponse<PlatformCouponData & { id: string }>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{
      coupons: (PlatformCouponData & { id: string })[];
      pagination: PaginatedResponse<PlatformCouponData & { id: string }>['pagination'];
    }>(`/coupons${query ? `?${query}` : ''}`);
    return { data: res.coupons, pagination: res.pagination };
  },

  // Create new coupon
  async create(data: CouponCreateData): Promise<PlatformCouponData & { id: string }> {
    return platformApiRequest('/coupons', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Update coupon
  async update(couponId: string, data: CouponUpdateData): Promise<PlatformCouponData & { id: string }> {
    return platformApiRequest(`/coupons/${couponId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Activate/Deactivate coupon
  async activate(couponId: string): Promise<PlatformCouponData & { id: string }> {
    return platformApiRequest(`/coupons/${couponId}/activate`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async deactivate(couponId: string): Promise<PlatformCouponData & { id: string }> {
    return platformApiRequest(`/coupons/${couponId}/deactivate`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Validate coupon
  async validate(data: { code: string; planId?: string; subscriptionId?: string }): Promise<CouponValidation> {
    return platformApiRequest('/coupons/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Preview coupon application
  async preview(data: { couponCode: string; planId: string; amount: number; subscriptionId?: string; currency?: 'USD' | 'INR' }): Promise<CouponPreview> {
    return platformApiRequest('/coupons/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Apply coupon to subscription
  async apply(data: { couponCode: string; tenantId: string; amountApplied: number; subscriptionId?: string; invoiceId?: string; planId?: string; currency?: 'USD' | 'INR' }): Promise<CouponRedemption> {
    return platformApiRequest('/coupons/apply', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get coupon usage analytics
  async getUsage(couponId: string): Promise<CouponRedemption[]> {
    return platformApiRequest(`/coupons/${couponId}/usage`);
  },
};
