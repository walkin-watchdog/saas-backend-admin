// Itinerary related types
export interface ItineraryDay {
  id: string;
  day: number;
  title: string;
  description: string;
  activities: ItineraryActivity[];
  images: string[];
}

export interface ItineraryActivity {
  images: string[];
  location: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  isStop?: boolean;
  stopDuration?: number;
  description?: string; // Optional description for the activity
  duration?: number;
  durationUnit?: string;
  isAdmissionIncluded?: boolean;
  inclusions?: string[];
  exclusions?: string[];
  order?: number;
}

export type ProposalStatus = 'DRAFT'|'SENT'|'REVISED'|'APPROVED'|'ARCHIVED';

export interface ProposalCustomDetails {
  packageName: string;
  location: string;
  duration: string;
  durationUnit: 'hours'|'days';
  selectedTimeSlot: string;
  itinerary: { date: string; __uid?: string; time: string; activity: string; location: string; remarks?: string }[];
  pricePerPerson: number;
  childPricePerPerson?: number;
  discountType: 'percentage'|'fixed';
  discountValue: number;
}

export interface Proposal {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startDate: string;
  endDate?: string | null;
  adults: number;
  children: number;
  currency: string;
  customDetails: ProposalCustomDetails;
  status: ProposalStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string | null; email: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
}