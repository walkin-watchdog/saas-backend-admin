import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { WebhookDelivery, WebhookEndpoint } from '@/types/platform';

export interface WebhookFilters extends PaginationParams {
  provider?: 'razorpay' | 'paypal';
  status?: 'received' | 'processed' | 'skipped' | 'failed';
  startDate?: string;
  endDate?: string;
}

export interface WebhookEndpointFilters {
  provider?: string;
  active?: boolean;
}

export interface WebhookReplayResponse {
  success: boolean;
}

export const webhooksApi = {
  // List webhook endpoints
  async listEndpoints(filters: WebhookEndpointFilters = {}): Promise<WebhookEndpoint[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    const query = params.toString();
    const res = await platformApiRequest<{ endpoints: WebhookEndpoint[] }>(
      `/webhooks${query ? `?${query}` : ''}`
    );
    return res.endpoints;
  },
  // List webhook deliveries with filters
  async listDeliveries(filters: WebhookFilters = {}): Promise<PaginatedResponse<WebhookDelivery>> {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });

    const query = params.toString();
    const res = await platformApiRequest<{ deliveries: WebhookDelivery[]; pagination: PaginatedResponse<WebhookDelivery>['pagination'] }>(
      `/webhooks/deliveries${query ? `?${query}` : ''}`
    );
    return { data: res.deliveries, pagination: res.pagination };
  },

  // Get webhook delivery details
  async getDeliveryDetails(deliveryId: string): Promise<WebhookDelivery> {
    return platformApiRequest<WebhookDelivery>(`/webhooks/deliveries/${deliveryId}`);
  },

  // Replay webhook delivery
  async replayDelivery(deliveryId: string): Promise<WebhookReplayResponse> {
    return platformApiRequest<WebhookReplayResponse>(`/webhooks/deliveries/${deliveryId}/replay`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get webhook statistics
  async getStats(): Promise<{
    total: number;
    processed: number;
    failed: number;
    pending: number;
    successRate: number;
  }> {
    return platformApiRequest('/webhooks/stats');
  },
};
