import { getCurrencySymbol } from './currencyUtils';

export function formatMoney(amountInt: number, currency: string): string {
  const amount = (amountInt || 0) / 100;
  return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
}
