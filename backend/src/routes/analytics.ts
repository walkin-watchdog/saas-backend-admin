import express from 'express';
import { BookingService } from '../services/bookingService';
import { ProductService } from '../services/productService';
import { TripRequestService } from '../services/tripRequestService';
import { NewsletterService } from '../services/newsletterService';
import { AbandonedCartService } from '../services/abandonedCartService';
import { authenticate, authorize } from '../middleware/auth';
import { fetchExchangeRates } from '../routes/currency';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { requireFeature } from '../middleware/featureFlag';
import { requireActiveSubscription } from '../middleware/subscriptionGuard';

const router = express.Router();

// Guard paid feature access (allows trial) and gate via feature flag
router.get(
  '/dashboard',
  authenticate,
  authorize(['ADMIN', 'EDITOR', 'VIEWER']),
  requireActiveSubscription({ allowTrial: true }),
  requireFeature('analytics.dashboard'),
  async (req, res, next) => {
  try {
    const reportCurrency = (
      (req.query.reportCurrency as string) ||
      'INR'
    ).toUpperCase();

    const sumInReportCurrency = async (
      rows: { currency: string; _sum: { totalAmount?: number | null } | undefined }[]
    ) => {
      if (!rows.length) return 0;

      const rates = await fetchExchangeRates(reportCurrency);

      return rows.reduce((acc, row) => {
        const amt = row._sum?.totalAmount || 0;
        if (!amt) return acc;
        return row.currency === reportCurrency
          ? acc + amt
          : acc + amt / (rates[row.currency] || 1);
      }, 0);
    };

    // Get current date info
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Total counts
    const [
      totalProducts,
      totalBookings,
      totalRevenueByCurrency,
      monthlyBookings,
      monthlyRevenueByCurrency,
      weeklyBookings,
      weeklyRevenueByCurrency,
      yearlyRevenueByCurrency,
      pendingRequests,
      activeSubscribers,
      totalAbandonedCarts,
      conversionRate,
    ] = await Promise.all([
      ProductService.countProducts(),
      BookingService.countBookings(),
      BookingService.groupByBookings({
        by: ['currency'] as const,
        _sum: { totalAmount: true },
        where: { status: 'CONFIRMED' }
      }),
      BookingService.countBookings({
        where: {
          createdAt: { gte: startOfMonth },
          status: 'CONFIRMED'
        }
      }),
      BookingService.groupByBookings({
        by: ['currency'] as const,
        _sum: { totalAmount: true },
        where: {
          createdAt: { gte: startOfMonth },
          status: 'CONFIRMED'
        }
      }),
      BookingService.countBookings({
        where: {
          createdAt: { gte: last7Days },
          status: 'CONFIRMED'
        }
      }),
      BookingService.groupByBookings({
        by: ['currency'] as const,
        _sum: { totalAmount: true },
        where: {
          createdAt: { gte: last7Days },
          status: 'CONFIRMED'
        }
      }),
      BookingService.groupByBookings({
        by: ['currency'] as const,
        _sum: { totalAmount: true },
        where: {
          createdAt: { gte: startOfYear },
          status: 'CONFIRMED'
        }
      }),
      TripRequestService.countTripRequests({
        where: { status: 'PENDING' }
      }),
      NewsletterService.countNewsletters({
        where: { isActive: true }
      }),
      AbandonedCartService.countAbandonedCarts(),
      // Simple conversion rate calculation
      BookingService.countBookings({ where: { status: 'CONFIRMED' } }).then(async (confirmed) => {
        const total = await BookingService.countBookings();
        return total > 0 ? (confirmed / total) * 100 : 0;
      })
    ]);

    const [
      totalRevenue,
      monthlyRevenue,
      weeklyRevenue,
      yearlyRevenue
    ] = await Promise.all([
      sumInReportCurrency(totalRevenueByCurrency),
      sumInReportCurrency(monthlyRevenueByCurrency),
      sumInReportCurrency(weeklyRevenueByCurrency),
      sumInReportCurrency(yearlyRevenueByCurrency)
    ]);

    // Booking trends (last 30 days)
    const bookingTrends = await BookingService.groupByBookings({
      by: ['createdAt'],
      _count: { id: true },
      _sum: { totalAmount: true },
      where: {
        createdAt: { gte: last30Days },
        status: 'CONFIRMED'
      },
      orderBy: { createdAt: 'asc' }
    });

    // Format booking trends to group by date
    const formattedBookingTrends = bookingTrends.map(trend => ({
      date: trend.createdAt.toISOString().split('T')[0],
      bookings: typeof trend._count === 'object' ? (trend._count?.id || 0) : 0,
      revenue: trend._sum?.totalAmount || 0
    }));

    // Revenue by type
    const revenueByTypeRaw = await BookingService.groupByBookings({
      by: ['productId', 'currency'] as const,
      _count: { id: true },
      _sum: { totalAmount: true },
      where: {
        createdAt: { gte: last30Days },
        status: 'CONFIRMED',
        productId: { not: null }
      },
      orderBy: { _sum: { totalAmount: 'desc' } }
    });

    const exchangeRates = await fetchExchangeRates(reportCurrency);
    const revenueByType = revenueByTypeRaw.map(item => ({
      productId: item.productId,
      currency:  item.currency,
      bookings:  typeof item._count === 'object' ? (item._count?.id || 0) : 0,
      revenue:   item.currency === reportCurrency
                   ? (item._sum?.totalAmount || 0)
                   : (item._sum?.totalAmount || 0) / (exchangeRates[item.currency] || 1),
    }));

    const typeProductIds = revenueByType
      .map(item => item.productId)
      .filter((id): id is string => typeof id === 'string');
    const products = await ProductService.findManyProducts({
      where: { id: { in: typeProductIds } },
      select: { id: true, type: true }
    });


    // 2) Aggregate manual bookings into one "Custom" bucket
    const manualAggByCurrency = await BookingService.groupByBookings({
      by: ['currency'] as const,
      _count: { id: true },
      _sum:   { totalAmount: true },
      where: {
        isManual: true,
        status:   'CONFIRMED',
        createdAt:{ gte: last30Days }
      }
    });
    const manualBookingsCount = manualAggByCurrency.reduce((n, r) => n + (typeof r._count === 'object' ? (r._count?.id || 0) : 0), 0);
    const manualRevenue       = await sumInReportCurrency(manualAggByCurrency);

    // 3) Merge:
    const formattedrevenueByType = revenueByType.map(item => ({
      key:     item.productId,
      bookings:item.bookings,
      revenue: item.revenue
    }));

    if (manualBookingsCount > 0) {
      formattedrevenueByType.unshift({
        key:      'custom',
        bookings: manualBookingsCount,
        revenue:  manualRevenue
      });
    }

    // Group revenue by type
    const typeRevenue = revenueByType.reduce((acc: any, booking) => {
      const prod = products.find(p => p.id === booking.productId);
      const type = prod?.type || 'Unknown';
      
      if (!acc[type]) {
        acc[type] = { type, bookings: 0, revenue: 0 };
      }
      
      acc[type].bookings += booking.bookings;
      acc[type].revenue  += booking.revenue;
      
      return acc;
    }, {});

    if (manualBookingsCount > 0) {
          typeRevenue['Custom'] = {
            type:     'Custom',
            bookings: manualBookingsCount,
            revenue:  manualRevenue,
          };
        }

    const formattedRevenueByType = Object.values(typeRevenue);

    // Top performing products
    const topProductsData = await BookingService.groupByBookings({
      by: ['productId', 'currency'] as const,
      _count: { id: true },
      _sum: { totalAmount: true },
      where: {
        status:    'CONFIRMED',
        productId: { not: null }
      },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 10
    });

    const topProductIds = topProductsData
      .map(item => item.productId)
      .filter((id): id is string => id !== null);
    const topProductDetails = await ProductService.findManyProducts({
      where: { 
        id: { in: topProductIds },
        isActive: true 
      },
      select: { id: true, title: true }
    });

    const topProducts = topProductsData.map(booking => {
      const product = topProductDetails.find(p => p.id === booking.productId);
      return {
        id: product?.id,
        title: product?.title,
        currency: booking.currency,
        total_bookings: typeof booking._count === 'object' ? (booking._count?.id || 0) : 0,
        total_revenue: booking._sum?.totalAmount || 0
      };
    }).filter(product => product.id); // Filter out products that weren't found

    // Monthly comparison
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const lastMonthStatsByCurrency = await BookingService.groupByBookings({
      by:     ['currency'] as const,
      _count: { id: true },
      _sum:   { totalAmount: true },
      where: {
        createdAt: { gte: lastMonth, lte: lastMonthEnd },
        status: 'CONFIRMED'
      }
    });

    const lastMonthStats = {
      _count: { id: lastMonthStatsByCurrency.reduce((n, r) => n + (typeof r._count === 'object' ? (r._count?.id || 0) : 0), 0) },
      _sum:   { totalAmount: await sumInReportCurrency(lastMonthStatsByCurrency) }
    };
    
    const isAdmin = (req as any).user?.role === 'ADMIN';

    const overview: any = {
      totalProducts,
      totalBookings,
      reportCurrency,
      monthlyBookings,
      weeklyBookings,
      pendingRequests,
      activeSubscribers,
      totalAbandonedCarts,
      conversionRate,
    };
    if (isAdmin) {
      Object.assign(overview, {
        totalRevenue,
        totalRevenueByCurrency,
        monthlyRevenueByCurrency,
        monthlyRevenue,
        weeklyRevenueByCurrency,
        weeklyRevenue,
        yearlyRevenueByCurrency,
        yearlyRevenue,
      });
    }

    const sanitizedRevenueByType = isAdmin
      ? formattedRevenueByType
      : (formattedRevenueByType as any[]).map((item) => ({
      type: item.type,
      bookings: item.bookings,
    }));

    const sanitizedTopProducts = isAdmin
      ? topProducts
      : topProducts.map(({ id, title, total_bookings }) => ({
          id,
          title,
          total_bookings,
        }));

    const sanitizedBookingTrends = isAdmin
      ? formattedBookingTrends
      : formattedBookingTrends.map(({ date, bookings }) => ({ date, bookings }));

    res.json({
      overview,
      trends: {
        monthlyGrowth: {
          bookings: lastMonthStats._count.id > 0 
            ? Math.round(((monthlyBookings - lastMonthStats._count.id) / lastMonthStats._count.id) * 100)
            : 0
        }
      },
      bookingTrends: sanitizedBookingTrends,
      revenueByType: sanitizedRevenueByType,
      topProducts: sanitizedTopProducts,
    });
  } catch (error) {
    next(error);
  }
});

// Get detailed analytics
router.get('/detailed', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const { startDate, endDate, productId, type } = req.query;
    
    const whereClause: any = { status: 'CONFIRMED' };
    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }
    if (productId) {
      whereClause.productId = productId;
    }

    const [bookingStats, revenueStats, customerStats] = await Promise.all([
      BookingService.groupByBookings({
        by: ['status'] as const,
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      BookingService.aggregateBookings({
        _avg: { totalAmount: true },
        _min: { totalAmount: true },
        _max: { totalAmount: true },
        where: whereClause
      }),
      BookingService.groupByBookings({
        by: ['customerEmail'] as const,
        _count: { id: true },
        where: whereClause,
        orderBy: { _count: { id: 'desc' } },
        take: 10
      })
    ]);

    res.json({
      bookingStats,
      revenueStats,
      topCustomers: customerStats
    });
  } catch (error) {
    next(error);
  }
});
export default router;