import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { tenantsApi, type TenantFilters } from '@/api/platform/tenants';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  Eye, 
  Server,
  Users,
  Package,
  BookOpen
} from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  subscriber?: {
    billingStatus?: string;
    kycStatus?: string;
  };
  subscriptions?: Array<{
    plan: {
      name: string;
    };
  }>;
  _count?: {
    users: number;
    products: number;
    bookings: number;
  };
}

export default function PlatformTenants() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const { searchTerm } = useFilters();
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [offboardReason, setOffboardReason] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [showOffboardModal, setShowOffboardModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showHardDeleteModal, setShowHardDeleteModal] = useState(false);
  const [restoreReason, setRestoreReason] = useState('');
  const [hardDeleteReason, setHardDeleteReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);

  useEffect(() => {
    fetchTenants();
  }, [currentPage, pageSize, searchTerm]);

  const fetchTenants = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: TenantFilters = {
        limit: pageSize,
        offset,
        search: searchTerm || undefined
      };
      const res = await tenantsApi.list(filters);
      setTotal(res.pagination.total ?? 0);
      setHasMore(offset + pageSize < (res.pagination.total ?? 0));
      setTenants(res.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch tenants', variant: 'destructive' });
    }
  };

  const handleOffboard = () => {
    if (!selectedTenant || !offboardReason.trim()) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await tenantsApi.offboard(selectedTenant.id, {
          reason: offboardReason,
          retentionDays,
        });
        toast({ title: 'Success', description: 'Tenant offboarding scheduled successfully' });
        fetchTenants();
        setOffboardReason('');
        setRetentionDays(30);
        setShowOffboardModal(false);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to schedule offboarding', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleRestore = () => {
    if (!selectedTenant || !restoreReason.trim()) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await tenantsApi.restore(selectedTenant.id, { reason: restoreReason });
        toast({ title: 'Success', description: 'Tenant restored successfully' });
        fetchTenants();
        setRestoreReason('');
        setShowRestoreModal(false);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to restore tenant', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleHardDelete = () => {
    if (!selectedTenant || !hardDeleteReason.trim()) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await tenantsApi.hardDelete(selectedTenant.id, hardDeleteReason);
        toast({ title: 'Success', description: 'Tenant permanently deleted' });
        fetchTenants();
        setHardDeleteReason('');
        setShowHardDeleteModal(false);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to delete tenant', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleEvictClient = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await tenantsApi.evictClient(tenant.id);
        toast({ title: 'Success', description: 'Client evicted successfully' });
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to evict client', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'suspended':
        return <Badge variant="destructive">Suspended</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const showingFrom = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(showingFrom + tenants.length - 1, total);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tenant Management</h1>
          <p className="text-muted-foreground">Manage platform tenants and their lifecycle</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={fetchTenants}>Refresh</Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Tenant</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Plan</th>
                  <th className="text-left py-3 px-4">Usage</th>
                  <th className="text-left py-3 px-4">Created</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(tenant => (
                  <tr key={tenant.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-muted-foreground font-mono">{tenant.id}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        {getStatusBadge(tenant.status)}
                        {tenant.subscriber?.billingStatus && (
                          <Badge variant="outline" className="text-xs">
                            Billing: {tenant.subscriber.billingStatus}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {tenant.subscriptions?.[0]?.plan?.name || 'No Plan'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-4 text-sm text-muted-foreground">
                        <span className="flex items-center">
                          <Users className="h-3 w-3 mr-1" />
                          {tenant._count?.users || 0}
                        </span>
                        <span className="flex items-center">
                          <Package className="h-3 w-3 mr-1" />
                          {tenant._count?.products || 0}
                        </span>
                        <span className="flex items-center">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {tenant._count?.bookings || 0}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end space-x-2">
                        {hasPermission(PERMISSIONS.TENANTS.READ) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/platform/tenants/${tenant.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {hasPermission(PERMISSIONS.TENANTS.MANAGE) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEvictClient(tenant)}
                          >
                            <Server className="h-4 w-4" />
                          </Button>
                        )}

                        {tenant.status === 'active' && hasPermission(PERMISSIONS.TENANTS.OFFBOARD) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setShowOffboardModal(true);
                            }}
                          >
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          </Button>
                        )}

                        {tenant.status === 'suspended' && hasPermission(PERMISSIONS.TENANTS.RESTORE) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setShowRestoreModal(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4 text-green-600" />
                          </Button>
                        )}

                        {hasPermission(PERMISSIONS.TENANTS.HARD_DELETE) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setShowHardDeleteModal(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-4">No tenants found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {tenants.length > 0 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-muted-foreground">
                Showing {showingFrom}&ndash;{showingTo} of {total}
              </span>
              <div className="space-x-2">
                <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Prev</Button>
                <Button variant="outline" disabled={!hasMore} onClick={() => setCurrentPage(currentPage + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offboard Modal */}
      {showOffboardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-96 space-y-4">
            <h3 className="text-lg font-semibold">Offboard Tenant</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea
                  value={offboardReason}
                  onChange={(e) => setOffboardReason(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Reason for offboarding..."
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Retention Days</label>
                <input
                  type="number"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full p-2 border rounded-md"
                  min={1}
                  max={365}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowOffboardModal(false)}>Cancel</Button>
              <Button onClick={handleOffboard} disabled={!offboardReason.trim() || isProcessing}>
                {isProcessing ? 'Processing...' : 'Offboard'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-96 space-y-4">
            <h3 className="text-lg font-semibold">Restore Tenant</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Reason for restoration..."
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowRestoreModal(false)}>Cancel</Button>
              <Button onClick={handleRestore} disabled={!restoreReason.trim() || isProcessing}>
                {isProcessing ? 'Processing...' : 'Restore'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Modal */}
      {showHardDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg w-96 space-y-4">
            <h3 className="text-lg font-semibold text-red-600">Permanently Delete Tenant</h3>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. All tenant data will be permanently deleted.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea
                  value={hardDeleteReason}
                  onChange={(e) => setHardDeleteReason(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Reason for permanent deletion..."
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowHardDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleHardDelete} disabled={!hardDeleteReason.trim() || isProcessing}>
                {isProcessing ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Confirm Action"
        description="Are you sure you want to perform this action? This may affect the tenant's operations."
        confirmText="Confirm"
        isLoading={isProcessing}
      />
    </div>
  );
}