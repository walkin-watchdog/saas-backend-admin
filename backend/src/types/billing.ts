export interface AttachPaymentMethodBody {
  token: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  name?: string;
}

export interface PaymentMethodDTO {
  id: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  name?: string;
  default: boolean;
}

export interface PriceSnapshot {
  currency: 'USD' | 'INR';
  monthly: number;
  yearly: number;
}

export interface TaxSnapshot {
  percent: number;
  amount: number;
}
