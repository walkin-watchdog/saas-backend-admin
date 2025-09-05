import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';

export interface TenantFilters extends PaginationParams {
  status?: 'active' | 'suspended' | 'pending';
  billingStatus?: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  kycStatus?: 'pending' | 'verified' | 'rejected';
  search?: string;
}

export interface OffboardTenantData {
  reason: string;
  scheduledAt?: string;
  retentionDays?: number;
}

export interface RestoreTenantData {
  reason: string;
}

export interface TenantStats {
  total: number;
  active: number;
  suspended: number;
  pending: number;
  recentSignups: number;
  healthScore: number;
}

export const tenantsApi = {
  // List tenants with filters
  async list(filters: TenantFilters = {}): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ tenants: any[]; pagination: PaginatedResponse<any>['pagination'] }>(
      `/tenants${query ? `?${query}` : ''}`
    );
    return { data: res.tenants, pagination: res.pagination };
  },

  // Get tenant stats overview
  async getStatsOverview(): Promise<TenantStats> {
    return platformApiRequest('/tenants/stats/overview');
  },

  // Get single tenant
  async getDetails(tenantId: string): Promise<any> {
    return platformApiRequest(`/tenants/${tenantId}`);
  },

  // Schedule tenant offboarding
  async offboard(tenantId: string, data: OffboardTenantData): Promise<{ message: string; scheduledAt: string; retentionDays: number }> {
    return platformApiRequest(`/tenants/${tenantId}/offboard`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Restore tenant from offboarding
  async restore(tenantId: string, data: RestoreTenantData): Promise<{ message: string }> {
    return platformApiRequest(`/tenants/${tenantId}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Hard delete tenant
  async hardDelete(tenantId: string, reason: string): Promise<{ message: string }> {
    return platformApiRequest(`/tenants/${tenantId}/hard-delete`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Evict dedicated client for tenant
  async evictClient(tenantId: string): Promise<{ ok: boolean }> {
    return platformApiRequest(`/tenants/${tenantId}/evict-client`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};