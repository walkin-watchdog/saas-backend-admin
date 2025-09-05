// UI and utility types
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export interface MobileMenuContextType {
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseGoogleMapsReturn {
  isLoaded: boolean;
  loadError: string | null;
}

export interface CouponData {
  id?: string;
  code: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  minAmount?: number | null;
  maxDiscount?: number | null;
  currency: string;
  usageLimit?: number | null;
  usedCount: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  products?: string[];
  createdAt?: string;
}

export interface CancellationTerm {
  timeframe: string;
  refundPercent: number;
  description: string;
}

export interface CustomRequirementField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'file';
  required: boolean;
  options?: string[];
  placeholder?: string;
}
