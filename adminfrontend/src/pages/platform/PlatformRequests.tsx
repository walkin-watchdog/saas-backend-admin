import { useState, useEffect } from 'react';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { useSelection } from '@/hooks/usePlatformStore';
import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Search, User, MessageSquare, UserPlus, Eye, Paperclip, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { requestsApi, type RequestFilters } from '@/api/platform/requests';
import { usersApi } from '@/api/platform/users';
import type { PlatformRequest } from '@/types/platform';
import { toast } from '@/hooks/use-toast';
import { plansApi } from '@/api/platform/plans';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { PERMISSIONS } from '@/constants/permissions';
import { formatMoney } from '@/utils/formatMoney';

export default function PlatformRequests() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [requests, setRequests] = useState<PlatformRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<PlatformRequest[]>([]);
  const { searchTerm, setSearchTerm } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const { selectedItems, setSelectedItems, addSelectedItem, removeSelectedItem, clearSelection } = useSelection();
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<PlatformRequest | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<'new' | 'in_review' | 'converted' | 'rejected'>('new');
  const [hasMore, setHasMore] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  useEffect(() => {
    fetchRequests();
    fetchPlans();
    fetchUsers();
  }, [currentPage, pageSize, searchTerm, kindFilter, statusFilter]);

  useEffect(() => {
    if (selectedRequest) {
      setStatusUpdate(selectedRequest.status);
    }
  }, [selectedRequest]);

  const fetchPlans = async () => {
    try {
      const res = await plansApi.getAll();
        setAvailablePlans(
          res.map(p => ({
            id: p.id,
            marketingName: p.marketingName,
            priceMonthly: p.prices.USD.monthly / 100,
          }))
        );
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const users = await usersApi.list({ limit: 100 });
      setAvailableUsers(users.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    filterRequests();
  }, [searchTerm, kindFilter, statusFilter, requests]);

  const fetchRequests = async () => {
    try {
      const offset = (currentPage - 1) * pageSize;
      const filters: RequestFilters = {
        offset,
        limit: pageSize + 1,
        kind: (kindFilter !== 'all' ? kindFilter as 'contact' | 'trial' | 'enterprise' : undefined),
        status: (statusFilter !== 'all' ? statusFilter as 'new' | 'rejected' | 'in_review' | 'converted' : undefined)
      };
      const data = await requestsApi.list(filters);
      setHasMore(data.data.length > pageSize);
      setRequests(data.data.slice(0, pageSize));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch requests', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequestDetails = async (requestId: string) => {
    try {
      const details = await requestsApi.getDetails(requestId);
      setRequestDetails(details);
    } catch (error) {
      console.error('Failed to fetch request details:', error);
    }
  };

  const handleViewDetails = (request: PlatformRequest) => {
    setSelectedRequest(request);
    fetchRequestDetails(request.id);
    setShowDetailModal(true);
  };

  const filterRequests = () => {
    let filtered = requests;

    if (searchTerm) {
      filtered = filtered.filter(request =>
        request.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (request.company && request.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.message && request.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (kindFilter !== 'all') {
      filtered = filtered.filter(request => request.kind === kindFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(request => request.status === statusFilter);
    }

    setFilteredRequests(filtered);
  };

  const handleAssign = async (requestId: string, userId: string) => {
    const actualUserId = userId === 'self' ? platformUser?.id : userId;
    
    if (!actualUserId) {
      toast({ title: 'Error', description: 'User ID not available', variant: 'destructive' });
      return;
    }

    try {
      setIsAssigning(requestId);
      
      await requestsApi.assign(requestId, {
        assignedToId: actualUserId,
      });
      
      toast({
        title: 'Success',
        description: 'Request assigned successfully',
      });
      
      fetchRequests();
    } catch (error) {
      console.error('Failed to assign request:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign request',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(null);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !selectedPlanId) return;

    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      
      const result = await requestsApi.convert(selectedRequest.id, {
        companyName: formData.get('companyName') as string,
        planId: selectedPlanId,
        ownerPassword: formData.get('ownerPassword') as string,
      });

      toast({
        title: 'Success',
        description: `Request converted to tenant ${result.tenant.id}`,
      });
      
      setShowConvertModal(false);
      fetchRequests();
    } catch (error) {
      console.error('Failed to convert request:', error);
      toast({
        title: 'Error',
        description: 'Failed to convert request',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (requestId: string, reason: string) => {
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        await requestsApi.reject(requestId, reason);
        
        toast({
          title: 'Success',
          description: 'Request rejected successfully',
        });
        
        fetchRequests();
      } catch (error) {
        console.error('Failed to reject request:', error);
        toast({
          title: 'Error',
          description: 'Failed to reject request',
          variant: 'destructive',
        });
      }
    });
  };

  const handleUpdateStatus = async () => {
    if (!selectedRequest) return;
    try {
      setIsProcessing(true);
      const updated = await requestsApi.updateStatus(selectedRequest.id, { status: statusUpdate });
      toast({ title: 'Success', description: 'Status updated successfully' });
      setSelectedRequest(updated);
      fetchRequests();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedItems.length === filteredRequests.length) {
      clearSelection();
    } else {
      setSelectedItems(filteredRequests.map(r => r.id));
    }
  };

  const handleSelectRequest = (requestId: string) => {
    if (selectedItems.includes(requestId)) {
      removeSelectedItem(requestId);
    } else {
      addSelectedItem(requestId);
    }
  };

  const handleBulkAssign = async (userId: string) => {
    if (selectedItems.length === 0) return;
    
    const actualUserId = userId === 'self' ? platformUser?.id : userId;
    if (!actualUserId) return;
    
    try {
      setIsProcessing(true);
      await Promise.all(
        selectedItems.map(requestId =>
          requestsApi.assign(requestId, {
            assignedToId: actualUserId,
          })
        )
      );
      
      toast({
        title: 'Success',
        description: `${selectedItems.length} request(s) assigned successfully`,
      });
      
      clearSelection();
      fetchRequests();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to bulk assign requests',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getKindBadge = (kind: string) => {
    const kindConfig = {
      contact: { text: 'Contact', variant: 'secondary' as const },
      trial: { text: 'Trial Request', variant: 'default' as const },
      enterprise: { text: 'Enterprise', variant: 'destructive' as const },
    };

    const config = kindConfig[kind as keyof typeof kindConfig] || kindConfig.contact;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      new: { text: 'New', variant: 'secondary' as const },
      in_review: { text: 'In Review', variant: 'default' as const },
      converted: { text: 'Converted', variant: 'outline' as const },
      rejected: { text: 'Rejected', variant: 'destructive' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + filteredRequests.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Public Requests</h1>
          <p className="text-muted-foreground">
            Manage contact forms, trial requests, and enterprise inquiries
          </p>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">
                {selectedItems.length} request(s) selected
              </span>
              <div className="flex gap-2">
                {hasPermission(PERMISSIONS.REQUESTS.ASSIGN) && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => handleBulkAssign('self')}
                      disabled={isProcessing}
                    >
                      Assign to Me
                    </Button>
                    <Select onValueChange={handleBulkAssign}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Assign to user" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                <Button variant="outline" onClick={clearSelection}>
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, company, or message..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="trial">Trial Request</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={(value: string) => setStatusFilter(value as 'new' | 'in_review' | 'converted' | 'rejected')}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Quick Filters</label>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('new')}
                >
                  New
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('all');
                  }}
                >
                  All
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
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
              {filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No requests found</h3>
                  <p className="text-muted-foreground">
                    No requests match your current filters.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">
                          <input
                            type="checkbox"
                            checked={selectedItems.length === filteredRequests.length && filteredRequests.length > 0}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-primary border-gray-300 rounded"
                          />
                        </th>
                        <th className="text-left py-3 px-4 font-medium">Contact</th>
                        <th className="text-left py-3 px-4 font-medium">Type</th>
                        <th className="text-left py-3 px-4 font-medium">Message</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Submitted</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => (
                        <tr key={request.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedItems.includes(request.id)}
                              onChange={() => handleSelectRequest(request.id)}
                              className="h-4 w-4 text-primary border-gray-300 rounded"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0">
                                <div className="h-8 w-8 bg-muted rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4" />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{request.email}</p>
                                {request.company && (
                                  <p className="text-sm text-muted-foreground truncate">{request.company}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getKindBadge(request.kind)}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-muted-foreground max-w-xs truncate">
                              {request.message || '-'}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(request.status)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {new Date(request.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleViewDetails(request)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              
                              {request.status === 'new' && (
                                <>
                                  {hasPermission(PERMISSIONS.REQUESTS.ASSIGN) && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleAssign(request.id, 'self')}
                                      disabled={isAssigning === request.id}
                                      title="Assign to me"
                                    >
                                      {isAssigning === request.id ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500" />
                                      ) : (
                                        <User className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                  
                                  {request.kind === 'trial' || request.kind === 'enterprise' ? (
                                    hasPermission(PERMISSIONS.REQUESTS.CONVERT) && (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => {
                                          setSelectedRequest(request);
                                          setShowConvertModal(true);
                                        }}
                                      >
                                        <UserPlus className="h-4 w-4 mr-1" />
                                        Convert
                                      </Button>
                                    )
                                  ) : (
                                    hasPermission(PERMISSIONS.REQUESTS.WRITE) && (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => handleReject(request.id, 'Not applicable for conversion')}
                                      >
                                        Mark as Contact
                                      </Button>
                                    )
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
          {(filteredRequests.length > 0 && (currentPage > 1 || hasMore)) && (
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

      {/* Convert to Tenant Modal */}
      <ModalWrapper
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Convert Request to Tenant"
        size="md"
      >
        <form onSubmit={handleConvert} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              name="companyName"
              type="text"
              defaultValue={selectedRequest?.company || ''}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan">Plan</Label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {availablePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.marketingName} - {formatMoney(Math.round(plan.priceMonthly * 100), 'USD')}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ownerPassword">Owner Password</Label>
            <Input id="ownerPassword" name="ownerPassword" type="password" required />
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" disabled={isProcessing || !selectedPlanId}>
              {isProcessing ? 'Converting...' : 'Convert to Tenant'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowConvertModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalWrapper>

      {/* Detail Modal */}
      <ModalWrapper
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`Request Details: ${selectedRequest?.company || selectedRequest?.email || 'Unknown'}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-medium">Company</Label>
              <p>{selectedRequest?.company || 'N/A'}</p>
            </div>
            <div>
              <Label className="font-medium">Email</Label>
              <div className="flex items-center gap-2">
                <span>{selectedRequest?.email || 'N/A'}</span>
                {selectedRequest?.email && <CopyButton text={selectedRequest.email} />}
              </div>
            </div>
            <div>
              <Label className="font-medium">Status</Label>
              {hasPermission(PERMISSIONS.REQUESTS.WRITE) ? (
                <div className="mt-1 flex items-center gap-2">
                  <Select value={statusUpdate} onValueChange={(value: string) => setStatusUpdate(value as 'new' | 'in_review' | 'converted' | 'rejected')}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleUpdateStatus}
                    disabled={statusUpdate === selectedRequest?.status || isProcessing}
                  >
                    Update
                  </Button>
                </div>
              ) : (
                <div className="mt-1">
                  {selectedRequest && getStatusBadge(selectedRequest.status)}
                </div>
              )}
            </div>
            <div>
              <Label className="font-medium">Created</Label>
              <p>{selectedRequest?.createdAt ? new Date(selectedRequest.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
          
          <div>
            <Label className="font-medium">Requirements</Label>
            <p className="mt-2 text-sm">{selectedRequest?.message || 'No requirements specified'}</p>
          </div>
          
          <div>
            <Label className="font-medium">Attachments</Label>
            <div className="mt-2">
              {requestDetails?.attachments && requestDetails.attachments.length > 0 ? (
                <div className="space-y-1">
                  {requestDetails.attachments.map((attachment: any, index: number) => (
                    <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        <span>{attachment.name}</span>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attachments</p>
              )}
            </div>
          </div>

          {/* Assignment Section */}
          {selectedRequest?.status === 'new' && hasPermission(PERMISSIONS.REQUESTS.ASSIGN) && (
            <div>
              <Label className="font-medium">Assignment</Label>
              <div className="space-y-3 mt-2">
                <Select
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Assign to me</SelectItem>
                    {availableUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAssign(selectedRequest.id, assigneeId)}
                  disabled={!assigneeId || isAssigning === selectedRequest.id}
                >
                  {isAssigning === selectedRequest.id ? 'Assigning...' : 'Assign Request'}
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowDetailModal(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </ModalWrapper>
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          confirmAction();
          setShowConfirmModal(false);
        }}
        title="Confirm Action"
        description="Are you sure you want to perform this action?"
        confirmText="Confirm"
        confirmVariant="destructive"
      />
    </div>
  );
}