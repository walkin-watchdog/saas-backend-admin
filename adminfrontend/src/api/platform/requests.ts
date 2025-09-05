import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { PlatformRequest, RequestRecord } from '@/types/platform';

export interface RequestFilters extends PaginationParams {
  kind?: 'contact' | 'trial' | 'enterprise';
  status?: 'new' | 'in_review' | 'converted' | 'rejected';
  assignedToId?: string;
}

export interface ConvertRequestData {
  companyName: string;
  planId: string;
  ownerPassword: string;
}

export interface AssignRequestData {
  assignedToId: string;
}

export interface UpdateRequestStatusData {
  status: 'new' | 'in_review' | 'converted' | 'rejected';
}

export interface RequestTimeline {
  id: string;
  action: string;
  platformUserId: string;
  createdAt: string;
  details?: any;
}

export const requestsApi = {
  // List requests with filters
  async list(filters: RequestFilters = {}): Promise<PaginatedResponse<PlatformRequest>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ requests: PlatformRequest[]; pagination: { limit: number; offset: number; } }>(`/requests${query ? `?${query}` : ''}`);
    
    return {
      data: res.requests,
      pagination: res.pagination
    };
  },

  // Get request details  
  async getDetails(requestId: string): Promise<PlatformRequest> {
    return platformApiRequest(`/requests/${requestId}`);
  },

  // Assign request to platform user
  async assign(requestId: string, data: AssignRequestData): Promise<RequestRecord> {
    return platformApiRequest(`/requests/${requestId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Convert request to tenant
  async convert(
    requestId: string,
    data: ConvertRequestData
  ): Promise<{ request: RequestRecord; tenant: { id: string; name: string; status: string } }> {
    return platformApiRequest(`/requests/${requestId}/convert`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Update request status
  async updateStatus(requestId: string, data: UpdateRequestStatusData): Promise<RequestRecord> {
    return platformApiRequest(`/requests/${requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Reject request
  async reject(requestId: string, reason: string): Promise<RequestRecord> {
    return platformApiRequest(`/requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

};