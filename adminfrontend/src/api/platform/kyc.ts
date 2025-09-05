import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { KycRecordData, KycRecord } from '@/types/platform';

export interface KycFilters extends PaginationParams {
  status?: 'pending' | 'verified' | 'rejected';
  provider?: string;
  tenantId?: string;
}

export interface KycReviewData {
  status: 'verified' | 'rejected';
  notes?: string;
}

export const kycApi = {
  // List KYC records with filters
  async list(filters: KycFilters = {}): Promise<PaginatedResponse<KycRecord>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{
      records: KycRecord[];
      pagination: PaginatedResponse<KycRecord>['pagination'];
    }>(`/kyc${query ? `?${query}` : ''}`);
    return { data: res.records, pagination: res.pagination };
  },

  // Get KYC record details
  async getDetails(kycId: string): Promise<KycRecord> {
    return platformApiRequest(`/kyc/${kycId}`);
  },

  // Review KYC record (approve/reject)
  async review(kycId: string, data: KycReviewData): Promise<KycRecord> {
    return platformApiRequest(`/kyc/${kycId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Check KYC verification status for a tenant
  async getTenantStatus(tenantId: string): Promise<{ tenantId: string; kycVerified: boolean }> {
    return platformApiRequest(`/kyc/tenant/${tenantId}/status`);
  },

  // Get latest KYC record for a tenant
  async getLatestForTenant(tenantId: string): Promise<KycRecord> {
    return platformApiRequest(`/kyc/tenant/${tenantId}`);
  },

  // Create KYC record
  async create(data: KycRecordData): Promise<KycRecord> {
    return platformApiRequest('/kyc', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get KYC queue statistics
  async getStats(): Promise<{
    submitted: number;
    approved: number;
    rejected: number;
  }> {
    return platformApiRequest('/kyc/stats/overview');
  },
};