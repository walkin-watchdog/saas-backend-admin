import { platformApiRequest, generateIdempotencyKey } from './base';
import type { Plan } from '@/types/platform';

export interface PlanCreateData {
  code: string;
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  billingFrequency: string;
  marketingName: string;
  marketingDescription?: string;
  featureHighlights?: string[];
  public?: boolean;
}

export interface PlanUpdateData extends Partial<Omit<PlanCreateData, 'code'>> {}

function mapPlan(raw: any): Plan {
  const prices = {
    USD: { monthly: 0, yearly: 0 },
    INR: { monthly: 0, yearly: 0 },
  };
  (raw.prices || []).forEach((p: any) => {
    const cur = p.currency as 'USD' | 'INR';
    const period = p.period as 'monthly' | 'yearly';
    if (prices[cur]) prices[cur][period] = p.amountInt;
  });
  return { ...raw, prices } as Plan;
}

export const plansApi = {
  async getAll(): Promise<Plan[]> {
    const res = await platformApiRequest<{ plans: any[] }>('/plans');
    return res.plans.map(mapPlan);
  },

  async getDetails(planId: string): Promise<Plan> {
    const res = await platformApiRequest<any>(`/plans/${planId}`);
    return mapPlan(res);
  },

  async create(data: PlanCreateData): Promise<Plan> {
    const payload = {
      ...data,
      priceMonthlyUsd: Math.round(data.priceMonthlyUsd * 100),
      priceYearlyUsd: Math.round(data.priceYearlyUsd * 100),
      priceMonthlyInr: Math.round(data.priceMonthlyInr * 100),
      priceYearlyInr: Math.round(data.priceYearlyInr * 100),
    };
    const res = await platformApiRequest<any>('/plans', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: generateIdempotencyKey(),
    });
    return mapPlan(res);
  },

  async update(planId: string, data: PlanUpdateData): Promise<Plan> {
    const payload: any = { ...data };
    if (data.priceMonthlyUsd !== undefined) payload.priceMonthlyUsd = Math.round(data.priceMonthlyUsd * 100);
    if (data.priceYearlyUsd !== undefined) payload.priceYearlyUsd = Math.round(data.priceYearlyUsd * 100);
    if (data.priceMonthlyInr !== undefined) payload.priceMonthlyInr = Math.round(data.priceMonthlyInr * 100);
    if (data.priceYearlyInr !== undefined) payload.priceYearlyInr = Math.round(data.priceYearlyInr * 100);
    const res = await platformApiRequest<any>(`/plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      idempotencyKey: generateIdempotencyKey(),
    });
    return mapPlan(res);
  },

  async setActive(planId: string, active: boolean): Promise<Plan> {
    return platformApiRequest(`/plans/${planId}/active`, {
      method: 'POST',
      body: JSON.stringify({ active }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async delete(planId: string): Promise<void> {
    return platformApiRequest(`/plans/${planId}`, {
      method: 'DELETE',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async setPublic(planId: string, isPublic: boolean): Promise<Plan> {
    return platformApiRequest(`/plans/${planId}/public`, {
      method: 'POST',
      body: JSON.stringify({ value: isPublic }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};
