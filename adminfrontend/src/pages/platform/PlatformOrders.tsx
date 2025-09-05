import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RefreshCw, CreditCard, AlertTriangle, CheckCircle, XCircle, Eye, Hash, ChevronLeft, ChevronRight, Calendar, ArrowUpDown } from 'lucide-react';
import { ordersApi, type OrderFilters } from '@/api/platform/orders';
import { PlatformApiError } from '@/api/platform/base';
import type { Order } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';
import { StepUpAuth } from '@/components/ui/StepUpAuth';
import { usePlatformMfa } from '@/hooks/usePlatformMfa';
import { formatMoney } from '@/utils/formatMoney';
import { handlePreconditionError } from '@/utils/preconditionHandler';

export default function PlatformOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const navigate = useNavigate();
  const { dateFilter, setDateFilter } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState<OrderFilters['gateway'] | ''>('');
  const [typeFilter, setTypeFilter] = useState<OrderFilters['type'] | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const { 
    isStepUpRequired, 
    requireStepUp, 
    cancelStepUp, 
  } = usePlatformMfa();
  const [pendingAction, setPendingAction] = useState<() => Promise<void> | void>(() => {});

  const { platformPermissions, platformUser } = usePlatformAuth();
  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);

  useEffect(() => {
    fetchOrders();
  }, [currentPage, pageSize, statusFilter, gatewayFilter, typeFilter, dateFilter]);

  const fetchOrders = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: OrderFilters = {
        limit: pageSize + 1,
        offset,
        status: statusFilter || undefined,
        gateway: gatewayFilter === '' ? undefined : gatewayFilter,
        type: typeFilter === '' ? undefined : typeFilter,
        ...(dateFilter && {
          startDate: new Date(dateFilter).toISOString(),
          endDate: new Date(new Date(dateFilter).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        })
      };
      const data = await ordersApi.list(filters);
      setHasMore(data.data.length > pageSize);
      setOrders(data.data.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch orders', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };


  const handleViewOrderDetails = async (order: Order) => {
    try {
      setIsLoadingDetails(true);
      setSelectedOrder(order);
      setShowOrderDetailsModal(true);
      
      // Fetch detailed order information
      const details = await ordersApi.getDetails(order.id);
      setOrderDetails(details);
    } catch (error) {
      console.error('Failed to fetch order details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleAdjustment = async () => {
    if (!selectedOrder || !adjustmentAmount || !adjustmentReason) {
      toast({ title: 'Error', description: 'Amount and reason are required', variant: 'destructive' });
      return;
    }

    if (!hasPermission(PERMISSIONS.ORDERS.ADJUST)) {
      toast({ title: 'Error', description: 'No permission to adjust orders', variant: 'destructive' });
      return;
    }

    // Check if user has MFA enabled and require step-up auth for sensitive operations
    if (platformUser?.mfaEnabled) {
      setPendingAction(() => () => setShowConfirmModal(true));
      requireStepUp();
    } else {
      setShowConfirmModal(true);
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder || !refundAmount || !refundReason) {
      toast({ title: 'Error', description: 'Amount and reason are required', variant: 'destructive' });
      return;
    }

    if (!hasPermission(PERMISSIONS.ORDERS.REFUND)) {
      toast({ title: 'Error', description: 'No permission to refund orders', variant: 'destructive' });
      return;
    }

    // Check if user has MFA enabled and require step-up auth for sensitive operations
    if (platformUser?.mfaEnabled) {
      setPendingAction(() => () => setShowConfirmModal(true));
      requireStepUp();
    } else {
      setShowConfirmModal(true);
    }
  };

  const confirmAction = async () => {
    if (!selectedOrder) return;

    try {
      if (adjustmentAmount && adjustmentReason) {
        setIsAdjusting(true);
        await ordersApi.createAdjustment({
          tenantId: selectedOrder.tenantId,
          amount: parseFloat(adjustmentAmount),
          currency: selectedOrder.currency,
          reason: adjustmentReason,
          metadata: {
            originalOrderId: selectedOrder.id
          }
        });

        toast({ title: 'Success', description: 'Adjustment processed successfully' });
        setShowAdjustmentModal(false);
        setAdjustmentAmount('');
        setAdjustmentReason('');
      } else if (refundAmount && refundReason) {
        setIsRefunding(true);
        await ordersApi.refund(selectedOrder.id, {
          amount: parseFloat(refundAmount),
          reason: refundReason
        });

        toast({ title: 'Success', description: 'Refund processed successfully' });
        setShowRefundModal(false);
        setRefundAmount('');
        setRefundReason('');
      }

      setShowConfirmModal(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      if (
        error instanceof PlatformApiError &&
        error.status === 412 &&
        (selectedOrder.gateway === 'paypal' || selectedOrder.gateway === 'razorpay')
      ) {
        const handled = handlePreconditionError(
          new Error(`PRECONDITION:${error.code || 'CONFIG_MISSING_TENANT'}`),
          navigate,
          { provider: selectedOrder.gateway as 'paypal' | 'razorpay' }
        );
        if (!handled) {
          toast({ title: 'Error', description: 'Failed to process action', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Error', description: 'Failed to process action', variant: 'destructive' });
      }
    } finally {
      setIsRefunding(false);
      setIsAdjusting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { icon: CheckCircle, variant: 'default' as const, color: 'text-green-500' },
      pending: { icon: AlertTriangle, variant: 'secondary' as const, color: 'text-yellow-500' },
      failed: { icon: XCircle, variant: 'destructive' as const, color: 'text-red-500' },
      refunded: { icon: RefreshCw, variant: 'outline' as const, color: 'text-gray-500' },
      partially_refunded: { icon: RefreshCw, variant: 'secondary' as const, color: 'text-orange-500' },
    } as const;

    const config = statusConfig[status as keyof typeof statusConfig];
    const text = status
      .replace('_', ' ')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());

    if (!config) {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          {text}
        </Badge>
      );
    }

    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {text}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const typeMap = {
      invoice: { variant: 'default' as const, text: 'Invoice' },
      refund: { variant: 'destructive' as const, text: 'Refund' },
      adjustment: { variant: 'secondary' as const, text: 'Adjustment' },
    };

    const config = typeMap[type as keyof typeof typeMap] || { variant: 'outline' as const, text: type };

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const getGatewayBadge = (gateway: string) => {
    const gatewayColors = {
      razorpay: 'bg-blue-100 text-blue-800',
      paypal: 'bg-purple-100 text-purple-800',
      manual: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge variant="secondary" className={gatewayColors[gateway as keyof typeof gatewayColors] || 'bg-gray-100 text-gray-800'}>
        {gateway.toUpperCase()}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + orders.length - 1;

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set([
          'completed',
          'pending',
          'failed',
          'refunded',
          'partially_refunded',
          ...orders.map(o => o.status),
        ])
      ),
    [orders]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">Manage platform orders and transactions</p>
        </div>
        <Button onClick={fetchOrders} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as OrderFilters['type'] | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
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
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {status
                        .replace('_', ' ')
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway</label>
              <Select value={gatewayFilter} onValueChange={(value) => setGatewayFilter(value as OrderFilters['gateway'] | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="All gateways" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Gateways</SelectItem>
                  <SelectItem value="razorpay">Razorpay</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
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
              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No orders found</h3>
                  <p className="text-muted-foreground">
                    No orders match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Order ID</th>
                        <th className="text-left py-3 px-4 font-medium">Type</th>
                        <th className="text-left py-3 px-4 font-medium">Amount</th>
                        <th className="text-left py-3 px-4 font-medium">Gateway</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Created</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-mono">{order.id}</p>
                                <CopyButton text={order.id} />
                              </div>
                              {order.gatewayRefId && (
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-muted-foreground font-mono">
                                    Gateway: {order.gatewayRefId}
                                  </p>
                                  <CopyButton text={order.gatewayRefId} size="sm" />
                                </div>
                              )}
                              {order.metadata?.idempotencyKey && (
                                <div className="flex items-center gap-1">
                                  <Hash className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">Idempotent</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getTypeBadge(order.type)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              <span className="font-medium">
                                {formatMoney(Math.round(Math.abs(order.total) * 100), order.currency as 'USD' | 'INR')}
                              </span>
                              {order.total < 0 && <span className="text-red-500">(Refund)</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getGatewayBadge(order.gateway)}
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(order.status)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewOrderDetails(order)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(order.status === 'completed' && order.type === 'invoice') && (
                                <>
                                  {hasPermission(PERMISSIONS.ORDERS.REFUND) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedOrder(order);
                                        setShowRefundModal(true);
                                      }}
                                    >
                                      Refund
                                    </Button>
                                  )}
                                  {hasPermission(PERMISSIONS.ORDERS.ADJUST) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedOrder(order);
                                        setShowAdjustmentModal(true);
                                      }}
                                    >
                                      Adjust
                                    </Button>
                                  )}
                                </>
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
          {(orders.length > 0 && (currentPage > 1 || hasMore)) && (
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

      {/* Order Details Modal */}
      <ModalWrapper
        isOpen={showOrderDetailsModal}
        onClose={() => {
          setShowOrderDetailsModal(false);
          setOrderDetails(null);
          setSelectedOrder(null);
        }}
        title="Order Details"
        size="2xl"
      >
        {selectedOrder && (
          <div className="space-y-4">
            {isLoadingDetails ? (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="rounded bg-muted h-8 w-full"></div>
                  </div>
                ))}
              </div>
            ) : orderDetails ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Order ID</Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{orderDetails.id}</span>
                      <CopyButton text={orderDetails.id} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    <p>{getTypeBadge(orderDetails.type)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Gateway</Label>
                    <p>{getGatewayBadge(orderDetails.gateway)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <p>{getStatusBadge(orderDetails.status)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Tenant ID</Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{orderDetails.tenantId}</span>
                      <CopyButton text={orderDetails.tenantId} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Amount</Label>
                    <p className="font-medium">
                      {orderDetails.total < 0 ? '-' : ''}
                      {formatMoney(
                        Math.round(Math.abs(orderDetails.total) * 100),
                        orderDetails.currency as 'USD' | 'INR'
                      )}
                      {orderDetails.total < 0 && (
                        <span className="text-red-500 ml-1">(Refund/Credit)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Created</Label>
                    <p>{new Date(orderDetails.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Updated</Label>
                    <p>{new Date(orderDetails.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
                
                {orderDetails.gatewayRefId && (
                  <div>
                    <Label className="text-sm font-medium">Gateway Reference</Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{orderDetails.gatewayRefId}</span>
                      <CopyButton text={orderDetails.gatewayRefId} />
                    </div>
                  </div>
                )}
                
                {orderDetails.metadata && (
                  <div>
                    <Label className="text-sm font-medium">Metadata</Label>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                      {JSON.stringify(orderDetails.metadata, null, 2)}
                    </pre>
                    {orderDetails.metadata?.idempotencyKey && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-800">Idempotent Operation</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-blue-600">Key: {orderDetails.metadata.idempotencyKey}</span>
                          <CopyButton text={orderDetails.metadata.idempotencyKey} size="sm" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Related Orders Section */}
                {orderDetails.metadata?.originalOrderId && (
                  <div>
                    <Label className="text-sm font-medium">Related to Original Order</Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{orderDetails.metadata.originalOrderId}</span>
                      <CopyButton text={orderDetails.metadata.originalOrderId} />
                    </div>
                    {orderDetails.metadata.reason && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Reason: {orderDetails.metadata.reason}
                      </p>
                    )}
                  </div>
                )}

                {/* Action History */}
                {orderDetails.type === 'refund' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <RefreshCw className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-800">Refund Information</span>
                    </div>
                    <div className="text-sm text-red-700">
                      <p>
                        This is a refund transaction for{' '}
                        {formatMoney(
                          Math.round(Math.abs(orderDetails.total) * 100),
                          orderDetails.currency as 'USD' | 'INR'
                        )}
                      </p>
                      {orderDetails.metadata?.reason && (
                        <p className="mt-1">Reason: {orderDetails.metadata.reason}</p>
                      )}
                    </div>
                  </div>
                )}

                {orderDetails.type === 'adjustment' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowUpDown className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Adjustment Information</span>
                    </div>
                    <div className="text-sm text-blue-700">
                      <p>
                        Manual adjustment of{' '}
                        {orderDetails.total > 0
                          ? '+'
                          : orderDetails.total < 0
                            ? '-'
                            : ''}
                        {formatMoney(
                          Math.round(Math.abs(orderDetails.total) * 100),
                          orderDetails.currency as 'USD' | 'INR'
                        )}
                      </p>
                      {orderDetails.metadata?.reason && (
                        <p className="mt-1">Reason: {orderDetails.metadata.reason}</p>
                      )}
                    </div>
                  </div>
                )}
              </>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Failed to load order details</h3>
                  <p className="text-muted-foreground">Please try again later</p>
                </div>
              )}
            </div>
        )}
      </ModalWrapper>

      {/* Adjustment Modal */}
      {/* Adjustment Modal */}
      {showAdjustmentModal && selectedOrder && (
        <ModalWrapper
          isOpen={showAdjustmentModal}
          onClose={() => {
            setShowAdjustmentModal(false);
            setAdjustmentAmount('');
            setAdjustmentReason('');
            setSelectedOrder(null);
          }}
          title="Process Adjustment"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Order ID</label>
              <p className="text-sm text-muted-foreground font-mono">{selectedOrder.id}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium">Original Amount</label>
              <p className="text-sm text-muted-foreground">
                {formatMoney(Math.round(selectedOrder.total * 100), selectedOrder.currency as 'USD' | 'INR')}
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Adjustment Amount*</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason*</label>
              <Input
                placeholder="Reason for adjustment"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdjustmentModal(false);
                  setAdjustmentAmount('');
                  setAdjustmentReason('');
                  setSelectedOrder(null);
                }}
                disabled={isAdjusting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleAdjustment}
                disabled={isAdjusting || !adjustmentAmount || !adjustmentReason}
              >
                {isAdjusting ? 'Processing...' : 'Process Adjustment'}
              </Button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Refund Modal */}
      {showRefundModal && selectedOrder && (
        <ModalWrapper
          isOpen={showRefundModal}
          onClose={() => {
            setShowRefundModal(false);
            setRefundAmount('');
            setRefundReason('');
            setSelectedOrder(null);
          }}
          title="Process Refund"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Order ID</label>
              <p className="text-sm text-muted-foreground font-mono">{selectedOrder.id}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium">Original Amount</label>
              <p className="text-sm text-muted-foreground">
                {formatMoney(Math.round(selectedOrder.total * 100), selectedOrder.currency as 'USD' | 'INR')}
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Refund Amount*</label>
              <Input
                type="number"
                step="0.01"
                max={selectedOrder.total}
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason*</label>
              <Input
                placeholder="Reason for refund"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRefundModal(false);
                  setRefundAmount('');
                  setRefundReason('');
                  setSelectedOrder(null);
                }}
                disabled={isRefunding}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRefund}
                disabled={isRefunding || !refundAmount || !refundReason}
              >
                {isRefunding ? 'Processing...' : 'Process Refund'}
              </Button>
            </div>
          </div>
        </ModalWrapper>
      )}
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmAction}
        title="Confirm Refund"
        description={`Are you sure you want to process this ${refundAmount ? 'refund' : 'adjustment'}?`}
        confirmText={refundAmount ? 'Process Refund' : 'Process Adjustment'}
        confirmVariant="destructive"
        isLoading={isRefunding || isAdjusting}
      />

      {/* Step-up Authentication Modal */}
      <StepUpAuth
        isOpen={isStepUpRequired}
        onClose={cancelStepUp}
        onSuccess={() => {
          pendingAction();
          setPendingAction(() => {});
        }}
        title="Verify Identity"
        description="This sensitive financial operation requires additional verification."
      />
    </div>
  );
}