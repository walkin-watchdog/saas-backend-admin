// Availability related types
export interface AvailabilitySubrange {
  id: string;
  productId: string;
  startDate: string;
  endDate: string;
  status: 'SOLD_OUT' | 'NOT_OPERATING';
  isNew?: boolean;
}


export interface BlockedDate {
  id: string;
  productId: string;
  date: string;
  reason?: string;
  isActive: boolean;
  createdAt: string;
  product: any; // Import Product type when needed
}

export interface BlockDate {
  id?: string;
  date: string;
  reason?: string;
}
