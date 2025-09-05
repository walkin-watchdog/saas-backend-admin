import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  ExternalLink, 
  RefreshCw, 
  Calendar,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  DollarSign
} from 'lucide-react';
import { invoicesApi } from '@/api/billing/invoices';
import type { Invoice, InvoiceFilters } from '@/types/billing';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/formatMoney';
import { isBillingError } from '@/utils/billing';

export const Invoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalInvoices, setTotalInvoices] = useState(0);

  useEffect(() => {
    fetchInvoices();
  }, [currentPage, statusFilter, dateFilter, endDateFilter]);

  const fetchInvoices = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const filters: InvoiceFilters = {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(dateFilter && { startDate: dateFilter }),
        ...(endDateFilter && { endDate: endDateFilter })
      };

      const response = await invoicesApi.list(filters);
      setInvoices(response.invoices);
      setTotalInvoices(response.pagination.total);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to load invoices',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchInvoices(true);
  };

  const handleViewPdf = async (invoiceId: string) => {
    try {
      setIsGeneratingPdf(invoiceId);
      const response = await invoicesApi.createPdfToken(invoiceId);
      window.open(response.secureUrl, '_blank');
      
      toast({
        title: 'PDF Opened',
        description: 'Invoice PDF opened in new tab',
      });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to generate PDF',
          variant: 'destructive',
        });
      }
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { variant: 'secondary' as const, text: 'Draft' },
      sent: { variant: 'default' as const, text: 'Sent' },
      paid: { variant: 'default' as const, text: 'Paid' },
      due: { variant: 'destructive' as const, text: 'Due' },
      overdue: { variant: 'destructive' as const, text: 'Overdue' },
      cancelled: { variant: 'outline' as const, text: 'Cancelled' },
      credit: { variant: 'secondary' as const, text: 'Credit' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: 'outline' as const,
      text: status.charAt(0).toUpperCase() + status.slice(1)
    };

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalInvoices / pageSize);
  const showingFrom = totalInvoices === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, totalInvoices);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-2">View and download your billing invoices</p>
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Results</label>
              <div className="flex items-center h-10 px-3 py-2 border border-input rounded-md bg-background">
                <span className="text-sm text-muted-foreground">
                  {totalInvoices} total
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-32" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No invoices found</h3>
                  <p className="text-muted-foreground">
                    {statusFilter || dateFilter || endDateFilter
                      ? "No invoices match your current filters."
                      : "Your invoices will appear here once generated."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium">Invoice</th>
                          <th className="text-left py-3 px-4 font-medium">Plan</th>
                          <th className="text-left py-3 px-4 font-medium">Amount</th>
                          <th className="text-left py-3 px-4 font-medium">Tax</th>
                          <th className="text-left py-3 px-4 font-medium">Status</th>
                          <th className="text-left py-3 px-4 font-medium">Created</th>
                          <th className="text-right py-3 px-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <p className="font-medium">{invoice.number || invoice.id}</p>
                                <p className="text-sm text-muted-foreground font-mono">{invoice.id}</p>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm">{invoice.subscription?.plan?.marketingName || 'Unknown Plan'}</p>
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {formatMoney(invoice.amount, invoice.currency as 'USD' | 'INR')}
                                </p>
                                {invoice.usageAmount && invoice.usageAmount > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Usage: {formatMoney(invoice.usageAmount, invoice.currency as 'USD' | 'INR')}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {invoice.taxAmount && invoice.taxPercent ? (
                                <div className="space-y-1">
                                  <p className="text-sm">
                                    {formatMoney(invoice.taxAmount, invoice.currency as 'USD' | 'INR')}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {(invoice.taxPercent * 100).toFixed(1)}%
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {getStatusBadge(invoice.status)}
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm text-muted-foreground">
                                {new Date(invoice.createdAt).toLocaleDateString()}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPdf(invoice.id)}
                                disabled={isGeneratingPdf === invoice.id}
                              >
                                {isGeneratingPdf === invoice.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    PDF
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="block md:hidden space-y-4">
                    {invoices.map((invoice) => (
                      <Card key={invoice.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="space-y-1">
                              <p className="font-medium">{invoice.number || invoice.id}</p>
                              <p className="text-xs text-muted-foreground">{invoice.subscription?.plan?.marketingName || 'Unknown Plan'}</p>
                            </div>
                            {getStatusBadge(invoice.status)}
                          </div>
                          
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center">
                              <DollarSign className="h-4 w-4 text-muted-foreground mr-1" />
                              <span className="font-medium">
                                {formatMoney(invoice.amount, invoice.currency as 'USD' | 'INR')}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(invoice.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          {invoice.taxAmount && invoice.taxPercent && (
                            <div className="text-sm text-muted-foreground mb-3">
                              Tax: {formatMoney(invoice.taxAmount, invoice.currency as 'USD' | 'INR')} 
                              ({(invoice.taxPercent * 100).toFixed(1)}%)
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewPdf(invoice.id)}
                            disabled={isGeneratingPdf === invoice.id}
                            className="w-full"
                          >
                            {isGeneratingPdf === invoice.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Loading PDF...
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalInvoices > pageSize && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {showingFrom} to {showingTo} of {totalInvoices} invoices
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        
                        <span className="text-sm">
                          Page {currentPage} of {totalPages}
                        </span>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage >= totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};