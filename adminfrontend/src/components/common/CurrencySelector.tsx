import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { getOptimalCurrencyForProduct, setCurrencyAndNotify, getCurrencySymbol } from '../../utils/currencyUtils';

interface CurrencySelectorProps {
  className?: string;
  packages?: any[]; // Pass packages if available for auto-currency setting
}

export const CurrencySelector = ({ className = '', packages }: CurrencySelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState(
    localStorage.getItem('preferredCurrency') || 'INR'
  );
  const [isLoading, setIsLoading] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Automatically set currency based on packages when product changes
  useEffect(() => {
    if (packages && packages.length > 0) {
      const optimalCurrency = getOptimalCurrencyForProduct(packages);
      const currentCurrency = localStorage.getItem('preferredCurrency') || 'INR';
      
      // Only update if the optimal currency is different from current and is valid
      if (optimalCurrency && optimalCurrency !== currentCurrency && optimalCurrency !== selectedCurrency) {
        console.log(`Auto-setting admin currency to ${optimalCurrency} based on product packages`);
        setSelectedCurrency(optimalCurrency);
        setCurrencyAndNotify(optimalCurrency);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages]);
  
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_URL}/currency/currencies`);
        
        if (response.ok) {
          const data = await response.json();
          setCurrencies(data.currencies);
        }
      } catch (error) {
        console.error('Error fetching currencies:', error);
        setCurrencies(['INR', 'USD', 'EUR', 'GBP', 'AUD']);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCurrencies();
  }, []);
  
  useEffect(() => {
    // 2) Listen once, and only close when the click is outside wrapperRef
    const handleClickOutside = (e: MouseEvent) => {
      // if dropdown is open AND click is outside the wrapper, close it
      if (
        isOpen &&
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  // Listen for currency changes from other sources
  useEffect(() => {
    const handleCurrencyChange = (e: CustomEvent) => {
      setSelectedCurrency(e.detail);
    };
    
    window.addEventListener('currencyChange', handleCurrencyChange as EventListener);
    
    return () => {
      window.removeEventListener('currencyChange', handleCurrencyChange as EventListener);
    };
  }, []);
  
  const handleCurrencyChange = (currency: string) => {
    setSelectedCurrency(currency);
    localStorage.setItem('preferredCurrency', currency);
    setIsOpen(false);
    
    // Dispatch an event so other components can react to the currency change
    window.dispatchEvent(new CustomEvent('currencyChange', { detail: currency }));
  };
  
  return (
    <div ref={wrapperRef} className={`relative inline-block text-left ${className}`}>
      <div className={`relative inline-block text-left ${className}`}>
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="flex items-center space-x-1 text-gray-700 hover:text-[var(--brand-primary)] transition-colors font-medium"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          
          <span>{getCurrencySymbol(selectedCurrency)}</span>
          <ChevronDown className="h-4 w-4" />
        </button>
        
        {isOpen && (
          <div 
            className="origin-top-right absolute right-0 mt-5 w-40 shadow-lg bg-white z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1" role="menu" aria-orientation="vertical">
              {isLoading ? (
                <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
              ) : (
                currencies.map((currency) => (
                  <button
                    key={currency}
                    onClick={() => handleCurrencyChange(currency)}
                    className={`block w-full text-left px-4 py-2 text-sm ${
                      selectedCurrency === currency 
                        ? 'text-[var(--brand-primary)] font-bold' 
                        : 'text-gray-700 hover:font-bold hover:text-[var(--brand-primary)]'
                    }`}
                    role="menuitem"
                  >
                    {getCurrencySymbol(currency)} {currency}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};