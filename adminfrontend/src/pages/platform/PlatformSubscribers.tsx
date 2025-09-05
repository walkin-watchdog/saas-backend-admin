import { useState, useEffect } from 'react';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { useFilters, usePagination } from '@/hooks/usePlatformStore';
import { useSelection } from '@/hooks/usePlatformStore';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Filter,
  UserPlus,
  Edit,

  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpDown,
  Tag,
  FileText,
  UserCheck,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  PlayCircle
} from 'lucide-react';
import { subscribersApi, type SubscriberFilters, type PlanChangePreview } from '@/api/platform/subscribers';
import { invoicesApi } from '@/api/platform/invoices';
import { plansApi } from '@/api/platform/plans';
import { usersApi } from '@/api/platform/users';
import { formatMoney } from '@/utils/formatMoney';
import { tenantsApi } from '@/api/platform/tenants';
import { couponsApi } from '@/api/platform/coupons';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';


import type { SubscriberInfo } from '@/types/platform';
import type { UsageRecord, SubscriberInvoice, SubscriberUpdateData } from '@/api/platform/subscribers';
import { toast } from '@/hooks/use-toast';
import { PERMISSIONS } from '@/constants/permissions';
import { type PlatformRoleCode } from '@/constants/platformRoles';
export default function PlatformSubscribers() {
  const [subscribers, setSubscribers] = useState<SubscriberInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { searchTerm, statusFilter, setSearchTerm, setStatusFilter } = useFilters();
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const { selectedItems, setSelectedItems, addSelectedItem, removeSelectedItem, clearSelection } = useSelection();
  const { platformPermissions, platformUser } = usePlatformAuth();

  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);
  
  const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberInfo | null>(null);
  const [subscriberDetails, setSubscriberDetails] = useState<any>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [subscriberInvoices, setSubscriberInvoices] = useState<any[]>([]);

  // New state for usage history and general updates
  const [showUsageHistoryModal, setShowUsageHistoryModal] = useState(false);
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);
  const [showGeneralUpdateModal, setShowGeneralUpdateModal] = useState(false);
  const [usageHistory, setUsageHistory] = useState<UsageRecord[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [subscriberInvoicesList, setSubscriberInvoicesList] = useState<SubscriberInvoice[]>([]);
  const [generalUpdateData, setGeneralUpdateData] = useState<SubscriberUpdateData>({});

  // New modals state
  const [showPlanChangeModal, setShowPlanChangeModal] = useState(false);
  const [showTrialExtendModal, setShowTrialExtendModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [showAssignCsmModal, setShowAssignCsmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prorationPreview, setProrationPreview] = useState<PlanChangePreview | null>(null);
  const [availableCSMs, setAvailableCSMs] = useState<any[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchSubscribers();
    fetchPlans();
    if (hasPermission(PERMISSIONS.PLATFORM_USERS.READ)) {
      fetchCSMs();
    }
  }, [currentPage, pageSize, searchTerm, statusFilter, platformPermissions]);

  const fetchSubscribers = async () => {
    try {
      setIsLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const filters: SubscriberFilters = {
        limit: pageSize + 1,
        offset,
        billingStatus: statusFilter !== 'all' ? (statusFilter as 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended') : undefined,
      };

      const response = await subscribersApi.list(filters);
      setHasMore(response.data.length > pageSize);
      setSubscribers(response.data.slice(0, pageSize));
    } catch (error) {
      console.error('Failed to fetch subscribers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch subscribers",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const plans = await plansApi.getAll();
      setAvailablePlans(plans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const fetchCSMs = async () => {
    try {
      const users = await usersApi.list({
        limit: 100,
        role: 'support_agent' as PlatformRoleCode // Assuming CSMs have this role
      });
      setAvailableCSMs(users.data);
    } catch (error) {
      console.error('Failed to fetch CSMs:', error);
      // Fallback to all users if role filtering fails
      try {
        const allUsers = await usersApi.list({ limit: 100 });
        setAvailableCSMs(allUsers.data);
      } catch (fallbackError) {
        console.error('Failed to fetch any users:', fallbackError);
      }
    }
  };


  const handleViewDetails = async (subscriber: SubscriberInfo) => {
    try {
      setSelectedSubscriber(subscriber);
      const details = await subscribersApi.getDetails(subscriber.tenantId);
      setSubscriberDetails(details);
      setNotes(details.notes || '');
      setTagsInput(details.tags ? details.tags.join(', ') : '');
      
      // Initialize general update data
      setGeneralUpdateData({
        displayName: details.displayName,
        ownerEmail: details.ownerEmail,
        billingStatus: details.billingStatus,
        kycStatus: details.kycStatus,
        tags: details.tags || [],
        notes: details.notes || '',
        assignedCsmId: details.assignedCsmId,
        mrrBand: details.mrrBand,
        churnRisk: details.churnRisk,
      });
      
      if (hasPermission(PERMISSIONS.SUBSCRIBERS.BILLING)) {
        try {
          const invoices = await invoicesApi.list({ tenantId: subscriber.tenantId, limit: 10, offset: 0 });
          setSubscriberInvoices(invoices.data);
        } catch (e) {
          setSubscriberInvoices([]);
        }
      } else {
        setSubscriberInvoices([]);
      }
      setIsDetailDrawerOpen(true);
    } catch (error) {
      console.error('Failed to fetch subscriber details:', error);
      toast({
        title: "Error",
        description: "Failed to load subscriber details",
        variant: "destructive"
      });
    }
  };

  const handleViewUsageHistory = async (subscriber: SubscriberInfo) => {
    if (!hasPermission(PERMISSIONS.SUBSCRIBERS.READ)) return;
    
    try {
      setIsLoadingUsage(true);
      setSelectedSubscriber(subscriber);
      const usage = await subscribersApi.getUsageHistory(subscriber.tenantId);
      setUsageHistory(usage);
      setShowUsageHistoryModal(true);
    } catch (error) {
      console.error('Failed to fetch usage history:', error);
      toast({
        title: "Error",
        description: "Failed to load usage history",
        variant: "destructive"
      });
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const handleViewSubscriberInvoices = async (subscriber: SubscriberInfo) => {
    if (!hasPermission(PERMISSIONS.SUBSCRIBERS.READ)) return;
    
    try {
      setIsLoadingInvoices(true);
      setSelectedSubscriber(subscriber);
      const invoices = await subscribersApi.getInvoices(subscriber.tenantId);
      setSubscriberInvoicesList(invoices);
      setShowInvoicesModal(true);
    } catch (error) {
      console.error('Failed to fetch subscriber invoices:', error);
      toast({
        title: "Error",
        description: "Failed to load subscriber invoices",
        variant: "destructive"
      });
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const handleGeneralUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber || !hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE)) return;
    
    try {
      setIsProcessing(true);
      await subscribersApi.update(selectedSubscriber.tenantId, generalUpdateData);

      toast({
        title: "Success",
        description: "Subscriber updated successfully"
      });

      setShowGeneralUpdateModal(false);
      const details = await subscribersApi.getDetails(selectedSubscriber.tenantId);
      setSubscriberDetails(details);
      fetchSubscribers();
    } catch (error) {
      console.error('Failed to update subscriber:', error);
      toast({
        title: "Error",
        description: "Failed to update subscriber",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber) return;
    
    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const planId = formData.get('plan') as string;

      const result = await subscribersApi.changePlan(selectedSubscriber.tenantId, {
        planId,
        scheduleAtPeriodEnd: false,
      });

      setShowPlanChangeModal(false);
      fetchSubscribers();

      if ('id' in result) {
        toast({
          title: "Success",
          description: `Plan changed successfully. Invoice ${result.id} generated`,
        });
      } else if ('effectiveAt' in result) {
        toast({
          title: "Success",
          description: `Plan change scheduled for ${new Date(result.effectiveAt).toLocaleDateString()}`,
        });
      } else {
        toast({
          title: "Success",
          description: 'Plan change processed',
        });
      }
    } catch (error) {
      console.error('Failed to change plan:', error);
      toast({
        title: "Error",
        description: "Failed to change plan",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreviewPlanChange = async () => {
    if (!selectedSubscriber) return;
    
    try {
      setIsProcessing(true);
      const planId = document.querySelector<HTMLSelectElement>('[name="plan"]')?.value;
      if (planId) {
        const preview = await subscribersApi.previewPlanChange(selectedSubscriber.tenantId, {
          planId,
        });
        setProrationPreview(preview);
      }
    } catch (error) {
      console.error('Failed to preview plan change:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber) return;

    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const couponCode = formData.get('couponCode') as string;
      const amount = parseFloat(formData.get('amount') as string);

      const subscriptionId =
        subscriberDetails?.subscription?.id ||
        document.querySelector<HTMLInputElement>('[name="subscriptionId"]')?.value;
      const planId = (subscriberDetails?.subscription as any)?.planId;

      const currency = (subscriberDetails?.subscription?.currency as 'USD' | 'INR') || 'USD';
      const validation = await couponsApi.validate({
        code: couponCode,
        ...(planId ? { planId } : {}),
        ...(subscriptionId ? { subscriptionId } : { currency }),
      });

      if (!validation.valid) {
        toast({
          title: 'Invalid coupon',
          description: validation.error || 'Coupon validation failed',
          variant: 'destructive',
        });
        return;
      }

      const redemption = await subscribersApi.applyCoupon(selectedSubscriber.tenantId, {
        couponCode,
        amountApplied: amount,
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(planId ? { planId } : {}),
        currency,
      });
      setShowCouponModal(false);
      fetchSubscribers();
      toast({
        title: 'Success',
        description: `Coupon applied successfully. Redemption ID ${redemption.id}`,
      });
    } catch (error) {
      console.error('Failed to apply coupon:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply coupon',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIssueCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber) return;
    
    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const amount = parseFloat(formData.get('amount') as string);
      const reason = formData.get('reason') as string;
      const notes = formData.get('notes') as string;
      
      const currency = selectedSubscriber.subscription?.currency as 'USD' | 'INR' | undefined;
      const note = await subscribersApi.issueCreditNote(selectedSubscriber.tenantId, {
        amount,
        reason,
        note: notes,
        ...(currency ? { currency } : {}),
      });

      setShowCreditNoteModal(false);
      fetchSubscribers();
      toast({
        title: "Success",
        description: `Credit note ${note.id} issued successfully`
      });
    } catch (error) {
      console.error('Failed to issue credit note:', error);
      toast({
        title: "Error",
        description: "Failed to issue credit note",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignCsm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber || !hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE)) return;

    const form = e.target as HTMLFormElement;
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        const formData = new FormData(form);
        const csmId = formData.get('csmId') as string;

        await subscribersApi.assignCsm(selectedSubscriber.tenantId, csmId);

        setShowAssignCsmModal(false);
        const details = await subscribersApi.getDetails(selectedSubscriber.tenantId);
        setSubscriberDetails(details);
        fetchSubscribers();
        toast({
          title: "Success",
          description: "CSM assigned successfully",
        });
      } catch (error) {
        console.error('Failed to assign CSM:', error);
        toast({
          title: "Error",
          description: "Failed to assign CSM",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.length === subscribers.length) {
      clearSelection();
    } else {
      setSelectedItems(subscribers.map(s => s.tenantId));
    }
  };

  const handleSelectSubscriber = (tenantId: string) => {
    if (selectedItems.includes(tenantId)) {
      removeSelectedItem(tenantId);
    } else {
      addSelectedItem(tenantId);
    }
  };

  const handleBulkAssignCsm = async (csmId: string) => {
    if (selectedItems.length === 0 || !hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE)) return;
    
    try {
      setIsProcessing(true);
      await Promise.all(
        selectedItems.map(tenantId => subscribersApi.assignCsm(tenantId, csmId))
      );
      
      toast({
        title: "Success",
        description: `${selectedItems.length} subscriber(s) assigned to CSM successfully`
      });
      
      clearSelection();
      fetchSubscribers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to bulk assign CSM",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTrialExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubscriber) return;
    
    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const days = parseInt(formData.get('days') as string);
      const reason = formData.get('reason') as string;
      
      const { newTrialEnd } = await subscribersApi.extendTrial(selectedSubscriber.tenantId, {
        extensionDays: days,
        reason
      });

      setShowTrialExtendModal(false);
      fetchSubscribers();
      toast({
        title: "Success",
        description: `Trial extended until ${new Date(newTrialEnd).toLocaleDateString()}`
      });
    } catch (error) {
      console.error('Failed to extend trial:', error);
      toast({
        title: "Error",
        description: "Failed to extend trial",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedSubscriber || !hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE)) return;
    try {
      setIsProcessing(true);
      await subscribersApi.updateNotes(selectedSubscriber.tenantId, notes);
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      await subscribersApi.updateTags(selectedSubscriber.tenantId, tags);
      const details = await subscribersApi.getDetails(selectedSubscriber.tenantId);
      setSubscriberDetails(details);
      toast({ title: 'Success', description: 'Subscriber details updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update subscriber details', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuspend = () => {
    if (!selectedSubscriber || !hasPermission(PERMISSIONS.SUBSCRIBERS.SUSPEND)) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        const res = await subscribersApi.suspend(selectedSubscriber.tenantId, 'Suspended by admin');
        toast({ title: 'Success', description: res.message });
        setIsDetailDrawerOpen(false);
        fetchSubscribers();
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to suspend subscriber', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleResume = () => {
    if (!selectedSubscriber || !hasPermission(PERMISSIONS.SUBSCRIBERS.SUSPEND)) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        const res = await subscribersApi.resume(selectedSubscriber.tenantId, 'Resumed by admin');
        toast({ title: 'Success', description: res.message });
        setIsDetailDrawerOpen(false);
        fetchSubscribers();
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to resume subscriber', variant: 'destructive' });
      } finally {
        setIsProcessing(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleEvictClient = () => {
    const canManage = hasPermission(PERMISSIONS.TENANTS.MANAGE);
    if (!selectedSubscriber || !canManage) return;
    setConfirmAction(() => async () => {
      try {
        setIsProcessing(true);
        await tenantsApi.evictClient(selectedSubscriber.tenantId);
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
    const statusConfig = {
      'active': { icon: CheckCircle, variant: 'default' as const, color: 'text-green-500' },
      'trialing': { icon: Clock, variant: 'secondary' as const, color: 'text-blue-500' },
      'past_due': { icon: AlertCircle, variant: 'destructive' as const, color: 'text-red-500' },
      'canceled': { icon: XCircle, variant: 'secondary' as const, color: 'text-gray-500' },
      'unpaid': { icon: CreditCard, variant: 'destructive' as const, color: 'text-red-500' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {status}
      </Badge>
    );
  };

  const getKycStatusBadge = (status: string) => {
    const statusConfig = {
      'approved': { text: 'Approved', variant: 'default' as const },
      'pending': { text: 'Pending', variant: 'secondary' as const },
      'rejected': { text: 'Rejected', variant: 'destructive' as const },
      'not_required': { text: 'Not Required', variant: 'outline' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

    return (
      <Badge variant={config.variant}>
        {config.text}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + subscribers.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Subscribers</h1>
          <p className="text-muted-foreground">
            Manage tenant subscriptions, billing, and customer success
          </p>
        </div>
        
        <div className="flex gap-2"></div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">
                {selectedItems.length} subscriber(s) selected
              </span>
              <div className="flex gap-2">
                {hasPermission(PERMISSIONS.PLATFORM_USERS.READ) && (
                  <Select onValueChange={handleBulkAssignCsm}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign CSM to selected" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCSMs.map(csm => (
                        <SelectItem key={csm.id} value={csm.id}>
                          {csm.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search subscribers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscribers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
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
              {subscribers.length === 0 ? (
                <div className="text-center py-8">
                  <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No subscribers found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your filters or check back later.
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
                            checked={selectedItems.length === subscribers.length && subscribers.length > 0}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-primary border-gray-300 rounded"
                          />
                        </th>
                        <th className="text-left py-3 px-4 font-medium">Subscriber</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Plan</th>
                        <th className="text-left py-3 px-4 font-medium">KYC</th>
                        <th className="text-left py-3 px-4 font-medium">MRR</th>
                        <th className="text-left py-3 px-4 font-medium">Created</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscribers.map((subscriber) => (
                        <tr key={subscriber.tenantId} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedItems.includes(subscriber.tenantId)}
                              onChange={() => handleSelectSubscriber(subscriber.tenantId)}
                              className="h-4 w-4 text-primary border-gray-300 rounded"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{subscriber.displayName}</div>
                              <div className="text-sm text-muted-foreground">{subscriber.ownerEmail}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(subscriber.billingStatus)}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">
                                {subscriber.subscription?.plan.marketingName || 'No Plan'}
                              </div>
                              {subscriber.subscription && (
                                <div className="text-sm text-muted-foreground">
                                  {formatMoney(
                                    subscriber.subscription.price,
                                    subscriber.subscription.currency as 'USD' | 'INR'
                                  )}/mo
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getKycStatusBadge(subscriber.kycStatus)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {subscriber.subscription
                                ? formatMoney(
                                    subscriber.subscription.price,
                                    subscriber.subscription.currency as 'USD' | 'INR'
                                  )
                                : formatMoney(0, 'USD')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">
                              {new Date(subscriber.tenant.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(subscriber)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewUsageHistory(subscriber)}
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewSubscriberInvoices(subscriber)}
                              >
                                <CreditCard className="h-4 w-4" />
                              </Button>
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
          {(subscribers.length > 0 && (currentPage > 1 || hasMore)) && (
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

      {/* Subscriber Detail Drawer */}
      <ModalWrapper
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        title={`Subscriber Details: ${selectedSubscriber?.displayName || 'Unknown'}`}
        size="2xl"
      >
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Subscription Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Current Plan</Label>
                      <p className="text-2xl font-bold">
                        {selectedSubscriber?.subscription?.plan.marketingName || 'No Plan'}
                      </p>
                      {selectedSubscriber?.subscription && (
                        <p className="text-muted-foreground">
                          {formatMoney(
                            selectedSubscriber.subscription.price,
                            selectedSubscriber.subscription.currency as 'USD' | 'INR'
                          )}/month
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Status</Label>
                      <div className="mt-1">
                        {selectedSubscriber && getStatusBadge(selectedSubscriber.billingStatus)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setGeneralUpdateData({
                              displayName: subscriberDetails?.displayName || selectedSubscriber?.displayName || '',
                              ownerEmail: subscriberDetails?.ownerEmail || selectedSubscriber?.ownerEmail || '',
                              billingStatus: subscriberDetails?.billingStatus || selectedSubscriber?.billingStatus || 'trialing',
                              kycStatus: subscriberDetails?.kycStatus || selectedSubscriber?.kycStatus || 'pending',
                              tags: subscriberDetails?.tags || selectedSubscriber?.tags || [],
                              notes: subscriberDetails?.notes || selectedSubscriber?.notes || '',
                              assignedCsmId: subscriberDetails?.assignedCsmId || selectedSubscriber?.assignedCsmId,
                              mrrBand: subscriberDetails?.mrrBand || selectedSubscriber?.mrrBand,
                              churnRisk: subscriberDetails?.churnRisk || selectedSubscriber?.churnRisk,
                            });
                            setShowGeneralUpdateModal(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Details
                        </Button>
                        {hasPermission(PERMISSIONS.SUBSCRIBERS.BILLING) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowPlanChangeModal(true)}
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              Change Plan
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowTrialExtendModal(true)}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              Extend Trial
                            </Button>
                          </>
                        )}
                        {hasPermission(PERMISSIONS.COUPONS.REDEEM) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCouponModal(true)}
                          >
                            <Tag className="h-4 w-4 mr-2" />
                            Apply Coupon
                          </Button>
                        )}
                        {hasPermission(PERMISSIONS.CREDIT_NOTES.ISSUE) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCreditNoteModal(true)}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Issue Credit Note
                          </Button>
                        )}
                      </>
                    )}
                    {hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && hasPermission(PERMISSIONS.PLATFORM_USERS.READ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAssignCsmModal(true)}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Assign CSM
                      </Button>
                    )}
                    {hasPermission(PERMISSIONS.TENANTS.MANAGE) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEvictClient}
                      >
                        Evict Client
                      </Button>
                    )}
                    {hasPermission(PERMISSIONS.SUBSCRIBERS.SUSPEND) && (
                      selectedSubscriber?.billingStatus === 'suspended' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResume}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSuspend}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" />
                          Suspend
                        </Button>
                      )
                    )}
                  </div>
                </div>

                {/* Usage Charts */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Usage Analytics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Monthly Usage Trend</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {subscriberDetails?.usageRecords && subscriberDetails.usageRecords.length > 0 ? (
                          <div className="space-y-2">
                            {subscriberDetails.usageRecords.map((record: any, index: number) => (
                              <div key={index} className="flex justify-between items-center">
                                <span className="text-sm">{record.date}</span>
                                <span className="text-sm font-medium">{record.usage}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-32 flex items-center justify-center bg-muted/30 rounded">
                            <div className="text-center">
                              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-sm text-muted-foreground">No usage data available</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Feature Adoption</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm">API Calls</span>
                            <span className="text-sm font-medium">85%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: '85%' }}></div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Dashboard Views</span>
                            <span className="text-sm font-medium">60%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: '60%' }}></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Dunning History</h3>
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                      {subscriberDetails?.dunningHistory && subscriberDetails.dunningHistory.length > 0 ? (
                        subscriberDetails.dunningHistory.map((item: any, index: number) => (
                          <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                            <div>
                              <p className="font-medium">{item.event}</p>
                              <p className="text-sm text-muted-foreground">{new Date(item.date).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.amount}</span>
                              <Badge variant={item.status === 'success' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          No dunning history available
                        </div>
                      )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {hasPermission(PERMISSIONS.SUBSCRIBERS.BILLING) && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recent Invoices</h3>
                    {subscriberInvoices.length > 0 ? (
                      <ul className="divide-y">
                        {subscriberInvoices.map((inv: any) => (
                          <li key={inv.id} className="flex justify-between py-2">
                            <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                            <span>${inv.total}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No invoices found</p>
                    )}
                  </div>
                )}

                {/* Tags and Notes */}
                {hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Tags</h3>
                        <Input
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          placeholder="Comma separated tags"
                        />
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold mb-4">Notes</h3>
                        <Textarea
                          placeholder="Add notes about this subscriber..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button size="sm" onClick={handleSaveDetails} disabled={isProcessing}>
                        Save
                      </Button>
                    </div>
                  </>
                )}
              </div>
      </ModalWrapper>

      {/* Plan Change Modal */}
      {hasPermission(PERMISSIONS.SUBSCRIBERS.BILLING) && (
        <ModalWrapper
          isOpen={showPlanChangeModal}
          onClose={() => setShowPlanChangeModal(false)}
          title="Change Plan"
          size="md"
        >
        <form onSubmit={handlePlanChange} className="space-y-4">
          <div>
            <Label htmlFor="plan">New Plan</Label>
            <Select name="plan" required>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {availablePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.marketingName} - {formatMoney(plan.prices.USD.monthly, 'USD')} / {formatMoney(plan.prices.INR.monthly, 'INR')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Plan changes take effect immediately. Custom effective dates are not currently supported.
            </p>
          </div>

          {/* Proration Preview */}
          {prorationPreview && (
            <div className="bg-muted p-3 rounded-lg">
              <h4 className="font-medium mb-2">Proration Preview</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Proration amount:</span>
                  <span>${prorationPreview.amount - prorationPreview.taxAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({prorationPreview.taxPercent * 100}%):</span>
                  <span>${prorationPreview.taxAmount}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Total due:</span>
                  <span>${prorationPreview.amount}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handlePreviewPlanChange}>
              Preview Changes
            </Button>
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? 'Changing...' : 'Change Plan'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowPlanChangeModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
        </ModalWrapper>
      )}

      {/* Apply Coupon Modal */}
      {hasPermission(PERMISSIONS.COUPONS.REDEEM) && (
        <ModalWrapper
          isOpen={showCouponModal}
          onClose={() => setShowCouponModal(false)}
          title="Apply Coupon"
          size="md"
        >
        <form onSubmit={handleApplyCoupon} className="space-y-4">
          <div>
            <Label htmlFor="couponCode">Coupon Code</Label>
            <Input
              name="couponCode"
              placeholder="Enter coupon code"
              required
            />
          </div>

          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="Enter amount"
              required
            />
          </div>
          {!subscriberDetails?.subscription?.id && (
            <div>
              <Label htmlFor="subscriptionId">Subscription ID</Label>
              <Input
                name="subscriptionId"
                placeholder="Enter subscription ID"
                required
              />
            </div>
          )}
          
          <div className="flex gap-2">
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? 'Applying...' : 'Apply Coupon'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowCouponModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
        </ModalWrapper>
      )}

      {/* Credit Note Modal */}
      {hasPermission(PERMISSIONS.CREDIT_NOTES.ISSUE) && (
        <ModalWrapper
          isOpen={showCreditNoteModal}
          onClose={() => setShowCreditNoteModal(false)}
          title="Issue Credit Note"
          size="md"
        >
        <form onSubmit={handleIssueCreditNote} className="space-y-4">
          <div>
            <Label htmlFor="amount">Credit Amount</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Select name="reason" required>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="goodwill">Goodwill gesture</SelectItem>
                <SelectItem value="billing_error">Billing error</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              name="notes"
              placeholder="Additional notes"
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? 'Issuing...' : 'Issue Credit Note'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowCreditNoteModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
        </ModalWrapper>
      )}

      {/* Assign CSM Modal */}
      {hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && hasPermission(PERMISSIONS.PLATFORM_USERS.READ) && (
        <ModalWrapper
          isOpen={showAssignCsmModal}
          onClose={() => setShowAssignCsmModal(false)}
          title="Assign Customer Success Manager"
          size="md"
        >
          <form onSubmit={handleAssignCsm} className="space-y-4">
            <div>
              <Label htmlFor="csmId">CSM</Label>
              <Select name="csmId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select CSM" />
                </SelectTrigger>
                <SelectContent>
                  {availableCSMs.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? 'Assigning...' : 'Assign CSM'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAssignCsmModal(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* Trial Extension Modal */}
      {hasPermission(PERMISSIONS.SUBSCRIBERS.BILLING) && (
        <ModalWrapper
          isOpen={showTrialExtendModal}
          onClose={() => setShowTrialExtendModal(false)}
          title="Extend Trial"
          size="md"
        >
        <form onSubmit={handleTrialExtend} className="space-y-4">
          <div>
            <Label htmlFor="days">Extension Days</Label>
            <Input
              name="days"
              type="number"
              min="1"
              max="90"
              defaultValue="7"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              name="reason"
              placeholder="Reason for trial extension"
              required
            />
          </div>
          
          <div className="flex gap-2">
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? 'Extending...' : 'Extend Trial'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowTrialExtendModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
        </ModalWrapper>
      )}

      {/* Usage History Modal */}
      <ModalWrapper
        isOpen={showUsageHistoryModal}
        onClose={() => setShowUsageHistoryModal(false)}
        title={`Usage History: ${selectedSubscriber?.displayName || 'Unknown'}`}
        size="2xl"
      >
        <div className="space-y-4">
          {isLoadingUsage ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded bg-muted h-12 w-full"></div>
                </div>
              ))}
            </div>
          ) : usageHistory.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No usage data found</h3>
              <p className="text-muted-foreground">This subscriber has no recorded usage history.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Meter</th>
                    <th className="text-left py-3 px-4 font-medium">Quantity</th>
                    <th className="text-left py-3 px-4 font-medium">Unit</th>
                    <th className="text-left py-3 px-4 font-medium">Resource</th>
                    <th className="text-left py-3 px-4 font-medium">Occurred At</th>
                  </tr>
                </thead>
                <tbody>
                  {usageHistory.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <span className="font-medium">{record.meter}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono">{record.quantity.toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">{record.unit}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground font-mono">
                          {record.resourceId || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {new Date(record.occurredAt).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ModalWrapper>

      {/* Subscriber Invoices Modal */}
      <ModalWrapper
        isOpen={showInvoicesModal}
        onClose={() => setShowInvoicesModal(false)}
        title={`Invoices: ${selectedSubscriber?.displayName || 'Unknown'}`}
        size="2xl"
      >
        <div className="space-y-4">
          {isLoadingInvoices ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded bg-muted h-16 w-full"></div>
                </div>
              ))}
            </div>
          ) : subscriberInvoicesList.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No invoices found</h3>
              <p className="text-muted-foreground">This subscriber has no invoices.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Invoice ID</th>
                    <th className="text-left py-3 px-4 font-medium">Amount</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Due Date</th>
                    <th className="text-left py-3 px-4 font-medium">Paid At</th>
                    <th className="text-left py-3 px-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriberInvoicesList.map((invoice) => (
                    <tr key={invoice.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className="font-mono text-sm">{invoice.id}</span>
                          {invoice.number && (
                            <div className="text-xs text-muted-foreground font-mono">
                              Number: {invoice.number}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium">
                          {formatMoney(invoice.amount || 0, (invoice.currency as 'USD' | 'INR') || 'USD')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge 
                          variant={
                            invoice.status === 'paid' ? 'default' :
                            invoice.status === 'draft' ? 'secondary' :
                            invoice.status === 'sent' ? 'secondary' :
                            invoice.status === 'overdue' ? 'destructive' : 'outline'
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {new Date(invoice.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ModalWrapper>

      {/* General Update Modal */}
      {hasPermission(PERMISSIONS.SUBSCRIBERS.WRITE) && (
        <ModalWrapper
          isOpen={showGeneralUpdateModal}
          onClose={() => setShowGeneralUpdateModal(false)}
          title={`Update Subscriber: ${selectedSubscriber?.displayName || 'Unknown'}`}
          size="lg"
        >
          <form onSubmit={handleGeneralUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={generalUpdateData.displayName || ''}
                  onChange={(e) => setGeneralUpdateData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Company display name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner Email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={generalUpdateData.ownerEmail || ''}
                  onChange={(e) => setGeneralUpdateData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                  placeholder="owner@company.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingStatus">Billing Status</Label>
                <Select 
                  value={generalUpdateData.billingStatus || ''} 
                  onValueChange={(value) => setGeneralUpdateData(prev => ({ 
                    ...prev, 
                    billingStatus: value as 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended'
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select billing status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="kycStatus">KYC Status</Label>
                <Select 
                  value={generalUpdateData.kycStatus || ''} 
                  onValueChange={(value) => setGeneralUpdateData(prev => ({ 
                    ...prev, 
                    kycStatus: value as 'pending' | 'verified' | 'rejected'
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select KYC status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mrrBand">MRR Band</Label>
                <Select
                  value={generalUpdateData.mrrBand || 'none'}
                  onValueChange={(value) => setGeneralUpdateData(prev => ({ ...prev, mrrBand: value === 'none' ? undefined : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select MRR band" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="0-100">$0 - $100</SelectItem>
                    <SelectItem value="100-500">$100 - $500</SelectItem>
                    <SelectItem value="500-1000">$500 - $1,000</SelectItem>
                    <SelectItem value="1000+">$1,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="churnRisk">Churn Risk</Label>
                <Select
                  value={generalUpdateData.churnRisk || 'none'}
                  onValueChange={(value) => setGeneralUpdateData(prev => ({ ...prev, churnRisk: value === 'none' ? undefined : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select churn risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedCsmId">Assigned CSM</Label>
              <Select
                value={generalUpdateData.assignedCsmId || 'unassigned'}
                onValueChange={(value) => setGeneralUpdateData(prev => ({ ...prev, assignedCsmId: value === 'unassigned' ? undefined : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select CSM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {availableCSMs.map(csm => (
                    <SelectItem key={csm.id} value={csm.id}>
                      {csm.name} ({csm.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={generalUpdateData.tags?.join(', ') || ''}
                onChange={(e) => {
                  const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                  setGeneralUpdateData(prev => ({ ...prev, tags }));
                }}
                placeholder="Comma separated tags"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="generalNotes">Notes</Label>
              <Textarea
                id="generalNotes"
                value={generalUpdateData.notes || ''}
                onChange={(e) => setGeneralUpdateData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add notes about this subscriber..."
                className="min-h-[100px]"
              />
            </div>
            
            <div className="flex gap-2">
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? 'Updating...' : 'Update Subscriber'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowGeneralUpdateModal(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalWrapper>
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
        description="Are you sure you want to perform this action?"
        confirmText="Confirm"
        isLoading={isProcessing}
      />
    </div>
  );
}