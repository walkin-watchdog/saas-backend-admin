import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { Invoice } from '@/types/platform';

export interface InvoiceFilters extends PaginationParams {
  tenantId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface InvoicePdfResponse {
  secureUrl: string;
  expiresAt: string;
}

export const invoicesApi = {
  // List invoices with filters
  async list(filters: InvoiceFilters = {}): Promise<PaginatedResponse<Invoice>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ invoices: Invoice[]; pagination: PaginatedResponse<Invoice>['pagination'] }>(
      `/invoices${query ? `?${query}` : ''}`
    );
    return { data: res.invoices, pagination: res.pagination };
  },

  // Get invoice details
  async getDetails(invoiceId: string): Promise<Invoice> {
    return platformApiRequest(`/invoices/${invoiceId}`);
  },

  // Generate secure PDF URL
  async generatePdfUrl(invoiceId: string): Promise<InvoicePdfResponse> {
    return platformApiRequest(`/invoices/${invoiceId}/pdf-url`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Resend invoice email
  async resendEmail(invoiceId: string): Promise<{ message: string }> {
    return platformApiRequest(`/invoices/${invoiceId}/resend`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Export invoices to CSV
  async exportCsv(filters: InvoiceFilters = {}): Promise<Blob> {
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
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/invoices/export/csv${query ? `?${query}` : ''}`,
      {
        credentials: 'include',
        headers,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to export invoices');
    }
    return response.blob();
  },
};