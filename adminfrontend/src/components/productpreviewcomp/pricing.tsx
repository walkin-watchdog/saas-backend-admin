import { Link } from "react-router-dom";
import { calculateEffectivePrice } from "./globalfunc";
import type { Product } from "../../types/index";
import { PriceDisplay } from "../common/PriceDisplay";

interface PricingProps {
    selectedPackage: any;
    selectedSlot: any;
    adultsCount: number;
    childrenCount: number;
    pkg: any;
    product: Product | null;
}

export const Pricing = ({
    selectedPackage,
    selectedSlot,
    adultsCount,
    childrenCount,
    pkg,
    product
}:PricingProps) =>
{
     const currentProduct = product;
    
    if (!currentProduct) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
                    <Link to="/destinations" className="text-[var(--brand-primary)] hover:underline">
                        Back to Destinations
                    </Link>
                </div>
            </div>
        );
    }
    return ( 
        <div>

{selectedPackage?.id === pkg.id && selectedSlot && (
  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-gray-700">Adults:</span>
      <div className="text-sm font-medium">
        {adultsCount} ×
        {selectedSlot?.adultTiers && selectedSlot.adultTiers.length > 0 ? (
            <span>
            {pkg.discountType !== 'none' && pkg.discountValue > 0 && (
                <span className="line-through text-gray-400 mr-2">
                <PriceDisplay amount={selectedSlot.adultTiers[0].price} currency={pkg.currency} />
              </span>
            )}
            <span className={pkg.discountType !== 'none' && pkg.discountValue > 0 ? "text-[var(--brand-primary)] font-bold" : ""}>
              <PriceDisplay
                amount={calculateEffectivePrice(
                    selectedSlot.adultTiers[0].price,
                    pkg.discountType,
                    pkg.discountValue
                )}
                currency={pkg.currency}
                />
            </span>
          </span>
        ) : (
            <PriceDisplay
            amount={calculateEffectivePrice(
                pkg.basePrice,
                pkg.discountType,
                pkg.discountValue
            )}
            currency={pkg.currency}
            />
        )}
      </div>
    </div>
    {pkg.ageGroups?.child?.enabled !== false ? (
        childrenCount > 0 && (
            <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-700">Children:</span>
          <div className="text-sm font-medium">
            {childrenCount} ×
            {selectedSlot?.childTiers && selectedSlot.childTiers.length > 0 ? (
                <span>
                {pkg.discountType !== 'none' && pkg.discountValue > 0 && (
                    <span className="line-through text-gray-400 mr-2">
                    <PriceDisplay amount={selectedSlot.childTiers[0].price} currency={pkg.currency} />
                  </span>
                )}
                <span className={pkg.discountType !== 'none' && pkg.discountValue > 0 ? "text-[var(--brand-primary)] font-bold" : ""}>
                  <PriceDisplay
                    amount={calculateEffectivePrice(
                        selectedSlot.childTiers[0].price,
                        pkg.discountType,
                        pkg.discountValue
                    )}
                    currency={pkg.currency}
                    />
                </span>
              </span>
            ) : (
                <PriceDisplay
                amount={calculateEffectivePrice(
                    pkg.basePrice,
                    pkg.discountType,
                    pkg.discountValue
                ) * 0.5}
                currency={pkg.currency}
                />
            )}
          </div>
        </div>
      )
    ) : (
        <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">Children:</span>
        <span className="text-sm font-medium text-gray-400">
          0
        </span>
      </div>
    )}
    <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
      <span className="text-base font-medium">Total:</span>
      <span className="text-base font-bold text-[var(--brand-primary)]">
        <PriceDisplay
          amount={adultsCount * (selectedSlot?.adultTiers?.[0]?.price
            ? calculateEffectivePrice(
                selectedSlot.adultTiers[0].price,
                pkg.discountType,
                pkg.discountValue
            )
            : calculateEffectivePrice(
                pkg.basePrice,
                pkg.discountType,
                pkg.discountValue
            )) +
            (pkg.ageGroups?.child?.enabled !== false
                ? childrenCount * (selectedSlot?.childTiers?.[0]?.price
                    ? calculateEffectivePrice(
                        selectedSlot.childTiers[0].price,
                        pkg.discountType,
                        pkg.discountValue
                    )
                    : (calculateEffectivePrice(
                        pkg.basePrice,
                        pkg.discountType,
                        pkg.discountValue
                    ) * 0.5))
                    : 0
                )}
                currency={pkg.currency}
                />
      </span>
    </div>
     <div className="text-xs text-gray-500 mt-1 text-right">
      Price includes local taxes and booking fees
    </div>
    {pkg.isPerGroup && (
        <div className="mt-3 text-sm text-gray-500 text-center">
        This is a group package (up to {pkg.maxPeople || currentProduct.capacity} people)
      </div>
    )}
  </div>
)}
          </div>
      )
    }
