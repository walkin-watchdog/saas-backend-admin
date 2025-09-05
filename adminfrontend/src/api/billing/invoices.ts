import type { Invoice, InvoiceFilters, InvoicesResponse, PdfTokenResponse } from '@/types/billing';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class InvoicesApi {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = sessionStorage.getItem('admin_token');
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async list(filters: InvoiceFilters = {}): Promise<InvoicesResponse> {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const queryString = params.toString();
    const endpoint = `/billing/invoices${queryString ? `?${queryString}` : ''}`;
    
    return this.request<InvoicesResponse>(endpoint);
  }

  async get(id: string): Promise<Invoice> {
    return this.request<Invoice>(`/billing/invoices/${id}`);
  }

  async createPdfToken(id: string): Promise<PdfTokenResponse> {
    return this.request<PdfTokenResponse>(`/billing/invoices/${id}/pdf-token`, {
      method: 'POST',
    });
  }
}

export const invoicesApi = new InvoicesApi();