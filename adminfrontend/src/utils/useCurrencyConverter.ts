import { useState, useEffect, useCallback } from 'react';
import { getCurrencySymbol } from './currencyUtils';

interface ConversionResult {
  convertedAmount: number | null;
  isLoading: boolean;
  error: string | null;
  currencySymbol: string;
  originalCurrency: string;
}

export const useCurrencyConverter = (
  amount: number, 
  fromCurrency: string = 'INR'
): ConversionResult => {
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toCurrency, setToCurrency] = useState(
    localStorage.getItem('preferredCurrency') || 'INR'
  );
  
  const convertCurrency = useCallback(async () => {
    // If source and target currencies are the same, no conversion needed
    if (fromCurrency === toCurrency) {
      setConvertedAmount(amount);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/currency/convert?from=${fromCurrency}&to=${toCurrency}&amount=${amount}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to convert currency');
      }
      
      const data = await response.json();
      setConvertedAmount(data.convertedAmount);
    } catch (error) {
      console.error('Error converting currency:', error);
      setError('Failed to convert currency');
      
      // Fallback: just show the original amount
      setConvertedAmount(amount);
    } finally {
      setIsLoading(false);
    }
  }, [amount, fromCurrency, toCurrency]);
  
  // Listen for currency change events
  useEffect(() => {
    const handleCurrencyChange = (e: CustomEvent) => {
      setToCurrency(e.detail);
    };
    
    window.addEventListener('currencyChange', handleCurrencyChange as EventListener);
    
    return () => {
      window.removeEventListener('currencyChange', handleCurrencyChange as EventListener);
    };
  }, []);
  
  // Convert when amount, fromCurrency, or toCurrency changes
  useEffect(() => {
    if (amount > 0) {
      convertCurrency();
    }
  }, [amount, fromCurrency, toCurrency, convertCurrency]);
  
  return {
    convertedAmount,
    isLoading,
    error,
    currencySymbol: getCurrencySymbol(toCurrency),
    originalCurrency: fromCurrency
  };
};