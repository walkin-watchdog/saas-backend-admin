import { useCurrencyConverter } from "../../utils/useCurrencyConverter";


interface PriceDisplayProps {
  amount: number;
  currency?: string;
  originalAmount?: number;
  className?: string;
  showDisclaimer?: boolean;
}

export const PriceDisplay = ({
  amount,
  currency = 'INR',
  originalAmount,
  className = '',
  showDisclaimer = false
}: PriceDisplayProps) => {
  const { 
    convertedAmount, 
    isLoading, 
    currencySymbol,
  } = useCurrencyConverter(amount, currency);
  
  const {
    convertedAmount: convertedOriginal
  } = useCurrencyConverter(originalAmount || 0, currency);
  
  if (isLoading) {
    return <span className={className}>Loading...</span>;
  }
  
  return (
    <div className={className}>
      <div className="flex items-center">
        <span className="font-bold">
          {currencySymbol}{convertedAmount?.toLocaleString()}
        </span>
        
        {originalAmount && originalAmount > amount && (
          <span className="text-gray-500 line-through ml-2">
            {currencySymbol}{convertedOriginal?.toLocaleString()}
          </span>
        )}
      </div>
      
      {showDisclaimer && currency !== localStorage.getItem('preferredCurrency') && (
        <div className="text-xs text-gray-500 mt-1">
          *Approximate price. Actual price in {currency} may vary.
        </div>
      )}
    </div>
  );
};