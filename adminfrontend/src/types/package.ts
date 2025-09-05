// Package related types
export interface PackageOption {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  currency: string;
  discountType?: 'none' | 'percentage' | 'fixed';
  discountValue?: number;
  effectivePrice?: number;
  inclusions: string[];
  maxPeople?: number;
  timeSlots?: string[];
  isPerGroup: any;
}

export interface Package {
  id?: string;
  name: string;
  description: string;
  basePrice: number;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  currency: string;
  inclusions: string[];
  maxPeople: number;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  slotConfigs?: SlotConfig[];
  pricingType: string;
  ageGroups: any;
}

export interface SlotConfig {
  times: string[];
  days: string[];
  adultTiers: PricingTier[];
  childTiers: PricingTier[];
}

export interface PricingTier {
  min: number;
  max: number;
  price: number;
}

export interface SlotPickerState {
  start: string;
  end: string;
  duration: number;
  durationUnit: string;
  availableTimes: string[];
  selectedTime: string;
}

export interface SlotFormData {
  times: string[];
  days: string[];
  adultTiers: PricingTier[];
  childTiers: PricingTier[];
}
