export const calculateEffectivePrice = (basePrice: number, discountType?: string, discountValue?: number) => {
    if (!discountType || discountType === 'none' || !discountValue) {
        return basePrice;
    }

    if (discountType === 'percentage') {
        return basePrice * (1 - (discountValue / 100));
    } else if (discountType === 'fixed') {
        return Math.max(0, basePrice - discountValue);
    }

    return basePrice;
};
