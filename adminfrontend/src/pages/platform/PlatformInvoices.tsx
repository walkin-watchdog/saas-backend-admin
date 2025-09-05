import { useState, useEffect } from 'react';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, FileText, ExternalLink, Mail, Download, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { invoicesApi, type InvoiceFilters } from '@/api/platform/invoices';
import type { Invoice } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';
import { formatMoney } from '@/utils/formatMoney';

export default function PlatformInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const { dateFilter, setDateFilter } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const [isResending, setIsResending] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const { platformPermissions, platformUser } = usePlatformAuth();
  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);

  useEffect(() => {
    fetchInvoices();
  }, [currentPage, pageSize, statusFilter, dateFilter]);

  const fetchInvoices = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: InvoiceFilters = {
        limit: pageSize + 1,
        offset,
        status: statusFilter || undefined,
        ...(dateFilter && {
          startDate: new Date(dateFilter).toISOString(),
          endDate: new Date(new Date(dateFilter).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        })
      };
      const data = await invoicesApi.list(filters);
      setHasMore(data.data.length > pageSize);
      setInvoices(data.data.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch invoices', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };


  const handleViewPdf = async (invoiceId: string) => {
    try {
      setIsGeneratingPdf(invoiceId);
      const pdfData = await invoicesApi.generatePdfUrl(invoiceId);
      window.open(pdfData.secureUrl, '_blank');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleResendEmail = async (invoiceId: string) => {
    try {
      setIsResending(invoiceId);
      const res = await invoicesApi.resendEmail(invoiceId);
      toast({ title: 'Success', description: res.message || 'Invoice email sent successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resend invoice email', variant: 'destructive' });
    } finally {
      setIsResending(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await invoicesApi.exportCsv({});
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'invoices.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Success', description: 'Invoice data exported successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to export invoice data', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { variant: 'outline' as const, color: 'text-gray-500' },
      sent: { variant: 'secondary' as const, color: 'text-blue-500' },
      paid: { variant: 'default' as const, color: 'text-green-500' },
      overdue: { variant: 'destructive' as const, color: 'text-red-500' },
      cancelled: { variant: 'outline' as const, color: 'text-gray-500' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;

    return (
      <Badge variant={config.variant}>
        {status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + invoices.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">Manage platform invoices and billing</p>
        </div>
        <div className="flex space-x-2">
          {hasPermission(PERMISSIONS.INVOICES.EXPORT) && (
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
          <Button onClick={fetchInvoices} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
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
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded bg-muted h-16 w-full"></div>
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
                    No invoices match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Invoice</th>
                        <th className="text-left py-3 px-4 font-medium">Tenant</th>
                        <th className="text-left py-3 px-4 font-medium">Amount</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Due Date</th>
                        <th className="text-left py-3 px-4 font-medium">Created</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{invoice.id}</p>
                              <p className="text-xs text-muted-foreground font-mono">{invoice.number || "-"}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-mono">{invoice.tenantId}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {formatMoney(invoice.amount ?? 0, (invoice.currency as 'USD' | 'INR') || 'USD')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(invoice.status)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {new Date(invoice.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPdf(invoice.id)}
                                disabled={isGeneratingPdf === invoice.id}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {invoice.status !== 'draft' &&
                                hasPermission(PERMISSIONS.INVOICES.WRITE) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResendEmail(invoice.id)}
                                    disabled={isResending === invoice.id}
                                  >
                                    <Mail className="h-4 w-4" />
                                  </Button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
          {/* Pagination */}
          {(invoices.length > 0 && (currentPage > 1 || hasMore)) && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {showingFrom} to {showingTo}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!hasMore}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}