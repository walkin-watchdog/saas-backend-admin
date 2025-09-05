export const isBillingError = (error: unknown): boolean => {
  const code =
    typeof error === 'string'
      ? error
      : (error as any)?.code || (error as any)?.message;
  return typeof code === 'string' && code.startsWith('SUBSCRIPTION_');
};