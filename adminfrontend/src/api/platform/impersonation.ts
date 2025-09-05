import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { ImpersonationGrant, ImpersonationGrantData } from '@/types/platform';

/** Filters for listing impersonation grants.
 *
 * The API currently supports filtering by `tenantId` and `platformUserId`.
 */
export interface ImpersonationFilters extends PaginationParams {
  /** Filter grants issued for a specific tenant. */
  tenantId?: string;
  /** Filter grants created by a specific platform user. */
  platformUserId?: string;
}

export interface ImpersonationLinkResponse {
  token: string;
  loginUrl: string;
  expiresAt: string;
  grantId: string;
}

export const impersonationApi = {
  // Create impersonation grant
  async createGrant(data: ImpersonationGrantData): Promise<ImpersonationLinkResponse> {
    return platformApiRequest('/impersonate', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // List active impersonation grants
  async listGrants(filters: ImpersonationFilters = {}): Promise<PaginatedResponse<ImpersonationGrant>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{
      grants: ImpersonationGrant[];
      pagination: PaginatedResponse<ImpersonationGrant>['pagination'];
    }>(`/impersonate/grants${query ? `?${query}` : ''}`);
    return { data: res.grants, pagination: res.pagination };
  },

  // Revoke impersonation grant
  async revokeGrant(grantId: string, reason: string): Promise<{ message: string }> {
    return platformApiRequest(`/impersonate/grants/${grantId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get impersonation history for a tenant
  async getHistory(tenantId: string): Promise<ImpersonationGrant[]> {
    const res = await platformApiRequest<{ history: ImpersonationGrant[] }>(
      `/impersonate/tenants/${tenantId}/history`
    );
    return res.history;
  },
};