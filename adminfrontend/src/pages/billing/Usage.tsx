import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Package, 
  DollarSign,
  Calendar,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/formatMoney';
import { getCurrencySymbol } from '@/utils/currencyUtils';
import type { DashboardStats } from '@/types/dashboard';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { isBillingError } from '@/utils/billing';

export const Usage = () => {
  const { token, billingWarning } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reportCurrency, setReportCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>('INR');

  useEffect(() => {
    fetchUsageData();
  }, [reportCurrency]);

  const fetchUsageData = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/analytics/dashboard?reportCurrency=${reportCurrency}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 402) {
          // This will be handled by the BillingBanner component
          const data = await response.json().catch(() => ({}));
          // Billing errors handled by the BillingBanner component
          throw new Error((data as any).error || 'SUBSCRIPTION_REQUIRED');
        }
        throw new Error('Failed to fetch usage data');
      }

      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('Error fetching usage data:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to load usage data',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchUsageData(true);
  };

  const getCurrencyOptions = () => {
    if (!stats?.overview.totalRevenueByCurrency) return ['INR'];
    
    const currencies = stats.overview.totalRevenueByCurrency.map(item => item.currency);
    return Array.from(new Set([reportCurrency, ...currencies]));
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-500';
    if (change < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const formatTrendData = (trendData: any[]) => {
    return trendData.map(trend => ({
      date: new Date(trend.date).toLocaleDateString(),
      bookings: trend.bookings,
      revenue: trend.revenue
    }));
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usage & Analytics</h1>
          <p className="text-gray-600 mt-2">Monitor your platform usage and performance</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="w-32">
            <Select value={reportCurrency} onValueChange={value => setReportCurrency(value as 'INR' | 'USD' | 'EUR' | 'GBP')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getCurrencyOptions().map(currency => (
                  <SelectItem key={currency} value={currency}>
                    {getCurrencySymbol(currency)} {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.totalProducts}</div>
                <p className="text-xs text-muted-foreground">Active offerings</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.totalBookings}</div>
                {stats.trends.monthlyGrowth.bookings !== undefined && (
                  <div className={`flex items-center text-xs ${getChangeColor(stats.trends.monthlyGrowth.bookings)}`}>
                    {getChangeIcon(stats.trends.monthlyGrowth.bookings)}
                    <span className="ml-1">
                      {Math.abs(stats.trends.monthlyGrowth.bookings)}% from last month
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Bookings</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.monthlyBookings}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Weekly Bookings</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.weeklyBookings}</div>
                <p className="text-xs text-muted-foreground">This week</p>
              </CardContent>
            </Card>

            {/* Revenue Cards (Admin only) */}
            {stats.overview.totalRevenue !== undefined && (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatMoney(Math.round(stats.overview.totalRevenue * 100), reportCurrency)}
                    </div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatMoney(Math.round(stats.overview.monthlyRevenue * 100), reportCurrency)}
                    </div>
                    <p className="text-xs text-muted-foreground">This month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Weekly Revenue</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatMoney(Math.round(stats.overview.weeklyRevenue * 100), reportCurrency)}
                    </div>
                    <p className="text-xs text-muted-foreground">This week</p>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Newsletter Subscribers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overview.activeSubscribers}</div>
                <p className="text-xs text-muted-foreground">Active subscribers</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Booking Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Booking Trends</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.bookingTrends && stats.bookingTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={formatTrendData(stats.bookingTrends)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(value) => `Date: ${value}`}
                        formatter={(value, name) => [
                          value,
                          name === 'bookings' ? 'Bookings' : 'Revenue'
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="bookings"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No booking trend data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revenue by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Performance by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.revenueByType && stats.revenueByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.revenueByType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip
                        formatter={(value, name) => [
                          name === 'revenue' 
                            ? formatMoney(Math.round(Number(value) * 100), reportCurrency)
                            : value,
                          name === 'revenue' ? 'Revenue' : 'Bookings'
                        ]}
                      />
                      <Bar 
                        dataKey="bookings" 
                        fill="#10b981" 
                        name="bookings"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No performance data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topProducts && stats.topProducts.length > 0 ? (
                <div className="space-y-4">
                  {stats.topProducts.slice(0, 10).map((product: any, index: number) => (
                    <div key={product.id || index} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg">
                      <div className="flex items-center">
                        <div className="bg-[var(--brand-primary)] text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-semibold mr-3">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{product.title || 'Unknown Product'}</p>
                          <p className="text-sm text-muted-foreground">{product.total_bookings || 0} bookings</p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {product.total_revenue !== undefined ? (
                          <span className="font-semibold text-[var(--brand-primary)]">
                            {formatMoney(Math.round(product.total_revenue * 100), reportCurrency)}
                          </span>
                        ) : (
                          <span className="font-semibold text-[var(--brand-secondary)]">
                            {product.total_bookings || 0} bookings
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No product data</h3>
                  <p className="text-muted-foreground">
                    Product performance data will appear here once you have bookings.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Growth Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Monthly Growth (Bookings)</span>
                  <div className={`flex items-center ${getChangeColor(stats.trends.monthlyGrowth.bookings || 0)}`}>
                    {getChangeIcon(stats.trends.monthlyGrowth.bookings || 0)}
                    <span className="font-medium ml-1">
                      {Math.abs(stats.trends.monthlyGrowth.bookings || 0)}%
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-medium">
                    {(stats.overview.conversionRate || 0).toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pending Requests</span>
                  <span className="font-medium">
                    {stats.overview.pendingRequests || 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Period Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">This Month</span>
                  <div className="text-right">
                    <p className="font-medium">{stats.overview.monthlyBookings} bookings</p>
                    {stats.overview.monthlyRevenue !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(Math.round(stats.overview.monthlyRevenue * 100), reportCurrency)}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">This Week</span>
                  <div className="text-right">
                    <p className="font-medium">{stats.overview.weeklyBookings} bookings</p>
                    {stats.overview.weeklyRevenue !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(Math.round(stats.overview.weeklyRevenue * 100), reportCurrency)}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Abandoned Carts</span>
                  <span className="font-medium">
                    {stats.overview.totalAbandonedCarts || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Usage data unavailable</h3>
          <p className="text-muted-foreground">
            Usage data unavailable — check your subscription.
            {billingWarning && (
              <>
                {' '}
                <Link to="/billing/plans-and-subscriptions" className="underline">
                  Manage billing
                </Link>
                .
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};