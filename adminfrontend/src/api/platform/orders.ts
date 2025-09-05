import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { Order } from '@/types/platform';

export interface OrderFilters extends PaginationParams {
  tenantId?: string;
  type?: 'invoice' | 'refund' | 'adjustment';
  gateway?: 'razorpay' | 'paypal' | 'manual';
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface RefundData {
  amount: number;
  reason: string;
}

export interface AdjustmentData {
  tenantId: string;
  amount: number;
  currency?: string;
  reason: string;
  metadata?: any;
}

export const ordersApi = {
  async list(filters: OrderFilters = {}): Promise<PaginatedResponse<Order>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const query = params.toString();
    const res = await platformApiRequest<{ orders: Order[]; pagination: PaginatedResponse<Order>['pagination'] }>(
      `/orders${query ? `?${query}` : ''}`
    );
    return { data: res.orders, pagination: res.pagination };
  },

  // Get single order details
  async getDetails(orderId: string): Promise<Order> {
    return platformApiRequest(`/orders/${orderId}`);
  },

  async createAdjustment(data: AdjustmentData): Promise<Order> {
    return platformApiRequest('/orders/adjustment', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async refund(orderId: string, data: RefundData): Promise<Order> {
    return platformApiRequest(`/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  }
};