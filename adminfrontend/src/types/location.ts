// Location and geography related types
export interface LocationDetail {
  address: string;
  lat: number;
  lng: number;
  radius: number;
  placeId?: string;
}

export interface MeetingDetail {
  address: string;
  lat: number;
  lng: number;
  description?: string;
  placeId?: string;
}

export interface MeetingPoint {
  address: string;
  description?: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface EndPoint {
  address: string;
  description?: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface Destination {
  id: string;
  name: string;
  slug: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  tagline: string;
  description: string;
  image: string;
  bannerImage: string;
  highlights: string[];
    _count?: {
    products: number;
  };
}

export interface ExperienceCategory {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  image: string;
  bannerImage: string;
  highlights: string[];
  _count?: {
    products: number;
  };
}

export interface Attraction {
  id: string;
  name: string;
  location: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  slug: string;
  tagline: string;
  description: string;
  image: string;
  bannerImage: string;
  duration?: number;
  durationUnit?: string;
    _count?: {
    itineraries: number;
  };
  destinationId: string;
}