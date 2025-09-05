import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Eye, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { webhooksApi, type WebhookFilters } from '@/api/platform/webhooks';
import type { WebhookDelivery } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformWebhooks() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const { searchTerm, setSearchTerm } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const [isReplaying, setIsReplaying] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    processed: 0,
    failed: 0,
    pending: 0,
    successRate: 0,
  });

  const hasPermission = (permission: string) =>
    platformUser?.roles.includes('super_admin') ||
    platformPermissions.includes(permission);

  useEffect(() => {
    fetchDeliveries();
    fetchStats();
  }, [currentPage, pageSize, searchTerm, statusFilter, providerFilter]);

  const fetchDeliveries = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: WebhookFilters = {
        limit: pageSize + 1,
        offset,
        status: (statusFilter as 'processed' | 'failed' | 'received' | 'skipped') || undefined,
        ...(providerFilter && { provider: providerFilter as 'razorpay' | 'paypal' }),
      };
      const data = await webhooksApi.listDeliveries(filters);
      const filtered = searchTerm
        ? data.data.filter(d =>
            d.id.includes(searchTerm) ||
            d.eventId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.provider.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : data.data;
      setHasMore(filtered.length > pageSize);
      setDeliveries(filtered.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch webhook deliveries', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await webhooksApi.getStats();
      setStats({
        total: data?.total ?? 0,
        processed: data?.processed ?? 0,
        failed: data?.failed ?? 0,
        pending: data?.pending ?? 0,
        successRate: data?.successRate ?? 0,
      });
    } catch (error) {
      console.error('Failed to fetch webhook stats:', error);
    }
  };

  const handleReplay = async (deliveryId: string) => {
    if (!hasPermission(PERMISSIONS.WEBHOOKS.REPLAY)) return;
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      setIsReplaying(deliveryId);
      try {
        await webhooksApi.replayDelivery(deliveryId);
        toast({ title: 'Success', description: 'Webhook replayed successfully' });
        fetchDeliveries();
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to replay webhook', variant: 'destructive' });
      } finally {
        setIsReplaying(null);
      }
    });
  };

  const handleViewDeliveryDetails = async (delivery: WebhookDelivery) => {
    try {
      const details = await webhooksApi.getDeliveryDetails(delivery.id);
      setSelectedDelivery(details);
    } catch (error) {
      console.error('Failed to fetch delivery details:', error);
      setSelectedDelivery(delivery);
    }
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Processed</Badge>;
      case 'failed':
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'received':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Received</Badge>;
      case 'skipped':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800"><RotateCcw className="h-3 w-3 mr-1" />Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + deliveries.length - 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">Monitor webhook deliveries and events</p>
        </div>
        <div className="flex space-x-2">
          <Button asChild variant="outline">
            <Link to="/platform/webhooks/endpoints">Manage Endpoints</Link>
          </Button>
          <Button onClick={fetchDeliveries} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processed</p>
                <p className="text-2xl font-bold text-green-600">{stats.processed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{stats.successRate}%</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by event ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="razorpay">Razorpay</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {deliveries.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No webhook deliveries found</h3>
                  <p className="text-muted-foreground">
                    No deliveries match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4">Provider</th>
                        <th className="text-left p-4">Event ID</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Received At</th>
                        <th className="text-left p-4">Processed At</th>
                        <th className="text-right p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((delivery) => (
                        <tr key={delivery.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">
                            <div className="font-mono text-sm">{delivery.provider}</div>
                          </td>
                          <td className="p-4 font-mono text-sm">{delivery.eventId}</td>
                          <td className="p-4">{getStatusBadge(delivery.status)}</td>
                          <td className="p-4 text-sm">
                            {new Date(delivery.receivedAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-sm">
                            {delivery.processedAt ? new Date(delivery.processedAt).toLocaleString() : '-'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewDeliveryDetails(delivery)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              {delivery.status === 'failed' &&
                                hasPermission(PERMISSIONS.WEBHOOKS.REPLAY) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReplay(delivery.id)}
                                    disabled={isReplaying === delivery.id}
                                  >
                                    <RotateCcw className="h-3 w-3" />
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

              {/* Mobile Cards */}
              <div className="block md:hidden space-y-4">
                {deliveries.map((delivery) => (
                  <Card key={delivery.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        {getStatusBadge(delivery.status)}
                      </div>
                      <div className="text-sm font-mono text-muted-foreground mb-2 truncate">
                        {delivery.eventId}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <div>Received: {new Date(delivery.receivedAt).toLocaleString()}</div>
                          <div>Processed: {delivery.processedAt ? new Date(delivery.processedAt).toLocaleString() : '-'}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDeliveryDetails(delivery)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {delivery.status === 'failed' &&
                            hasPermission(PERMISSIONS.WEBHOOKS.REPLAY) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReplay(delivery.id)}
                                disabled={isReplaying === delivery.id}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Pagination */}
          {(deliveries.length > 0 && (currentPage > 1 || hasMore)) && (
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

      {/* Delivery Details Modal */}
      <ModalWrapper
        isOpen={!!selectedDelivery}
        onClose={() => setSelectedDelivery(null)}
        title="Webhook Delivery Details"
        size="2xl"
      >
        {selectedDelivery && (
          <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Provider</label>
                  <div className="text-sm font-mono">{selectedDelivery.provider}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Event ID</label>
                  <div className="text-sm font-mono break-all">{selectedDelivery.eventId}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Status</label>
                  {getStatusBadge(selectedDelivery.status)}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Received At</label>
                  <div className="text-sm">{new Date(selectedDelivery.receivedAt).toLocaleString()}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Processed At</label>
                  <div className="text-sm">{selectedDelivery.processedAt ? new Date(selectedDelivery.processedAt).toLocaleString() : '-'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Error</label>
                  <div className="text-sm break-all">{selectedDelivery.error || '-'}</div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                {selectedDelivery.status === 'failed' &&
                  hasPermission(PERMISSIONS.WEBHOOKS.REPLAY) && (
                    <Button
                      onClick={() => handleReplay(selectedDelivery.id)}
                      disabled={isReplaying === selectedDelivery.id}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Replay
                    </Button>
                  )}
                <Button variant="outline" onClick={() => setSelectedDelivery(null)}>
                  Close
                </Button>
              </div>
            </div>
        )}
      </ModalWrapper>
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Replay Webhook"
        description="Are you sure you want to replay this webhook delivery?"
        confirmText="Replay"
        confirmVariant="default"
      />
      
      {/* Add total pages variable */}
    </div>
  );
}