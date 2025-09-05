import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginatedResponse, PaginationParams } from './base';
import type { CreditNoteData, CreditNote } from '@/types/platform';

export interface CreditNoteFilters {
  tenantId?: string;
  invoiceId?: string;
  limit?: number;
  offset?: number;
}

export const creditNotesApi = {
  // List credit notes with filters
  async list(filters: CreditNoteFilters = {}): Promise<PaginatedResponse<CreditNote>> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    
    const query = params.toString();
    const res = await platformApiRequest<{ creditNotes: CreditNote[]; pagination: PaginatedResponse<CreditNote>['pagination'] }>(
      `/credit-notes${query ? `?${query}` : ''}`,
    );
    return { data: res.creditNotes, pagination: res.pagination };
  },

  // Create credit note
  async create(data: CreditNoteData): Promise<CreditNote> {
    return platformApiRequest('/credit-notes', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Apply credit note
  async apply(creditNoteId: string): Promise<CreditNote> {
    return platformApiRequest<CreditNote>(`/credit-notes/${creditNoteId}/apply`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Cancel credit note
  async cancel(creditNoteId: string): Promise<CreditNote> {
    return platformApiRequest<CreditNote>(`/credit-notes/${creditNoteId}/cancel`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get credit notes for a specific tenant
  async getByTenant(tenantId: string, params: PaginationParams = {}): Promise<PaginatedResponse<CreditNote>> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        search.append(key, value.toString());
      }
    });
    const query = search.toString();
    const res = await platformApiRequest<{ creditNotes: CreditNote[]; pagination: PaginatedResponse<CreditNote>['pagination'] }>(
      `/credit-notes/tenant/${tenantId}${query ? `?${query}` : ''}`,
    );
    return { data: res.creditNotes, pagination: res.pagination };
  },

  // Export credit notes to CSV
  async exportCsv(filters: CreditNoteFilters = {}): Promise<Blob> {
    const headers: HeadersInit = {};
    const token = sessionStorage.getItem('platform_access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const csrf = sessionStorage.getItem('platform_csrf_token');
    if (csrf) headers['x-csrf-token'] = csrf;

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const query = params.toString();

    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/platform/credit-notes/export/csv${
        query ? `?${query}` : ''
      }`,
      {
        credentials: 'include',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to export credit notes');
    }

    return response.blob();
  },
};
