import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { PlatformAbandonedCart } from '@/types/platform';

export interface AbandonedCartFilters extends PaginationParams {
  status?: 'open' | 'recovered' | 'discarded';
  email?: string;
  planId?: string;
  seenSince?: string;
  seenBefore?: string;
}

export interface AbandonedCartStats {
  openCarts: number;
  recoveredCarts: number;
  discardedCarts: number;
  total: number;
  recoveryRate: number;
}

export interface RecoveryLinkResponse {
  recoveryUrl: string;
}

export const abandonedCartsApi = {
  // List abandoned carts with filters
  async list(filters: AbandonedCartFilters = {}): Promise<PaginatedResponse<PlatformAbandonedCart>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ carts: PlatformAbandonedCart[]; pagination: PaginatedResponse<PlatformAbandonedCart>['pagination'] }>(
      `/abandoned-carts${query ? `?${query}` : ''}`
    );
    return { data: res.carts, pagination: res.pagination };
  },

  // Get abandoned cart details
  async getDetails(cartId: string): Promise<PlatformAbandonedCart> {
    return platformApiRequest(`/abandoned-carts/${cartId}`);
  },

  // Send recovery link
  async sendRecoveryLink(cartId: string): Promise<{ recoveryUrl: string }> {
    return platformApiRequest(`/abandoned-carts/${cartId}/recover`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Discard cart
  async discardCart(cartId: string): Promise<PlatformAbandonedCart> {
    return platformApiRequest(`/abandoned-carts/${cartId}/discard`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get statistics overview
  async getStats(): Promise<AbandonedCartStats> {
    return platformApiRequest('/abandoned-carts/stats/overview');
  },
};