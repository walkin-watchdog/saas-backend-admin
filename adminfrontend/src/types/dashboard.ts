// Dashboard related types
export interface DashboardStats {
  overview: {
    totalProducts: number;
    totalBookings: number;
    totalRevenue: number;
    totalRevenueByCurrency: { currency: string; _sum: { totalAmount: number | null  }}[];
    monthlyBookings: number;
    monthlyRevenue: number;
    monthlyRevenueByCurrency: { currency: string; _sum: { totalAmount: number | null }}[];
    weeklyBookings: number;
    weeklyRevenueByCurrency: { currency: string; _sum: { totalAmount: number | null }}[];
    weeklyRevenue: number;
    yearlyRevenue: number;
    yearlyRevenueByCurrency: { currency: string; _sum: { totalAmount: number | null }}[];
    pendingRequests: number;
    activeSubscribers: number;
    totalAbandonedCarts: number;
    conversionRate: number;
    reportCurrency: string;
  };
  trends: {
    monthlyGrowth: {
      bookings: number;
      revenue: number;
    };
  };
  bookingTrends: any[];
  revenueByType: any[];
  topProducts: any[];
}
