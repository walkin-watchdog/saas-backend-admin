import type { PublicPlan } from '@/types/billing';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class PlansApi {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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

  async getPublicPlans(): Promise<PublicPlan[]> {
    return this.request<PublicPlan[]>('/public/plans');
  }

  async getPlanDetails(planId: string): Promise<PublicPlan> {
    return this.request<PublicPlan>('/public/plans/select', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  }
}

export const plansApi = new PlansApi();