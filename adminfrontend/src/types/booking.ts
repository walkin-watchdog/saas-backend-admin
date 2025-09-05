// Booking related types

export interface CustomDetails {
  packageName: string;
  location: string;
  duration: string;
  durationUnit: 'hours' | 'days';
  code: string;
  selectedTimeSlot: string;
  pricePerPerson: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
}

export interface BookingProp {
  id: string;
  isManual: boolean;
  createdBy?: { id: string; name: string; email: string; };
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  adults: number;
  children: number;
  totalAmount: number;
  currency: string;
  discountAmount?: number;
  couponCode?: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIAL';
  bookingDate: string;
  createdAt: string;
  partialPaymentAmount: number;
  product?: {
    id: string;
    title: string;
    productCode: string;
  };
  package?: {
    id: string;
    name: string;
  };
  customDetails?: CustomDetails;
}

export interface AbandonedCartProp {
  id: string;
  email: string;
  productId: string;
  packageId?: string;
  currency: string;
  customerData: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    adults: number;
    children: number;
    selectedDate: string;
    totalAmount: number;
  };
  remindersSent: number;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    title: string;
    images: string[];
    price: number;
    discountPrice?: number;
  };
}

export interface TripRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  destination: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  budget: string;
  interests: string[];
  accommodation: string;
  transport: string;
  specialRequests?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}
