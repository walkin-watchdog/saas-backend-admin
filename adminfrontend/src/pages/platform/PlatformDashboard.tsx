import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle } from 'lucide-react';
import { metricsApi } from '@/api/platform/metrics';
import type { DashboardMetrics } from '@/api/platform/metrics';
import { toast } from '@/hooks/use-toast';
import { getCurrencySymbol } from '@/utils/currencyUtils';
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

export default function PlatformDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      const endDate = new Date();
      const startDate = new Date();
      
      switch (dateRange) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '12m':
          startDate.setMonth(endDate.getMonth() - 12);
          break;
      }

      const timeframe = dateRange === '7d' ? 'week' : dateRange === '30d' ? 'month' : 'month';
      const data = await metricsApi.getDashboardMetrics(timeframe);
      
      setMetrics(data);
      if (data && !selectedCurrency) {
        const firstCurrency = Object.keys(data.revenue.mrr)[0];
        setSelectedCurrency(firstCurrency);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard metrics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [dateRange]);

  const formatCurrency = (amount: number, currency: string) => {
    return `${getCurrencySymbol(currency)}${amount.toLocaleString()}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
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

  const buildSeries = (values: number[]) => {
    const start = new Date();
    start.setDate(start.getDate() - values.length + 1);
    return values.map((value, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return { timestamp: d.toISOString(), value };
    });
  };

  const mrrSeries = buildSeries(
    metrics?.revenue.timeSeriesData.mrr?.map(
      (d) => d[selectedCurrency] || 0
    ) || []
  );
  const churnSeries = buildSeries(metrics?.revenue.timeSeriesData.churn || []);
  const signupSeries = buildSeries(metrics?.revenue.timeSeriesData.signups || []);
  const revenueSeries = buildSeries(
    metrics?.revenue.timeSeriesData.revenue[selectedCurrency] || []
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Platform Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of key platform metrics and performance indicators
          </p>
        </div>
        
        <div className="flex gap-2">
        {metrics && (
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(metrics.revenue.mrr).map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {getCurrencySymbol(currency)} {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(metrics?.revenue.mrr[selectedCurrency] || 0, selectedCurrency)}
                </div>
                <div
                  className={`text-xs flex items-center gap-1 ${getChangeColor(
                    metrics?.revenue.periodChange.percentage[selectedCurrency] || 0
                  )}`}
                >
                  {getChangeIcon(
                    metrics?.revenue.periodChange.percentage[selectedCurrency] || 0
                  )}
                  {Math.abs(
                    metrics?.revenue.periodChange.percentage[selectedCurrency] || 0
                  ).toFixed(1)}% from last period
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercentage(metrics?.revenue.churnRate || 0)}</div>
                <div className="text-xs text-muted-foreground">Current period</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Signups</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics?.tenants.newSignups || 0}</div>
                <div className="text-xs text-muted-foreground">This period</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Spikes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{metrics?.errorSpikes || 0}</div>
                <div className="text-xs text-muted-foreground">
                  Critical incidents this period
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">ARPA (Average Revenue Per Account)</span>
                  <span className="font-medium">{formatCurrency(metrics?.revenue.arpa[selectedCurrency] || 0, selectedCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">LTV (Customer Lifetime Value)</span>
                  <span className="font-medium">{formatCurrency(metrics?.revenue.ltv[selectedCurrency] || 0, selectedCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-medium">{formatPercentage(metrics?.requests.conversionRate || 0)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Growth Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Revenue Change</span>
                  <span
                    className={`font-medium ${getChangeColor(
                      metrics?.revenue.periodChange.percentage[selectedCurrency] || 0
                    )}`}
                  >
                    {metrics?.revenue.periodChange.percentage[selectedCurrency] &&
                    metrics.revenue.periodChange.percentage[selectedCurrency] > 0
                      ? '+'
                      : ''}
                    {(
                      metrics?.revenue.periodChange.percentage[selectedCurrency] || 0
                    ).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-medium">{formatPercentage(metrics?.requests.conversionRate || 0)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      {!isLoading && metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* MRR Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Recurring Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mrrSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      `${getCurrencySymbol(selectedCurrency)}${value.toLocaleString()}`
                    }
                  />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value) => [
                      `${getCurrencySymbol(selectedCurrency)}${Number(value).toLocaleString()}`,
                      'MRR',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Churn Rate Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Churn Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={churnSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis tickFormatter={(value) => `${value.toFixed(1)}%`} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Churn Rate']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Signups Chart */}
          <Card>
            <CardHeader>
              <CardTitle>New Signups</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={signupSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value) => [value, 'Signups']}
                  />
                  <Bar dataKey="value" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      `${getCurrencySymbol(selectedCurrency)}${value.toLocaleString()}`
                    }
                  />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value) => [
                      `${getCurrencySymbol(selectedCurrency)}${Number(value).toLocaleString()}`,
                      'Revenue',
                    ]}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}