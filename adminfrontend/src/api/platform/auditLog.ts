import { platformApiRequest } from './base';
import type { PaginationParams, PaginatedResponse } from './base';

export interface AuditLogFilters extends PaginationParams {
  action?: string;
  resource?: string;
  platformUserId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  tenantId?: string;
  platformUserId: string;
  createdAt: string;
  changes?: any;
  metadata?: any;
}

export const auditLogApi = {
  async list(filters: AuditLogFilters = {}): Promise<PaginatedResponse<AuditLogEntry>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const query = params.toString();
    const res = await platformApiRequest<{ logs: AuditLogEntry[]; pagination: PaginatedResponse<AuditLogEntry>['pagination'] }>(
      `/audit-log${query ? `?${query}` : ''}`
    );
    return { data: res.logs, pagination: res.pagination };
  },

  async getById(id: string): Promise<AuditLogEntry> {
    return platformApiRequest(`/audit-log/${id}`);
  },

  async exportCsv(filters: AuditLogFilters = {}): Promise<Blob> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const query = params.toString();
    const headers: HeadersInit = {};
    const token = sessionStorage.getItem('platform_access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const csrf = sessionStorage.getItem('platform_csrf_token');
    if (csrf) headers['x-csrf-token'] = csrf;
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/audit-log/export/csv${query ? `?${query}` : ''}`,
      {
        credentials: 'include',
        headers,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to export audit logs');
    }
    return response.blob();
  }
};