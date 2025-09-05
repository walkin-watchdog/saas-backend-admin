import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export const BillingBanner = () => {
  const { billingWarning, billingErrorCode, clearBillingWarning } = useAuth();
  const { subscription } = useSubscription();

  const requiresAttention =
    billingWarning ||
    !subscription ||
    !['active', 'trialing'].includes(subscription.status);

  if (!requiresAttention) return null;

  const message = (() => {
    switch (billingErrorCode) {
      case 'SUBSCRIPTION_REQUIRED':
        return (
          <span>
            You need an active subscription to access this feature.{' '}
            <Link to="/billing/plans-and-subscriptions" className="underline">
              View plans
            </Link>
            .
          </span>
        );
      case 'SUBSCRIPTION_PAST_DUE':
        return (
          <span>
            Your subscription payment is past due.{' '}
            <Link to="/billing/plans-and-subscriptions" className="underline">
              Update payment method
            </Link>
            .
          </span>
        );
      case 'SUBSCRIPTION_SUSPENDED':
        return (
          <span>
            Your subscription has been suspended.{' '}
            <Link to="/billing/plans-and-subscriptions" className="underline">
              Manage billing
            </Link>
            .
          </span>
        );
      default:
        return (
          <span>
            There is an issue with your subscription.{' '}
            <Link to="/billing/plans-and-subscriptions" className="underline">
              Manage billing
            </Link>
            .
          </span>
        );
    }
  })();

  return (
    <Alert variant="destructive" className="rounded-none">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex w-full items-center justify-between">
        {message}
        <Button variant="ghost" size="sm" type="button" onClick={clearBillingWarning}>
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
};