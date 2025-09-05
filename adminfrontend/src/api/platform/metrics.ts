import { platformApiRequest } from './base';

export interface MetricsFilters {
  startDate?: string;
  endDate?: string;
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export interface DashboardMetrics {
  timeframe: string;
  tenants: {
    total: number;
    active: number;
    newSignups: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    pastDue: number;
  };
  revenue: {
    total: Record<string, number>;
    period: string;
    mrr: Record<string, number>;
    churnRate: number;
    arpa: Record<string, number>;
    ltv: Record<string, number>;
    periodChange: {
      current: Record<string, number>;
      previous: Record<string, number>;
      percentage: Record<string, number>;
    };
    timeSeriesData: {
      revenue: Record<string, number[]>;
      signups: number[];
      mrr: Array<Record<string, number>>;
      churn: number[];
    };
  };
  requests: {
    new: number;
    converted: number;
    conversionRate: number;
  };
  abandonedCarts: number;
  errorSpikes: number;
}

export interface RevenueMetrics {
  timeframe: 'day' | 'week' | 'month';
  currentPeriod: { revenue: Record<string, number>; startDate: string; endDate: string };
  previousPeriod: { revenue: Record<string, number>; startDate: string; endDate: string };
  growth: Record<string, number>;
  mrr: Record<string, number>;
  churnRate: number;
  arpa: Record<string, number>;
  ltv: Record<string, number>;
  failures: number;
}

export interface ChurnAnalysis {
  churnRate: number;
  voluntaryChurn: number;
  involuntaryChurn: number;
  churnedRevenue: number;
  reasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  cohortAnalysis: Array<{
    cohort: string;
    period0: number;
    period1: number;
    period2: number;
    period3: number;
    period6: number;
    period12: number;
  }>;
}

export interface ConversionFunnel {
  stages: Array<{
    stage: string;
    count: number;
    conversionRate: number;
    dropoffRate: number;
  }>;
  totalLeads: number;
  totalConversions: number;
  overallConversionRate: number;
}

export const metricsApi = {
  // Get dashboard overview metrics (simplified to match backend)
  async getDashboardMetrics(timeframe: 'day' | 'week' | 'month' = 'month'): Promise<DashboardMetrics> {
    return platformApiRequest(`/metrics/dashboard?timeframe=${timeframe}`);
  },

  // Get revenue metrics
  async getRevenueMetrics(timeframe: 'day' | 'week' | 'month' = 'month'): Promise<RevenueMetrics> {
    return platformApiRequest(`/metrics/revenue?timeframe=${timeframe}`);
  },

  // Get growth metrics
  async getGrowthMetrics(days: number = 30): Promise<any> {
    return platformApiRequest(`/metrics/growth?days=${days}`);
  },

  // Get tenant health overview
  async getTenantHealth(): Promise<any> {
    return platformApiRequest('/metrics/tenants/health');
  },
};