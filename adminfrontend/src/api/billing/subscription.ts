import type {
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  ChangePlanRequest,
  ChangePlanResponse,
  CancelSubscriptionRequest,
  SubscriptionActionResponse,
  Subscription
} from '@/types/billing';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class SubscriptionApi {
  private current: Subscription | null = null;

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

    return response.json();
  }

  async create(
    body: CreateSubscriptionRequest,
    idempotencyKey?: string
  ): Promise<CreateSubscriptionResponse> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    this.current = null;
    return this.request<CreateSubscriptionResponse>(
      '/billing/subscription/create',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      headers
    );
  }

  async changePlan(
    body: ChangePlanRequest,
    idempotencyKey?: string
  ): Promise<ChangePlanResponse> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    this.current = null;
    return this.request<ChangePlanResponse>(
      '/billing/subscription/change-plan',
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
      headers
    );
  }

  async cancel(
    body: CancelSubscriptionRequest = {},
    idempotencyKey?: string
  ): Promise<SubscriptionActionResponse> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    this.current = null;
    return this.request<SubscriptionActionResponse>(
      '/billing/subscription/cancel',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      headers
    );
  }

  async resume(idempotencyKey?: string): Promise<SubscriptionActionResponse> {
    const headers: Record<string, string> = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    this.current = null;
    return this.request<SubscriptionActionResponse>(
      '/billing/subscription/resume',
      {
        method: 'POST',
      },
      headers
    );
  }

  async getCurrent(useCache = true): Promise<Subscription | null> {
    if (useCache && this.current) return this.current;
    try {
      const data = await this.request<Subscription>(
        '/billing/subscription/current'
      );
      this.current = data;
      return data;
    } catch {
      this.current = null;
      throw new Error('Failed to fetch subscription');
    }
  }
}

export const subscriptionApi = new SubscriptionApi();