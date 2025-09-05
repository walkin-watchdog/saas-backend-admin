import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, CreditCard, Users } from 'lucide-react';
import { plansApi } from '@/api/billing/plans';
import { subscriptionApi } from '@/api/billing/subscription';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/formatMoney';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import type { PublicPlan, CreateSubscriptionRequest } from '@/types/billing';
import { isBillingError } from '@/utils/billing';

export const Plans = () => {
  const { user, token } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
  const [provider, setProvider] = useState<'razorpay' | 'paypal'>('paypal');
  const navigate = useNavigate();

  useEffect(() => {
    if (currency === 'INR') {
      setProvider('razorpay');
    }
  }, [currency]);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      const data = await plansApi.getPublicPlans();
      setPlans(data);
    } catch (error) {
      console.error('Error fetching plans:', error);
      if (!isBillingError(error)) {
        toast({ title: 'Error', description: 'Failed to load plans', variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSubscription = async (plan: PublicPlan) => {
    if (!token || user?.role !== 'ADMIN') {
      toast({ title: 'Error', description: 'Admin access required to create subscriptions', variant: 'destructive' });
      return;
    }

    try {
      setIsCreating(true);
      setSelectedPlan(plan);

      const request: CreateSubscriptionRequest = {
        planId: plan.id,
        currency,
        provider,
      };

      const result = await subscriptionApi.create(request, `subscription-${Date.now()}`);
      
      toast({
        title: 'Success',
        description: `Subscription created successfully (${result.status})`,
      });

      // Navigate to subscription overview
      navigate('/billing/plans-and-subscriptions');
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
          <h1 className="text-3xl font-bold text-gray-900">Available Plans</h1>
          <p className="text-gray-600 mt-2">Choose a plan that fits your needs</p>
        </div>
        <div className="flex gap-4">
          <div className="w-32">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as 'USD' | 'INR')}>
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
              disabled={currency === 'INR'}
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

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{plan.marketingName}</span>
                <Badge variant="outline">{plan.billingFrequency}</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{plan.marketingDescription}</p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Pricing */}
              <div className="space-y-2">
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-[var(--brand-primary)]">
                    {formatMoney(plan.prices.USD.monthly, 'USD')}
                  </span>
                  <span className="text-sm text-muted-foreground">USD/month</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-semibold text-[var(--brand-secondary)]">
                    {formatMoney(plan.prices.INR.monthly, 'INR')}
                  </span>
                  <span className="text-sm text-muted-foreground">INR/month</span>
                </div>
                
                {plan.billingFrequency === 'both' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Yearly (USD):</span>
                        <span className="font-medium">{formatMoney(plan.prices.USD.yearly, 'USD')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Yearly (INR):</span>
                        <span className="font-medium">{formatMoney(plan.prices.INR.yearly, 'INR')}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Features */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Features</h4>
                <ul className="space-y-2">
                  {plan.featureHighlights.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t">
                {user?.role === 'ADMIN' ? (
                  <Button
                    onClick={() => handleCreateSubscription(plan)}
                    disabled={isCreating && selectedPlan?.id === plan.id}
                    className="w-full"
                  >
                    {isCreating && selectedPlan?.id === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Subscribe to Plan
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="text-center">
                    <div className="flex items-center justify-center text-sm text-muted-foreground">
                      <Users className="h-4 w-4 mr-1" />
                      Admin access required
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {plans.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No plans available</h3>
          <p className="text-gray-600">
            No subscription plans are currently available. Please check back later.
          </p>
        </div>
      )}
    </div>
  );
};