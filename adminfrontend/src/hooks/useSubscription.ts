import { useAuth } from '@/contexts/AuthContext';

export const useSubscription = () => {
  const { subscription, refreshSubscription } = useAuth();

  const isActive =
    subscription?.status === 'active' ||
    subscription?.status === 'trialing';

  const hasFeature = (feature: string): boolean =>
    Boolean(subscription?.plan?.featureHighlights?.includes(feature));

  return { subscription, isActive, hasFeature, refreshSubscription };
};