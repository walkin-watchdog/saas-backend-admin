import type { PaymentMethodDTO, AttachPaymentMethodBody, VerifyMandateRequest, VerifyMandateResponse } from '@/types/billing';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class PaymentMethodsApi {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    headers: Record<string, string> = {}
  ): Promise<T> {
    const token = sessionStorage.getItem('admin_token');
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
        ...options.headers,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async list(): Promise<PaymentMethodDTO[]> {
    return this.request<PaymentMethodDTO[]>('/billing/payment-methods');
  }

  async attach(
    body: AttachPaymentMethodBody,
    idempotencyKey?: string
  ): Promise<{ id: string }> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    return this.request<{ id: string }>(
      '/billing/payment-methods/attach',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      headers
    );
  }

  async update(
    id: string,
    body: { default?: boolean; name?: string },
    idempotencyKey?: string
  ): Promise<{ id: string }> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    return this.request<{ id: string }>(
      `/billing/payment-methods/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      headers
    );
  }

  async detach(id: string, idempotencyKey?: string): Promise<void> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    await this.request<void>(
      `/billing/payment-methods/${id}`,
      { method: 'DELETE' },
      headers
    );
  }

  async verifyMandate(body: VerifyMandateRequest): Promise<VerifyMandateResponse> {
    return this.request<VerifyMandateResponse>(
      '/billing/payment-methods/verify-mandate',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }
}

export const paymentMethodsApi = new PaymentMethodsApi();