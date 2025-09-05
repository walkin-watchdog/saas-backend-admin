import { useState, useEffect } from 'react';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
// import { CopyButton } from '@/components/ui/copy-button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Eye, EyeOff, ToggleLeft, ToggleRight } from 'lucide-react';
import { plansApi, type PlanCreateData, type PlanUpdateData } from '@/api/platform/plans';
import type { Plan } from '@/types/platform';
import { formatMoney } from '@/utils/formatMoney';
import { toast } from '@/hooks/use-toast';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { PERMISSIONS } from '@/constants/permissions';

export default function PlatformPlans() {
  const { platformPermissions, platformUser } = usePlatformAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  
  const [formData, setFormData] = useState<PlanCreateData>({
    code: '',
    priceMonthlyUsd: 0,
    priceYearlyUsd: 0,
    priceMonthlyInr: 0,
    priceYearlyInr: 0,
    billingFrequency: 'monthly',
    marketingName: '',
    marketingDescription: '',
    featureHighlights: [] as string[],
    public: true,
  });

  
  const hasPermission = (permission: string) => {
    return (
      platformUser?.roles.includes('super_admin') ||
      platformPermissions.includes(permission)
    );
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const data = await plansApi.getAll();
      setPlans(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch plans', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePlan = () => {
    setIsEditing(false);
    setSelectedPlan(null);
    setFormData({
      code: '',
      priceMonthlyUsd: 0,
      priceYearlyUsd: 0,
      priceMonthlyInr: 0,
      priceYearlyInr: 0,
      billingFrequency: 'monthly',
      marketingName: '',
      marketingDescription: '',
      featureHighlights: [] as string[],
      public: true,
    });
    setIsModalOpen(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setIsEditing(true);
    setSelectedPlan(plan);
    setFormData({
      code: plan.code,
      priceMonthlyUsd: plan.prices.USD.monthly / 100,
      priceYearlyUsd: plan.prices.USD.yearly / 100,
      priceMonthlyInr: plan.prices.INR.monthly / 100,
      priceYearlyInr: plan.prices.INR.yearly / 100,
      billingFrequency: plan.billingFrequency,
      marketingName: plan.marketingName,
      marketingDescription: plan.marketingDescription,
      featureHighlights: plan.featureHighlights || [],
      public: plan.public,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const { priceMonthlyUsd, priceYearlyUsd, priceMonthlyInr, priceYearlyInr } = formData;
    if (!formData.code || !formData.marketingName) {
      toast({ title: 'Error', description: 'Code and marketing name are required', variant: 'destructive' });
      return;
    }
    if ([priceMonthlyUsd, priceYearlyUsd, priceMonthlyInr, priceYearlyInr].some(v => !v)) {
      toast({ title: 'Error', description: 'All price fields are required', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (isEditing && selectedPlan) {
        await plansApi.update(selectedPlan.id, formData as PlanUpdateData);
        toast({ title: 'Success', description: 'Plan updated successfully' });
      } else {
        await plansApi.create(formData);
        toast({ title: 'Success', description: 'Plan created successfully' });
      }
      
      setIsModalOpen(false);
      fetchPlans();
    } catch (error) {
      toast({ title: 'Error', description: `Failed to ${isEditing ? 'update' : 'create'} plan`, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    setShowConfirmModal(true);
    setConfirmAction(() => async () => {
      try {
        // Soft delete by deactivating
        await plansApi.setActive(planId, false);
        toast({ title: 'Success', description: 'Plan deactivated successfully' });
        fetchPlans();
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to deactivate plan', variant: 'destructive' });
      }
    });
  };

  const togglePlanVisibility = async (planId: string, isPublic: boolean) => {
    try {
      await plansApi.setPublic(planId, !isPublic);
      toast({ title: 'Success', description: `Plan ${!isPublic ? 'published' : 'hidden'} successfully` });
      fetchPlans();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update plan visibility', variant: 'destructive' });
    }
  };

  const togglePlanActive = async (planId: string, active: boolean) => {
    try {
      await plansApi.setActive(planId, !active);
      toast({
        title: 'Success',
        description: `Plan ${!active ? 'activated' : 'deactivated'} successfully`,
      });
      fetchPlans();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update plan status',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (plan: Plan) => {
    if (!plan.active) {
      return <Badge variant="destructive">Inactive</Badge>;
    }
    return plan.public ? (
      <Badge variant="default">Public</Badge>
    ) : (
      <Badge variant="secondary">Private</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Plans Management</h1>
          <p className="text-muted-foreground">
            Create and manage subscription plans
          </p>
        </div>
        
        {hasPermission(PERMISSIONS.PLANS.WRITE) && (
          <Button onClick={handleCreatePlan}>
            <Plus className="h-4 w-4 mr-2" />
            Create Plan
          </Button>
        )}
      </div>

      {/* Plans Table */}
      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="rounded-md bg-muted h-12 w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {plans.length === 0 ? (
                <div className="text-center py-8">
                  <h3 className="text-lg font-medium mb-2">No plans found</h3>
                  <p className="text-muted-foreground">
                    Create your first plan to get started.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Plan</th>
                        <th className="text-left py-3 px-4 font-medium">Code</th>
                        <th className="text-left py-3 px-4 font-medium">Monthly Price</th>
                        <th className="text-left py-3 px-4 font-medium">Yearly Price</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Version</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((plan) => (
                        <tr key={plan.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{plan.marketingName}</p>
                              <p className="text-sm text-muted-foreground">
                                {plan.marketingDescription}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                              {plan.code}
                            </code>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {formatMoney(plan.prices.USD.monthly, 'USD')} / {formatMoney(plan.prices.INR.monthly, 'INR')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {formatMoney(plan.prices.USD.yearly, 'USD')} / {formatMoney(plan.prices.INR.yearly, 'INR')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(plan)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-muted-foreground">v{plan.version}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end space-x-2">
                              {hasPermission(PERMISSIONS.PLANS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePlanActive(plan.id, plan.active)}
                                >
                                  {plan.active ? (
                                    <ToggleRight className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </Button>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePlanVisibility(plan.id, plan.public)}
                              >
                                {plan.public ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              {hasPermission(PERMISSIONS.PLANS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPlan(plan)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              
                              {hasPermission(PERMISSIONS.PLANS.WRITE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePlan(plan.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
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
        </CardContent>
      </Card>

      {/* Plan Form Modal */}
      <ModalWrapper
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Edit Plan' : 'Create New Plan'}
        size="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Plan Code*</Label>
              <Input
                id="code"
                placeholder="basic-monthly"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="billingFrequency">Billing Frequency</Label>
              <Select 
                value={formData.billingFrequency} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, billingFrequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="marketingName">Marketing Name*</Label>
            <Input
              id="marketingName"
              placeholder="Basic Plan"
              value={formData.marketingName}
              onChange={(e) => setFormData(prev => ({ ...prev, marketingName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="marketingDescription">Description</Label>
            <Input
              id="marketingDescription"
              placeholder="Perfect for getting started"
              value={formData.marketingDescription}
              onChange={(e) => setFormData(prev => ({ ...prev, marketingDescription: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="priceMonthlyUsd">Monthly (USD $)</Label>
                <Input
                  id="priceMonthlyUsd"
                  type="number"
                  step="0.01"
                  value={formData.priceMonthlyUsd}
                  onChange={(e) => setFormData(prev => ({ ...prev, priceMonthlyUsd: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceYearlyUsd">Yearly (USD $)</Label>
                <Input
                  id="priceYearlyUsd"
                  type="number"
                  step="0.01"
                  value={formData.priceYearlyUsd}
                  onChange={(e) => setFormData(prev => ({ ...prev, priceYearlyUsd: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="priceMonthlyInr">Monthly (INR ₹)</Label>
                <Input
                  id="priceMonthlyInr"
                  type="number"
                  step="0.01"
                  value={formData.priceMonthlyInr}
                  onChange={(e) => setFormData(prev => ({ ...prev, priceMonthlyInr: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceYearlyInr">Yearly (INR ₹)</Label>
                <Input
                  id="priceYearlyInr"
                  type="number"
                  step="0.01"
                  value={formData.priceYearlyInr}
                  onChange={(e) => setFormData(prev => ({ ...prev, priceYearlyInr: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="public"
              checked={formData.public}
              onChange={(e) => setFormData(prev => ({ ...prev, public: e.target.checked }))}
            />
            <Label htmlFor="public">Make plan public</Label>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (isEditing ? 'Update Plan' : 'Create Plan')}
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
        title="Deactivate Plan"
        description="Are you sure you want to deactivate this plan? This will prevent new subscriptions but won't affect existing subscribers."
        confirmText="Deactivate"
        confirmVariant="destructive"
      />

      
    </div>
  );
}