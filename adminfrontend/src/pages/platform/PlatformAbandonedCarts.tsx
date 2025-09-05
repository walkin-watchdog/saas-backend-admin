import { useState, useEffect } from 'react';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShoppingCart, Clock, Mail, UserPlus, Trash2, TrendingUp, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { abandonedCartsApi, type AbandonedCartFilters } from '@/api/platform/abandonedCarts';
import type { PlatformAbandonedCart } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformAbandonedCarts() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [carts, setCarts] = useState<PlatformAbandonedCart[]>([]);
  const { searchTerm, setSearchTerm, dateFilter, setDateFilter } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingRecovery, setIsSendingRecovery] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({
    openCarts: 0,
    recoveredCarts: 0,
    discardedCarts: 0,
    total: 0,
    recoveryRate: 0
  });

  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  useEffect(() => {
    fetchCarts();
    fetchStats();
  }, [currentPage, pageSize, searchTerm, statusFilter, planFilter, dateFilter]);

  const fetchCarts = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: AbandonedCartFilters = {
        limit: pageSize + 1,
        offset,
        status: statusFilter !== 'all' ? (statusFilter as 'open' | 'recovered' | 'discarded') : undefined,
        planId: planFilter !== 'all' ? planFilter : undefined,
        ...(searchTerm && { email: searchTerm }),
        ...(dateFilter && {
          seenSince: new Date(dateFilter).toISOString(),
          seenBefore: new Date(new Date(dateFilter).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        })
      };
      const data = await abandonedCartsApi.list(filters);
      setHasMore(data.data.length > pageSize);
      setCarts(data.data.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch abandoned carts', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await abandonedCartsApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch abandoned cart stats:', error);
    }
  };


  const handleSendRecovery = async (cartId: string) => {
    if (!hasPermission(PERMISSIONS.ABANDONED_CARTS.WRITE)) {
      toast({ title: 'Error', description: 'No permission to send recovery links', variant: 'destructive' });
      return;
    }

    try {
      setIsSendingRecovery(cartId);
      await abandonedCartsApi.sendRecoveryLink(cartId);
      
        toast({
          title: 'Success',
          description: 'Recovery email sent successfully',
        });
      
      fetchCarts();
    } catch (error) {
      console.error('Failed to send recovery link:', error);
      toast({
        title: 'Error',
        description: 'Failed to send recovery link',
        variant: 'destructive',
      });
    } finally {
      setIsSendingRecovery(null);
    }
  };

  const handleDiscard = async (cartId: string) => {
    if (!hasPermission(PERMISSIONS.ABANDONED_CARTS.WRITE)) {
      toast({ title: 'Error', description: 'No permission to discard carts', variant: 'destructive' });
      return;
    }

    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        setIsDiscarding(cartId);
        await abandonedCartsApi.discardCart(cartId);
        
        toast({
          title: 'Success',
          description: 'Abandoned cart discarded successfully',
        });
        
        fetchCarts();
        fetchStats();
      } catch (error) {
        console.error('Failed to discard cart:', error);
        toast({
          title: 'Error',
          description: 'Failed to discard cart',
          variant: 'destructive',
        });
      } finally {
        setIsDiscarding(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      open: { variant: 'secondary' as const, text: 'Open' },
      recovered: { variant: 'default' as const, text: 'Recovered' },
      discarded: { variant: 'destructive' as const, text: 'Discarded' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + carts.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Abandoned Carts</h1>
          <p className="text-muted-foreground">
            Recover abandoned shopping carts and improve conversion
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats.openCarts}</p>
                <p className="text-xs text-muted-foreground">Open Carts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.recoveredCarts}</p>
                <p className="text-xs text-muted-foreground">Recovered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.discardedCarts}</p>
                <p className="text-xs text-muted-foreground">Discarded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Carts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{(stats.recoveryRate * 100).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Recovery Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="recovered">Recovered</SelectItem>
                  <SelectItem value="discarded">Discarded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan</label>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Seen</label>
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

      {/* Carts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Abandoned Carts</CardTitle>
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
              {carts.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No abandoned carts found</h3>
                  <p className="text-muted-foreground">
                    No carts match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Contact</th>
                        <th className="text-left py-3 px-4 font-medium">Plan</th>
                        <th className="text-left py-3 px-4 font-medium">Currency</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Reminder Status</th>
                        <th className="text-left py-3 px-4 font-medium">Last Seen</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carts.map((cart) => (
                        <tr key={cart.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{cart.email}</p>
                              {cart.utm && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {cart.utm.source && `Source: ${cart.utm.source}`}
                                  {cart.utm.medium && ` • Medium: ${cart.utm.medium}`}
                                  {cart.utm.campaign && ` • Campaign: ${cart.utm.campaign}`}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline">
                              {cart.planId || 'No Plan'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">{cart.currency}</td>
                          <td className="py-3 px-4">
                            {getStatusBadge(cart.status)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{cart.reminderCount || 0}</span>
                              {cart.reminderCount > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({cart.reminderCount === 1 ? 'initial' :
                                    cart.reminderCount === 2 ? 'follow-up' :
                                    'multiple'} reminder{cart.reminderCount > 1 ? 's' : ''})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {new Date(cart.lastSeenAt).toLocaleDateString()}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              {cart.status === 'open' && hasPermission(PERMISSIONS.ABANDONED_CARTS.WRITE) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSendRecovery(cart.id)}
                                  disabled={isSendingRecovery === cart.id}
                                >
                                  {isSendingRecovery === cart.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                                  ) : (
                                    <Mail className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {cart.status === 'open' && hasPermission(PERMISSIONS.ABANDONED_CARTS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDiscard(cart.id)}
                                  disabled={isDiscarding === cart.id}
                                >
                                  {isDiscarding === cart.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
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
          {(carts.length > 0 && (currentPage > 1 || hasMore)) && (
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
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Discard Cart"
        description="Are you sure you want to discard this abandoned cart? This action cannot be undone."
        confirmText="Discard"
        confirmVariant="destructive"
        isLoading={isDiscarding !== null}
      />
    </div>
  );
}