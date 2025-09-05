import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Search, FileText, Clock } from 'lucide-react';
import { kycApi } from '@/api/platform/kyc';
import { PlatformApiError } from '@/api/platform/base';
import type { KycRecord } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformKyc() {
  const [searchParams] = useSearchParams();
  const tenantIdParam = searchParams.get('tenantId');
  const [kycRecords, setKycRecords] = useState<KycRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<KycRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<KycRecord | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [stats, setStats] = useState({
    submitted: 0,
    approved: 0,
    rejected: 0,
  });

  const { platformPermissions, platformUser } = usePlatformAuth();
  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);

  useEffect(() => {
    fetchKycRecords();
    fetchStats();
  }, [tenantIdParam]);

  useEffect(() => {
    filterRecords();
  }, [searchTerm, statusFilter, kycRecords]);

  const fetchKycRecords = async () => {
    try {
      setIsLoading(true);
      if (tenantIdParam) {
        try {
          const record = await kycApi.getLatestForTenant(tenantIdParam);
          setKycRecords(record ? [record] : []);
        } catch (err) {
          if (err instanceof PlatformApiError && err.status === 404) {
            setKycRecords([]);
          } else {
            throw err;
          }
        }
      } else {
        const data = await kycApi.list({ offset: 0, limit: 100 });
        setKycRecords(data.data);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch KYC records', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await kycApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch KYC stats:', error);
    }
  };

  const filterRecords = () => {
    let filtered = kycRecords;

    if (searchTerm) {
      filtered = filtered.filter(record =>
        record.tenantId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.notes && record.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(record => record.status === statusFilter);
    }

    setFilteredRecords(filtered);
  };

  const handleReview = async (recordId: string, status: 'verified' | 'rejected', notes: string) => {
    setConfirmTitle(status === 'verified' ? 'Approve KYC' : 'Reject KYC');
    setConfirmDescription(`Are you sure you want to ${status === 'verified' ? 'approve' : 'reject'} this KYC record?`);
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        setIsReviewing(true);
        const updated = await kycApi.review(recordId, { status, notes });

        toast({
          title: 'Success',
          description: `KYC record ${status} successfully`,
        });

        setKycRecords(prev => prev.map(r => (r.id === updated.id ? updated : r)));
        setSelectedRecord(null);
        fetchStats();
      } catch (error) {
        console.error('Failed to review KYC record:', error);
        toast({
          title: 'Error',
          description: 'Failed to review KYC record',
          variant: 'destructive',
        });
      } finally {
        setIsReviewing(false);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { text: 'Pending Review', variant: 'secondary' as const },
      verified: { text: 'Verified', variant: 'default' as const },
      rejected: { text: 'Rejected', variant: 'destructive' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const getUrgencyBadge = (createdAt: string) => {
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays >= 7) {
      return <Badge variant="destructive" size="sm">Urgent</Badge>;
    } else if (diffInDays >= 3) {
      return <Badge variant="secondary" size="sm">Priority</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">KYC Management</h1>
          <p className="text-muted-foreground">
            Review and manage Know Your Customer verification requests
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.submitted}</p>
                <p className="text-xs text-muted-foreground">Submitted Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.rejected}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tenant ID or notes..."
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
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>KYC Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded-full bg-muted h-10 w-10"></div>
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No KYC records found</h3>
                  <p className="text-muted-foreground">
                    No KYC verification requests match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Tenant</th>
                        <th className="text-left py-3 px-4 font-medium">Provider</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Submitted</th>
                        <th className="text-left py-3 px-4 font-medium">Notes</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((record) => (
                        <tr key={record.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{record.tenantId}</span>
                              {getUrgencyBadge(record.createdAt)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {record.provider || 'Manual'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(record.status)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {new Date(record.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {record.notes ? (
                                record.notes.length > 50 
                                  ? `${record.notes.substring(0, 50)}...` 
                                  : record.notes
                              ) : '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {record.status === 'pending' &&
                              hasPermission(PERMISSIONS.KYC.REVIEW) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedRecord(record)}
                                >
                                  Review
                                </Button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Modal */}
      <ModalWrapper
        isOpen={!!selectedRecord}
        onClose={() => {
          setSelectedRecord(null);
          setReviewNotes('');
        }}
        title="Review KYC Record"
        size="2xl"
      >
        {selectedRecord && (
          <div className="space-y-4">
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Tenant ID</label>
                <p className="text-sm text-muted-foreground">{selectedRecord.tenantId}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Provider</label>
                <p className="text-sm text-muted-foreground">{selectedRecord.provider || 'Manual'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Reference ID</label>
                <p className="text-sm text-muted-foreground">{selectedRecord.refId || '-'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Submitted</label>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedRecord.createdAt).toLocaleString()}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Review Notes</label>
                <Input
                  placeholder="Add review notes..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setSelectedRecord(null)}
                disabled={isReviewing}
              >
                Cancel
              </Button>
              {hasPermission(PERMISSIONS.KYC.REVIEW) && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => handleReview(selectedRecord.id, 'rejected', reviewNotes)}
                    disabled={isReviewing}
                  >
                    {isReviewing ? 'Processing...' : 'Reject'}
                  </Button>
                  <Button
                    onClick={() => handleReview(selectedRecord.id, 'verified', reviewNotes)}
                    disabled={isReviewing}
                  >
                    {isReviewing ? 'Processing...' : 'Approve'}
                  </Button>
                </>
              )}
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
        title={confirmTitle}
        description={confirmDescription}
        confirmText="Confirm"
        confirmVariant="default"
        isLoading={isReviewing}
      />
    </div>
  );
}