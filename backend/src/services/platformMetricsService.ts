import { prisma } from '../utils/prisma';
import { SubscriptionService } from './subscriptionService';

export class PlatformMetricsService {
  static async getDashboardMetrics(timeframe: 'day' | 'week' | 'month' = 'month') {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [
      totalTenants,
      activeTenants,
      newSignups,
      totalSubscriptions,
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      newRequests,
      convertedRequests,
      abandonedCarts
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.tenant.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'trialing' } }),
      prisma.subscription.count({ where: { status: 'past_due' } }),
      prisma.requestFormSubmission.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.requestFormSubmission.count({
        where: {
          status: 'converted',
          convertedAt: { gte: startDate }
        }
      }),
      prisma.platformAbandonedCart.count({
        where: {
          status: 'open',
          lastSeenAt: { gte: startDate }
        }
      })
    ]);
    const revenueMetrics = await this.getRevenueMetrics(timeframe);
    const dailyData = await this.getGrowthMetrics(30);

    const currencySet = new Set<string>([
      ...Object.keys(revenueMetrics.currentPeriod.revenue),
      ...dailyData.flatMap((d) => Object.keys(d.revenue)),
    ]);
    const revenueTimeSeries: Record<string, number[]> = {};
    currencySet.forEach((c) => {
      revenueTimeSeries[c] = dailyData.map((d) => d.revenue[c] || 0);
    });

    return {
      timeframe,
      tenants: {
        total: totalTenants,
        active: activeTenants,
        newSignups
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        trialing: trialingSubscriptions,
        pastDue: pastDueSubscriptions
      },
      revenue: {
        total: revenueMetrics.currentPeriod.revenue,
        period: timeframe,
        mrr: revenueMetrics.mrr,
        churnRate: revenueMetrics.churnRate,
        arpa: revenueMetrics.arpa,
        ltv: revenueMetrics.ltv,
        periodChange: {
          current: revenueMetrics.currentPeriod.revenue,
          previous: revenueMetrics.previousPeriod.revenue,
          percentage: revenueMetrics.growth
        },
        timeSeriesData: {
          revenue: revenueTimeSeries,
          signups: dailyData.map(g => g.signups),
          mrr: dailyData.map(() => revenueMetrics.mrr),
          churn: dailyData.map(() => revenueMetrics.churnRate)
        }
      },
      requests: {
        new: newRequests,
        converted: convertedRequests,
        conversionRate: newRequests > 0 ? (convertedRequests / newRequests) * 100 : 0
      },
      abandonedCarts,
      errorSpikes: revenueMetrics.failures
    };
  }

  static async getRevenueMetrics(timeframe: 'day' | 'week' | 'month' = 'month') {
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;

    switch (timeframe) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }

    const [currentRevenue, previousRevenue, mrr, churnRate, activeSubCount, failedPayments] = await Promise.all([
      this.calculateTotalRevenue(startDate),
      this.calculateTotalRevenue(previousStartDate, startDate),
      this.calculateMRR(),
      this.calculateChurnRate(timeframe),
      prisma.subscription.count({ where: { status: 'active' } }),
      this.calculateFailedPayments(startDate, now)
    ]);

    const currencies = new Set<string>([
      ...Object.keys(currentRevenue),
      ...Object.keys(previousRevenue),
    ]);
    const growth: Record<string, number> = {};
    currencies.forEach((c) => {
      const curr = currentRevenue[c] || 0;
      const prev = previousRevenue[c] || 0;
      growth[c] = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    });

    const arpa: Record<string, number> = {};
    const ltv: Record<string, number> = {};
    Object.entries(mrr).forEach(([currency, amount]) => {
      arpa[currency] = activeSubCount > 0 ? amount / activeSubCount : 0;
      ltv[currency] = churnRate > 0 ? arpa[currency] * (100 / churnRate) : 0;
    });

    return {
      timeframe,
      currentPeriod: {
        revenue: currentRevenue,
        startDate,
        endDate: now
      },
      previousPeriod: {
        revenue: previousRevenue,
        startDate: previousStartDate,
        endDate: startDate
      },
      growth,
      mrr,
      churnRate,
      arpa,
      ltv,
      failures: failedPayments
    };
  }

  private static async calculateTotalRevenue(startDate: Date, endDate?: Date): Promise<Record<string, number>> {
    const where: any = {
      status: 'paid',
      createdAt: { gte: startDate }
    };

    if (endDate) {
      where.createdAt.lte = endDate;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: { amount: true, currency: true }
    });

    const totals: Record<string, number> = {};
    for (const inv of invoices) {
      totals[inv.currency] = (totals[inv.currency] || 0) + inv.amount;
    }
    Object.keys(totals).forEach((k) => {
      totals[k] = totals[k] / 100;
    });
    return totals;
  }

  private static async calculateMRR(): Promise<Record<string, number>> {
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'active' },
      include: { plan: { include: { prices: true } } },
    });

    const totals: Record<string, number> = {};
    for (const sub of activeSubscriptions) {
      const amount = SubscriptionService.getPlanPrice(
        sub.plan as any,
        sub.currency,
        sub.plan.billingFrequency as any,
      );
      const monthlyRevenue =
        sub.plan.billingFrequency === 'yearly' ? amount / 12 : amount;
      totals[sub.currency] = (totals[sub.currency] || 0) + monthlyRevenue;
    }

    Object.keys(totals).forEach((k) => {
      totals[k] = totals[k] / 100;
    });
    return totals;
  }

  private static async calculateChurnRate(timeframe: 'day' | 'week' | 'month'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [churnedCount, totalAtStart] = await Promise.all([
      prisma.subscription.count({
        where: {
          status: { in: ['cancelled', 'suspended'] },
          updatedAt: { gte: startDate }
        }
      }),
      prisma.subscription.count({
        where: {
          createdAt: { lt: startDate }
        }
      })
    ]);

    return totalAtStart > 0 ? (churnedCount / totalAtStart) * 100 : 0;
  }

  private static async calculateFailedPayments(startDate: Date, endDate: Date): Promise<number> {
    // Count failed invoices in window
    return prisma.invoice.count({
      where: {
        status: 'failed',
        createdAt: { gte: startDate, lte: endDate }
      }
    });
  }

  static async getGrowthMetrics(days: number = 30) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Generate daily data points
    const dailyData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const [signups, revenue] = await Promise.all([
        prisma.tenant.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextDate
            }
          }
        }),
        this.calculateTotalRevenue(date, nextDate)
      ]);

      dailyData.push({
        date: date.toISOString().split('T')[0],
        signups,
        revenue
      });
    }

    return dailyData;
  }
}