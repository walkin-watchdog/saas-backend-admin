import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  Loader2,
  CreditCard,
  Clock,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ArrowRight
} from 'lucide-react';
import { plansApi } from '@/api/billing/plans';
import { subscriptionApi } from '@/api/billing/subscription';
import { invoicesApi } from '@/api/billing/invoices';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/formatMoney';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { PublicPlan } from '@/types/billing';
import { useSubscription } from '@/hooks/useSubscription';
import { isBillingError } from '@/utils/billing';

export const PlansAndSubscriptions = () => {
  const { user, token } = useAuth();
  const { subscription, refreshSubscription } = useSubscription();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
  const [provider, setProvider] = useState<'razorpay' | 'paypal'>('paypal');

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const plansData = await plansApi.getPublicPlans();
      const subData = await refreshSubscription();
      setPlans(plansData);
      if (subData) {
        setCurrency(subData.currency as 'USD' | 'INR');
        if (subData.currency === 'INR') setProvider('razorpay');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      if (!isBillingError(error)) {
        toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [refreshSubscription]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (currency === 'INR') {
      setProvider('razorpay');
    }
  }, [currency]);

  const handleCreateSubscription = async (plan: PublicPlan) => {
    if (!token || user?.role !== 'ADMIN') {
      toast({ title: 'Error', description: 'Admin access required', variant: 'destructive' });
      return;
    }

    try {
      await subscriptionApi.create(
        { planId: plan.id, currency, provider },
        `subscription-${Date.now()}`
      );
      
      toast({
        title: 'Success',
        description: `Subscription created successfully`,
      });

      const sub = await refreshSubscription(); // Refresh to show new subscription
      if (sub) {
        setCurrency(sub.currency as 'USD' | 'INR');
        if (sub.currency === 'INR') setProvider('razorpay');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to create subscription',
          variant: 'destructive',
        });
      }
    } finally {
      setIsCreating(false);
      setSelectedPlan(null);
    }
  };

  const handleChangePlan = async (plan: PublicPlan) => {
    if (!subscription || !token || user?.role !== 'ADMIN') return;

    try {
      setIsChangingPlan(true);
      const result = await subscriptionApi.changePlan(
        { planId: plan.id },
        `plan-change-${Date.now()}`
      );

      toast({
        title: 'Success',
        description: 'Plan changed successfully',
      });

      // Open invoice if provided
      if (result.secureUrl) {
        window.open(result.secureUrl, '_blank');
        } else if (result.invoiceId) {
        try {
          const pdf = await invoicesApi.createPdfToken(result.invoiceId);
          window.open(pdf.secureUrl, '_blank');
        } catch (err) {
          console.error('Error opening invoice:', err);
        }
      }

      const sub = await refreshSubscription();
      if (sub) {
        setCurrency(sub.currency as 'USD' | 'INR');
        if (sub.currency === 'INR') setProvider('razorpay');
      }
    } catch (error) {
      console.error('Error changing plan:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to change plan',
          variant: 'destructive',
        });
      }
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription || !token || user?.role !== 'ADMIN') return;

    const reason = prompt('Please provide a reason for cancellation (optional):');
    
    try {
      setIsCancelling(true);
      await subscriptionApi.cancel(
        { reason: reason || undefined },
        `cancel-${Date.now()}`
      );

      toast({
        title: 'Success',
        description: 'Subscription cancelled successfully',
      });

      const sub = await refreshSubscription();
      if (sub) {
        setCurrency(sub.currency as 'USD' | 'INR');
        if (sub.currency === 'INR') setProvider('razorpay');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to cancel subscription',
          variant: 'destructive',
        });
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleResumeSubscription = async () => {
    if (!subscription || !token || user?.role !== 'ADMIN') return;

    try {
      setIsResuming(true);
      await subscriptionApi.resume(`resume-${Date.now()}`);

      toast({
        title: 'Success',
        description: 'Subscription resumed successfully',
      });

      const sub = await refreshSubscription();
      if (sub) {
        setCurrency(sub.currency as 'USD' | 'INR');
        if (sub.currency === 'INR') setProvider('razorpay');
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to resume subscription',
          variant: 'destructive',
        });
      }
    } finally {
      setIsResuming(false);
    }
  };

  const getSubscriptionStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>;
      case 'past_due':
        return <Badge variant="destructive">Past Due</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      case 'suspended':
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTrialDaysRemaining = () => {
    if (!subscription?.trialEndsAt) return null;
    const now = new Date();
    const trialEnd = new Date(subscription.trialEndsAt);
    const diffTime = trialEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plans & Subscriptions</h1>
          <p className="text-gray-600 mt-2">Manage your subscription and billing</p>
        </div>
        <div className="flex gap-4">
          <div className="w-32">
            <Label>Currency</Label>
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as 'USD' | 'INR')}
              disabled={!!subscription}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as 'razorpay' | 'paypal')}
              disabled={currency === 'INR' || !!subscription}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="razorpay">Razorpay</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Current Subscription */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Current Subscription</span>
              {getSubscriptionStatusBadge(subscription.status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Plan</div>
                <div className="font-medium">{subscription.plan?.marketingName || 'Unknown Plan'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Currency</div>
                <div className="font-medium">{subscription.currency}</div>
              </div>
              {subscription.currentPeriodEnd && (
                <div>
                  <div className="text-sm text-muted-foreground">Current Period End</div>
                  <div className="font-medium">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </div>
                </div>
              )}
              {subscription.status === 'trialing' && subscription.trialEndsAt && (
                <div>
                  <div className="text-sm text-muted-foreground">Trial Ends</div>
                  <div className="font-medium flex items-center">
                    <Clock className="h-4 w-4 mr-1 text-blue-500" />
                    {getTrialDaysRemaining()} days remaining
                  </div>
                </div>
              )}
            </div>

            {/* Trial Alert */}
            {subscription.status === 'trialing' && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Your trial expires in {getTrialDaysRemaining()} days. 
                  Add a payment method to continue using the service after your trial ends.
                  <Link to="/billing/payment-methods" className="ml-2 underline text-[var(--brand-primary)]">
                    Add Payment Method
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {/* Past Due Alert */}
            {subscription.status === 'past_due' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Your subscription is past due. Please update your payment method or contact support.
                  <Link to="/billing/payment-methods" className="ml-2 underline">
                    Update Payment Method
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            {user?.role === 'ADMIN' && (
              <div className="flex flex-wrap gap-3">
                {subscription.status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={handleCancelSubscription}
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      'Cancel Subscription'
                    )}
                  </Button>
                )}

                {(subscription.status === 'cancelled' || subscription.status === 'suspended') && (
                  <Button
                    onClick={handleResumeSubscription}
                    disabled={isResuming}
                  >
                    {isResuming ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Resuming...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Resume Subscription
                      </>
                    )}
                  </Button>
                )}

                <Link to="/billing/invoices">
                  <Button variant="outline">
                    <Calendar className="h-4 w-4 mr-2" />
                    View Invoices
                  </Button>
                </Link>

                <Link to="/billing/payment-methods">
                  <Button variant="outline">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle>
            {subscription ? 'Change Plan' : 'Available Plans'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {subscription 
              ? 'Upgrade or downgrade your current subscription'
              : 'Choose a plan to get started'
            }
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = subscription?.planId === plan.id;
              
              return (
                <div key={plan.id} className={`border rounded-lg p-6 ${
                  isCurrent ? 'border-[var(--brand-primary)] bg-blue-50' : 'border-gray-200'
                } hover:shadow-md transition-shadow`}>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{plan.marketingName}</h3>
                      <p className="text-sm text-muted-foreground">{plan.marketingDescription}</p>
                    </div>

                    {/* Pricing */}
                    <div className="space-y-2">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-bold text-[var(--brand-primary)]">
                          {formatMoney(plan.prices.USD.monthly, 'USD')}
                        </span>
                        <span className="text-sm text-muted-foreground">/month</span>
                      </div>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-xl font-semibold text-[var(--brand-secondary)]">
                          {formatMoney(plan.prices.INR.monthly, 'INR')}
                        </span>
                        <span className="text-sm text-muted-foreground">/month</span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-1">
                      {plan.featureHighlights.slice(0, 4).map((feature, index) => (
                        <li key={index} className="flex items-start text-sm">
                          <CheckCircle className="h-3 w-3 text-green-500 mr-2 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Action Button */}
                    <div className="pt-2">
                      {isCurrent ? (
                        <div className="text-center">
                          <Badge className="bg-[var(--brand-primary)] text-white">Current Plan</Badge>
                        </div>
                      ) : user?.role === 'ADMIN' ? (
                        <Button
                          onClick={() => subscription 
                            ? handleChangePlan(plan) 
                            : handleCreateSubscription(plan)
                          }
                          disabled={isCreating || isChangingPlan}
                          className="w-full"
                          variant={subscription ? 'outline' : 'default'}
                        >
                          {(isCreating || isChangingPlan) && selectedPlan?.id === plan.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {subscription ? 'Changing...' : 'Creating...'}
                            </>
                          ) : (
                            <>
                              {subscription ? 'Switch to This Plan' : 'Subscribe'}
                              <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                          )}
                        </Button>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground">
                          Admin access required
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* No Plans Available */}
      {plans.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No plans available</h3>
          <p className="text-gray-600">
            No subscription plans are currently available.
          </p>
        </div>
      )}
    </div>
  );
};