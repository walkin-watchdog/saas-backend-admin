/**
 * Utility functions for handling currency-related operations
 */

/**
 * Analyzes all packages for a product and determines the optimal currency for the converter
 * @param packages Array of packages for a product
 * @returns The currency to set for the converter ('INR' if mixed currencies, otherwise the common currency)
 */
export const getOptimalCurrencyForProduct = (packages: any[]): string => {
  if (!packages || packages.length === 0) {
    return 'INR'; // Default fallback
  }

  // Extract all unique currencies from packages
  const currencies = new Set(packages.map(pkg => pkg.currency).filter(Boolean));
  
  // If all packages use the same currency, use that currency
  if (currencies.size === 1) {
    return Array.from(currencies)[0];
  }
  
  // If packages have different currencies, default to INR
  return 'INR';
};

/**
 * Sets the currency in localStorage and dispatches a currency change event
 * @param currency The currency to set
 */
export const setCurrencyAndNotify = (currency: string): void => {
  localStorage.setItem('preferredCurrency', currency);
  window.dispatchEvent(new CustomEvent('currencyChange', { detail: currency }));
};

/**
 * Gets all unique currencies from a product's packages
 * @param packages Array of packages for a product
 * @returns Array of unique currencies
 */
export const getPackageCurrencies = (packages: any[]): string[] => {
  if (!packages || packages.length === 0) {
    return [];
  }

  const currencies = new Set(packages.map(pkg => pkg.currency).filter(Boolean));
  return Array.from(currencies);
};

/**
 * Returns the display symbol for a currency code. Mirrors backend mapping.
 * @param currency ISO currency code
 */
export const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'AUD': 'A$',
    'CAD': 'C$',
    'JPY': '¥',
    'SGD': 'S$',
    'AED': 'AED ',
    'CNY': '¥',
  };
  return symbols[currency?.toUpperCase()] || currency + ' ';
};
