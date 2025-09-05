import { useState, useEffect } from 'react';
import { usePagination } from '@/hooks/usePlatformStore';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Filter,
  Plus,
  Edit,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,

  Percent,
  DollarSign,
  BarChart3,
  Calculator
} from 'lucide-react';
import { couponsApi, type CouponFilters, type CouponPreview } from '@/api/platform/coupons';
import type { PlatformCouponData, CouponRedemption } from '@/types/platform';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { toast } from '@/hooks/use-toast';
import { PERMISSIONS } from '@/constants/permissions';
import { formatMoney } from '@/utils/formatMoney';
export default function PlatformCoupons() {
  const [coupons, setCoupons] = useState<(PlatformCouponData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentPage, pageSize, setCurrentPage } = usePagination();
  const { platformPermissions, platformUser } = usePlatformAuth();

  const [hasMore, setHasMore] = useState(false);

  const hasPermission = (perm: string) =>
    platformUser?.roles.includes('super_admin') || platformPermissions.includes(perm);
  
  const [selectedCoupon, setSelectedCoupon] = useState<(PlatformCouponData & { id: string }) | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<PlatformCouponData>({
    code: '',
    type: 'percent',
    amount: 0,
    amountUsd: 0,
    amountInr: 0,
    duration: 'once',
    active: true
  });

  const [createType, setCreateType] = useState<'percent' | 'fixed'>('percent');
  
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<CouponPreview | null>(null);
  const [usageData, setUsageData] = useState<CouponRedemption[]>([]);
  const [previewCurrency, setPreviewCurrency] = useState<'USD' | 'INR'>('USD');
  
  const [filters, setFilters] = useState({
    type: '',
    active: ''
  });

  useEffect(() => {
    fetchCoupons();
  }, [currentPage, pageSize, filters]);

  const fetchCoupons = async () => {
    try {
      setIsLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const apiFilters: CouponFilters = {
        limit: pageSize + 1,
        offset,
        active: filters.active ? filters.active === 'true' : undefined,
        type: filters.type as 'percent' | 'fixed' || undefined,
      };

      const { data } = await couponsApi.list(apiFilters);
      setHasMore(data.length > pageSize);
      setCoupons(data.slice(0, pageSize));
    } catch (error) {
      console.error('Failed to fetch coupons:', error);
      toast({
        title: "Error",
        description: "Failed to fetch coupons",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      
      const type = formData.get('type') as 'percent' | 'fixed';
      const couponData: any = {
        code: formData.get('code') as string,
        type,
        duration: formData.get('duration') as 'once' | 'repeating' | 'forever',
        durationInMonths: formData.get('durationInMonths') ? parseInt(formData.get('durationInMonths') as string) : undefined,
        maxRedemptions: formData.get('maxRedemptions') ? parseInt(formData.get('maxRedemptions') as string) : undefined,
        redeemBy: formData.get('redeemBy')
          ? new Date(formData.get('redeemBy') as string).toISOString()
          : undefined,
        appliesToPlanIds: [],
        active: true,
      };
      if (type === 'percent') {
        couponData.amount = parseFloat(formData.get('amount') as string);
      } else {
        couponData.amountUsd = parseFloat(formData.get('amountUsd') as string);
        couponData.amountInr = parseFloat(formData.get('amountInr') as string);
      }

      await couponsApi.create(couponData);
      setShowCreateModal(false);
      fetchCoupons();
      toast({
        title: "Success",
        description: "Coupon created successfully"
      });
    } catch (error) {
      console.error('Failed to create coupon:', error);
      toast({
        title: "Error",
        description: "Failed to create coupon",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditCoupon = (coupon: PlatformCouponData & { id: string }) => {
    setSelectedCoupon(coupon);
    setEditFormData({
      code: coupon.code,
      type: coupon.type,
      amount: coupon.amount,
      amountUsd: coupon.amountUsd,
      amountInr: coupon.amountInr,
      duration: coupon.duration,
      durationInMonths: coupon.durationInMonths,
      maxRedemptions: coupon.maxRedemptions,
      redeemBy: coupon.redeemBy,
      active: coupon.active || false,
    });
    setShowEditModal(true);
  };

  const handleUpdateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCoupon) return;
    
    try {
      setIsProcessing(true);
      const payload: any = {
        code: editFormData.code,
        type: editFormData.type,
        duration: editFormData.duration,
        durationInMonths: editFormData.durationInMonths,
        maxRedemptions: editFormData.maxRedemptions,
        redeemBy: editFormData.redeemBy,
        active: editFormData.active,
      };
      if (editFormData.type === 'percent') {
        payload.amount = editFormData.amount;
      } else {
        payload.amountUsd = editFormData.amountUsd;
        payload.amountInr = editFormData.amountInr;
      }
      await couponsApi.update(selectedCoupon.id, payload);
      setShowEditModal(false);
      fetchCoupons();
      toast({
        title: "Success",
        description: "Coupon updated successfully"
      });
    } catch (error) {
      console.error('Failed to update coupon:', error);
      toast({
        title: "Error",
        description: "Failed to update coupon",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleCouponStatus = async (couponId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this coupon?`)) {
      return;
    }
    
    try {
      setIsProcessing(true);
      if (currentStatus) {
        await couponsApi.deactivate(couponId);
      } else {
        await couponsApi.activate(couponId);
      }
      fetchCoupons();
      toast({
        title: "Success",
        description: `Coupon ${action}d successfully`
      });
    } catch (error) {
      console.error('Failed to toggle coupon status:', error);
      toast({
        title: "Error",
        description: "Failed to update coupon status",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchUsageData = async (couponId: string) => {
    try {
      setIsProcessing(true);
      const redemptions = await couponsApi.getUsage(couponId);
      setUsageData(redemptions);
      setShowUsageModal(true);
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch usage stats",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreviewCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoupon) return;
    
    try {
      setIsProcessing(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const planId = formData.get('planId') as string;
      const amount = Number(formData.get('amount'));
      const subscriptionId = formData.get('subscriptionId') as string | null;

      const payload: any = {
        couponCode: selectedCoupon.code,
        planId,
        amount,
      };
      if (subscriptionId) {
        payload.subscriptionId = subscriptionId;
      } else {
        payload.currency = previewCurrency;
      }
      const preview = await couponsApi.preview(payload);
      setPreviewData(preview);
    } catch (error) {
      console.error('Failed to preview coupon:', error);
      toast({
        title: "Error",
        description: "Failed to preview coupon",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };


  const getTypeBadge = (type: string) => {
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        {type === 'percent' ? (
          <Percent className="h-3 w-3" />
        ) : (
          <DollarSign className="h-3 w-3" />
        )}
        {type === 'percent' ? 'Percentage' : 'Fixed Amount'}
      </Badge>
    );
  };

  const getDurationBadge = (duration: string, months?: number) => {
    const durationMap = {
      once: 'One-time',
      repeating: `Repeating${months ? ` (${months}mo)` : ''}`,
      forever: 'Forever'
    };

    return (
      <Badge variant="outline">
        {durationMap[duration as keyof typeof durationMap] || duration}
      </Badge>
    );
  };

  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = showingFrom + coupons.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Coupons & Discounts</h1>
          <p className="text-muted-foreground">
            Manage promotional codes and discount campaigns
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Coupon
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={filters.active} onValueChange={(value) => setFilters(prev => ({ ...prev, active: value }))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Code</th>
                    <th className="text-left py-3 px-4 font-medium">Type</th>
                    <th className="text-left py-3 px-4 font-medium">Discount</th>
                    <th className="text-left py-3 px-4 font-medium">Duration</th>
                    <th className="text-left py-3 px-4 font-medium">Usage</th>
                    <th className="text-left py-3 px-4 font-medium">Expires</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {coupon.code}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        {getTypeBadge(coupon.type)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium">
                          {coupon.type === 'percent'
                            ? `${coupon.amount}%`
                            : `${formatMoney(Math.round((coupon.amountUsd || 0) * 100), 'USD')} / ${formatMoney(Math.round((coupon.amountInr || 0) * 100), 'INR')}`
                          }
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {getDurationBadge(coupon.duration, coupon.durationInMonths)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {coupon.maxRedemptions ? `0 / ${coupon.maxRedemptions}` : 'Unlimited'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {coupon.redeemBy 
                            ? new Date(coupon.redeemBy).toLocaleDateString()
                            : 'No expiry'
                          }
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCouponStatus(coupon.id, coupon.active || false)}
                          className="p-1"
                        >
                          {coupon.active ? (
                            <ToggleRight className="h-5 w-5 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchUsageData(coupon.id)}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCoupon(coupon);
                              setShowPreviewModal(true);
                            }}
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                          
                          {hasPermission(PERMISSIONS.COUPONS.WRITE) && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditCoupon(coupon)}
                            >
                              <Edit className="h-4 w-4" />
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

          {/* Pagination */}
          {(coupons.length > 0 && (currentPage > 1 || hasMore)) && (
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

      {/* Create Coupon Modal */}
      <ModalWrapper
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Coupon"
        size="md"
      >
            
            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div>
                <Label htmlFor="code">Coupon Code</Label>
                <Input
                  name="code"
                  placeholder="SAVE20"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="type">Discount Type</Label>
                <Select name="type" value={createType} onValueChange={(v) => setCreateType(v as 'percent' | 'fixed')} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createType === 'percent' ? (
                <div>
                  <Label htmlFor="amount">Amount (%)</Label>
                  <Input name="amount" type="number" step="0.01" placeholder="20" required />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amountUsd">Face Value (USD)</Label>
                    <Input name="amountUsd" type="number" step="0.01" placeholder="10" required />
                  </div>
                  <div>
                    <Label htmlFor="amountInr">Face Value (INR)</Label>
                    <Input name="amountInr" type="number" step="0.01" placeholder="1000" required />
                  </div>
                </div>
              )}
              
              <div>
                <Label htmlFor="duration">Duration</Label>
                <Select name="duration" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">One-time use</SelectItem>
                    <SelectItem value="repeating">Repeating</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="maxRedemptions">Max Redemptions (optional)</Label>
                <Input
                  name="maxRedemptions"
                  type="number"
                  placeholder="Leave empty for unlimited"
                />
              </div>
              
              <div>
                <Label htmlFor="redeemBy">Expiry Date (optional)</Label>
                <Input
                  name="redeemBy"
                  type="date"
                />
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Creating...' : 'Create Coupon'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
      </ModalWrapper>

      {/* Edit Coupon Modal */}
      <ModalWrapper
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit Coupon: ${selectedCoupon?.code}`}
        size="md"
      >
            
            <form onSubmit={handleUpdateCoupon} className="space-y-4">
              <div>
                <Label htmlFor="edit-code">Coupon Code</Label>
                <Input
                  id="edit-code"
                  value={editFormData.code}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, code: e.target.value }))}
                  required
                  disabled
                />
              </div>
              
              <div>
                <Label htmlFor="edit-type">Discount Type</Label>
                <Select 
                  value={editFormData.type} 
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, type: value as 'percent' | 'fixed' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {editFormData.type === 'percent' ? (
                <div>
                  <Label htmlFor="edit-amount">Amount (%)</Label>
                  <Input
                    id="edit-amount"
                    type="number"
                    step="0.01"
                    value={editFormData.amount}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-amountUsd">Face Value (USD)</Label>
                    <Input
                      id="edit-amountUsd"
                      type="number"
                      step="0.01"
                      value={editFormData.amountUsd || 0}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, amountUsd: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-amountInr">Face Value (INR)</Label>
                    <Input
                      id="edit-amountInr"
                      type="number"
                      step="0.01"
                      value={editFormData.amountInr || 0}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, amountInr: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                </div>
              )}
              
              <div>
                <Label htmlFor="edit-duration">Duration</Label>
                <Select 
                  value={editFormData.duration} 
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, duration: value as 'once' | 'repeating' | 'forever' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">One-time use</SelectItem>
                    <SelectItem value="repeating">Repeating</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="edit-maxRedemptions">Max Redemptions (optional)</Label>
                <Input
                  id="edit-maxRedemptions"
                  type="number"
                  value={editFormData.maxRedemptions || ''}
                  onChange={(e) => setEditFormData(prev => ({ 
                    ...prev, 
                    maxRedemptions: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              
              <div>
                <Label htmlFor="edit-redeemBy">Expiry Date (optional)</Label>
                <Input
                  id="edit-redeemBy"
                  type="date"
                  value={editFormData.redeemBy ? new Date(editFormData.redeemBy).toISOString().split('T')[0] : ''}
                  onChange={(e) =>
                    setEditFormData(prev => ({
                      ...prev,
                      redeemBy: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    }))
                  }
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editFormData.active}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, active: e.target.checked }))}
                />
                <Label htmlFor="edit-active">Active</Label>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Updating...' : 'Update Coupon'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
      </ModalWrapper>

      {/* Preview Modal */}
      <ModalWrapper
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={`Preview Coupon: ${selectedCoupon?.code}`}
        size="md"
      >
            
            <form onSubmit={handlePreviewCoupon} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planId">Plan ID</Label>
                <Input name="planId" placeholder="plan_123" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (cents)</Label>
                <Input name="amount" type="number" placeholder="1000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" value={previewCurrency} onValueChange={(v) => setPreviewCurrency(v as 'USD' | 'INR')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscriptionId">Subscription ID (optional)</Label>
                <Input name="subscriptionId" placeholder="sub_1234567890" />
              </div>
              
              {previewData && (
                <div className="bg-muted p-3 rounded-lg">
                  <h4 className="font-medium mb-2">Preview Results</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>{formatMoney(Math.round((previewData.discount || 0) * 100), previewCurrency)}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Final amount:</span>
                      <span>{formatMoney(Math.round((previewData.finalAmount || 0) * 100), previewCurrency)}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button type="submit" disabled={isProcessing}>
                  {isProcessing ? 'Calculating...' : 'Calculate Preview'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowPreviewModal(false)}
                >
                  Close
                </Button>
              </div>
            </form>
      </ModalWrapper>

      {/* Usage Analytics Modal */}
      <ModalWrapper
        isOpen={showUsageModal}
        onClose={() => setShowUsageModal(false)}
        title="Usage Analytics"
        size="2xl"
      >
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{usageData.length}</div>
              <div className="text-sm text-muted-foreground">Total Redemptions</div>
            </CardContent>
          </Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Tenant ID</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Redeemed At</th>
                </tr>
              </thead>
              <tbody>
                {usageData.map(redemption => (
                  <tr key={redemption.id} className="border-b last:border-none">
                    <td className="p-2">{redemption.tenantId}</td>
                    <td className="p-2">${redemption.amountApplied}</td>
                    <td className="p-2">{new Date(redemption.redeemedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ModalWrapper>
    </div>
  );
}