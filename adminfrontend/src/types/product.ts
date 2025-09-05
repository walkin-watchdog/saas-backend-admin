// Product related types
import type { ItineraryDay } from './itinerary';
import type { PackageOption } from './package';
import type { LocationDetail, MeetingDetail, EndPoint } from './location';
import type { AvailabilitySubrange } from './availability';

interface BlockDate {
  id?: string;
  date: string;
  reason?: string;
}

export interface Product {
  id: string;
  title: string;
  productCode: string;
  slug: string;
  description: string;
  type: 'TOUR' | 'EXPERIENCE';
  category: string;
  location: string;
  duration: string;
  capacity: number;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  images: string[];
  tags: string[];
  languages?: string[];
  difficulty?: string;
  cancellationPolicy?: string;
  availabilityStatus: 'AVAILABLE' | 'SOLD_OUT' | 'NOT_OPERATING';
  permanentAvailabilityStatus?: 'SOLD_OUT' | 'NOT_OPERATING';
  availabilityStartDate: string;
  availabilityEndDate: string;
  availabilitySubranges: AvailabilitySubrange[];
  nextAvailableDate?: string;
  availableDates?: string[];
  
  // Relations
  itineraries?: ItineraryDay[];
  packages?: PackageOption[];
  reviews?: Review[];
  availabilities?: any[];
  
  // Location & Meeting
  meetingPoints: MeetingDetail[];
  pickupLocationDetails: LocationDetail[];
  endPoints: EndPoint[];
  
  // Pickup Options
  pickupOption: boolean;
  allowTravelersPickupPoint: boolean;
  pickupStartTime: string;
  meetingPoint: boolean;
  doesTourEndAtMeetingPoint: boolean;
  pickupLocations: string[];
  // Accessibility
  wheelchairAccessible: string;
  strollerAccessible: string;
  serviceAnimalsAllowed: string;
  publicTransportAccess: string;
  infantSeatsRequired: string;
  infantSeatsAvailable: string;
  accessibilityFeatures?: string[];
  
  // Requirements
  requirePhone: boolean;
  requireId: boolean;
  requireAge: boolean;
  requireMedical: boolean;
  requireDietary: boolean;
  requireEmergencyContact: boolean;
  requirePassportDetails: boolean;
  customRequirementFields: boolean;
  additionalRequirements: string;
  passportDetailsOption: any;

  // Payment options
  paymentType?: 'FULL' | 'PARTIAL' | 'DEPOSIT';
  minimumPaymentPercent?: number;
  depositAmount?: number;
  
  // Policies
  minPeople: boolean;
  phonenumber: number;
  tourType: string;
  cancellationPolicyType: boolean;
  cancellationTerms: boolean;
  healthRestrictions: boolean;
  guides: boolean;
  
  // Methods (these should probably be moved to utils)
 
}

export interface Productprop {
  id: string;
  title: string;
  productCode: string;
  type: 'TOUR' | 'EXPERIENCE';
  category: string;
  location: string;
  duration: string;
  capacity: number;
  images: string[];
  isActive: boolean;
  isDraft: boolean;
  createdAt: string;
  difficulty: any;
  wheelchairAccessible: string;
  strollerAccessible: string;
  serviceAnimalsAllowed: string;
  accessibilityFeatures: boolean;
  discountPrice: any;
  _count?: {
    bookings: number;
  };
}


export interface ProductFormData {
  // Basic Details
  title: string;
  productCode: string;
  description: string;
  type: 'TOUR' | 'EXPERIENCE';
  destinationId: string;
  experienceCategoryId: string;
  category: string;
  location: string;
  duration: string;
  capacity: number;
  
  // Content
  images: string[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  itineraries?: ItineraryDay[];
  tags: string[];
  
  // Location & Meeting
  meetingPoint?: string;
  pickupLocations: string[];
  
  // Tour Details
  difficulty?: string;
  healthRestrictions?: string;
  guides: string[];
  languages: string[];
  
  // Policies
  cancellationPolicy: string;
  isActive: boolean;
  isDraft: boolean;
  
  // Availability
  availabilityStartDate: string;
  availabilityEndDate?: string;
  permanentAvailabilityStatus?: 'SOLD_OUT' | 'NOT_OPERATING' | null;
  availabilitySubranges: AvailabilitySubrange[];
  blockedDates?: BlockDate[];
  packages?: PackageOption[];
  
  // Accessibility
  accessibilityFeatures?: string[];
  wheelchairAccessible: string;
  strollerAccessible: string;
  serviceAnimalsAllowed: string;
  publicTransportAccess: string;
  infantSeatsRequired: string;
  infantSeatsAvailable: string;
  accessibilityNotes: string;

  // Pickup Options
  pickupOption: string;
  allowTravelersPickupPoint: boolean;
  pickupStartTime?: string;
  additionalPickupDetails?: string;
  pickupLocationDetails: LocationDetail[];
  pickupStartTimeValue?: number;
  pickupStartTimeUnit?: 'minutes' | 'hours';
  meetingPoints: MeetingDetail[];

  // Cancellation Policy
  cancellationPolicyType: string;
  freeCancellationHours: number;
  partialRefundPercent: number;
  noRefundAfterHours: number;
  cancellationTerms: string[];

  // Payment options
  paymentType?: 'FULL' | 'PARTIAL' | 'DEPOSIT';
  minimumPaymentPercent?: number;
  depositAmount?: number;
  currency: string;
  
  // Requirements
  requirePhone: boolean;
  requireId: boolean;
  requireAge: boolean;
  requireMedical: boolean;
  requireDietary: boolean;
  requireEmergencyContact: boolean;
  requirePassportDetails: boolean;
  additionalRequirements: string;
  customRequirementFields: string[];
  phonenumber: string;
  tourType: string;
  passportDetailsOption?: string;
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
}

export interface newItem {
  highlight: string;
  inclusion: string;
  inclusionText?: string;
  exclusion: string;
  exclusionText?: string;
  tag: string;
  pickupLocation: string;
  guide: string;
  language: string;
  accessibilityFeature?: string;
}
