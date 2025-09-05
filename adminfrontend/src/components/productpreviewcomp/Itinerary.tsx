import React, { useState, useEffect, useRef } from 'react';
import { Clock, ChevronDown, ChevronUp, MapPin, Navigation } from 'lucide-react';
import type { Product } from "../../types/index";

// Google Maps types
declare global {
  interface Window {
    google: any;
  }
}

interface Activity {
  images: string[];
  id?: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string;
  isStop: boolean;
  description?: string;
  stopDuration?: number;
  duration?: number;
  durationUnit?: string;
  isAdmissionIncluded: boolean;
  inclusions: string[];
  exclusions: string[];
  order: number;
  lat?: number;
  lng?: number;
  placeId?: string;
}

interface ItineraryDay {
  id?: string;
  day: number;
  title: string;
  description: string;
  images: string[];
  activities: Activity[];
}

interface ExpandedActivities {
  [key: string]: boolean;
}

export const Itinerary = ({
  itineraryRef,
  detailsRef,
  onNavigateToDeparture,
  product
}: {
  itineraryRef: React.RefObject<HTMLDivElement | null>;
  detailsRef?: React.RefObject<HTMLDivElement | null>;
  onNavigateToDeparture?: () => void;
  product: Product | null;
}) => {
  const currentProduct = product;
  const [selectedDay, setSelectedDay] = useState<number | 'overview'>(1);
  const [expandedActivities, setExpandedActivities] = useState<ExpandedActivities>({});
  const [expandedActivityDesc, setExpandedActivityDesc] = useState<Record<string, boolean>>({});
  const DESC_LIMIT = 200;
  const [showPickupInfo, setShowPickupInfo] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const overviewMapRef = useRef<HTMLDivElement>(null);

  // Initialize Google Maps when component mounts
  useEffect(() => {
    if (currentProduct?.itineraries && currentProduct.itineraries.length > 0) {
      setSelectedDay(1);
      loadGoogleMapsIfNeeded();
    }
  }, [currentProduct]);

  console.log('current product', currentProduct)

  // Load Google Maps script if needed
  const loadGoogleMapsIfNeeded = () => {
    if (window.google && window.google.maps) {
      initializeMap();
      initializeOverviewMap();
      return;
    }

    // Check if script is already loading
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      return;
    }
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly&loading=async`;
    
    script.onload = () => {
      initializeMap();
      initializeOverviewMap();
    };
    document.head.appendChild(script);
  };

  // Initialize overview map with all locations from all days
  const initializeOverviewMap = () => {
    if (!overviewMapRef.current || !currentProduct?.itineraries || selectedDay !== 'overview') return;

    const allActivities: (Activity & { dayNumber: number })[] = [];

    // Collect all activities from all days
    currentProduct.itineraries.forEach((day: any) => {
      if (day.activities && day.activities.length > 0) {
        day.activities.forEach((activity: Activity) => {
          if ((activity.locationLat && activity.locationLng) || (activity.lat && activity.lng)) {
            allActivities.push({
              ...activity,
              dayNumber: day.day
            });
          }
        });
      }
    });

    if (allActivities.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const center = {
      lat: allActivities[0].locationLat || allActivities[0].lat || 28.6139,
      lng: allActivities[0].locationLng || allActivities[0].lng || 77.2090
    };

    const map = new window.google.maps.Map(overviewMapRef.current, {
      zoom: 10,
      center: center,
      mapTypeId: window.google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Add markers for each activity with day-based numbering
    allActivities.forEach((activity) => {
      const position = {
        lat: activity.locationLat || activity.lat || 0,
        lng: activity.locationLng || activity.lng || 0
      };

      const marker = new window.google.maps.Marker({
        position: position,
        map: map,
        title: `${activity.location}`,
        label: {
          text: activity.dayNumber.toString(),
          color: 'white',
          fontWeight: 'bold'
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: 'var(--brand-primary)',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="max-width: 250px; padding: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1f2937;">
              ${activity.location}
            </h3>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
              <strong>Day ${activity.dayNumber}</strong>
            </p>
            ${activity.isStop ? `
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
                <strong>Stop:</strong> ${activity.stopDuration || 0} ${activity.durationUnit || 'minutes'}
              </p>
            ` : ''}
            <p style="margin: 0 0 4px 0; font-size: 12px; color: ${activity.isAdmissionIncluded ? '#10b981' : '#ef4444'};">
              <strong>Admission:</strong> ${activity.isAdmissionIncluded ? 'Included' : 'Not included'}
            </p>
            ${activity.description ? `
              <p style="margin: 0; font-size: 11px; color: #6b7280;">
                ${activity.description}
              </p>
            ` : ''}
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      bounds.extend(position);
    });

    // Fit map to show all markers
    if (allActivities.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(15);
    } else if (allActivities.length > 1) {
      map.fitBounds(bounds);
    }
  };

  // Initialize map with markers
  const initializeMap = () => {
    if (!mapRef.current || !currentProduct?.itineraries || selectedDay === 'overview') return;

    const selectedDayData = getCurrentDayData();
    if (!selectedDayData || !selectedDayData.activities.length) return;

    const activities = selectedDayData.activities.filter(act =>
      (act.locationLat && act.locationLng) || (act.lat && act.lng)
    );

    if (activities.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const center = activities.length > 0 ? {
      lat: activities[0].locationLat || activities[0].lat || 28.6139,
      lng: activities[0].locationLng || activities[0].lng || 77.2090
    } : { lat: 28.6139, lng: 77.2090 };

    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 13,
      center: center,
      mapTypeId: window.google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Add markers only for stops
    let stopCounter = 0;
    activities.forEach((activity) => {
      // Only show markers for stops
      if (!activity.isStop) return;
      
      stopCounter++;
      const position = {
        lat: activity.locationLat || activity.lat || 0,
        lng: activity.locationLng || activity.lng || 0
      };

      const marker = new window.google.maps.Marker({
        position: position,
        map: map,
        title: activity.location,
        label: {
          text: stopCounter.toString(),
          color: 'white',
          fontWeight: 'bold'
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: 'var(--brand-primary)',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="max-width: 250px; padding: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1f2937;">
              ${activity.location}
            </h3>
            ${activity.isStop ? `
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
                <strong>Stop:</strong> ${activity.stopDuration || 0} ${activity.durationUnit || 'minutes'}
              </p>
            ` : ''}
            <p style="margin: 0 0 4px 0; font-size: 12px; color: ${activity.isAdmissionIncluded ? '#10b981' : '#ef4444'};">
              <strong>Admission:</strong> ${activity.isAdmissionIncluded ? 'Included' : 'Not included'}
            </p>
            ${activity.description ? `
              <p style="margin: 0; font-size: 11px; color: #6b7280;">
                ${activity.description}
              </p>
            ` : ''}
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      bounds.extend(position);
    });

    // Fit map to show all markers
    if (activities.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(15);
    } else if (activities.length > 1) {
      map.fitBounds(bounds);
    }
  };

  // Update map when selected day changes
  useEffect(() => {
    if (window.google && window.google.maps) {
      if (selectedDay === 'overview') {
        initializeOverviewMap();
      } else {
        initializeMap();
      }
    }
  }, [selectedDay]);

  const getCurrentDayData = (): ItineraryDay | undefined => {
    if (!currentProduct?.itineraries || selectedDay === 'overview') return undefined;

    // Handle both numbered days and array index access
    const dayData = currentProduct.itineraries.find((day: any) => day.day === selectedDay);
    if (dayData) return dayData as unknown as ItineraryDay;

    // Fallback to itinerary array if structured differently
    const itineraryArray = (currentProduct as any).itinerary || currentProduct.itineraries;
    return itineraryArray?.[selectedDay - 1] as unknown as ItineraryDay;
  };

  const toggleActivity = (activityId: string) => {
    setExpandedActivities(prev => ({
      ...prev,
      [activityId]: !prev[activityId]
    }));
  };

  const formatDuration = (duration: number | undefined, unit: string = 'minutes') => {
    if (!duration) return '';
    return `${duration} ${unit}`;
  };

  const getPickupInfo = () => {
    if (!currentProduct) return null;

    const {
      pickupOption,
      pickupStartTime,
      additionalPickupDetails,
      pickupLocationDetails
    } = currentProduct as any;

    return {
      option: pickupOption || 'Details not available',
      startTime: pickupStartTime || '30 minutes',
      details: additionalPickupDetails || '',
      locations: pickupLocationDetails || []
    };
  };

  const getEndingInfo = () => {
    if (!currentProduct) return "You'll return to the starting point";

    const { doesTourEndAtMeetingPoint, endPoints } = currentProduct as any;

    if (doesTourEndAtMeetingPoint) {
      return "You'll return to the starting point";
    }

    if (endPoints && endPoints.length > 0) {
      return `Tour ends at: ${endPoints[0].address || 'designated location'}`;
    }

    return "You'll return to the starting point";
  };

  if (!currentProduct ||
    currentProduct.type !== 'TOUR' ||
    !currentProduct.itineraries ||
    currentProduct.itineraries.length === 0) {
    return null;
  }
  console.log(currentProduct.itineraries)

  const itineraryDays = currentProduct.itineraries || [];
  const currentDayData = getCurrentDayData();
  const showOverviewTab = itineraryDays.length > 1;

  return (
    <div ref={itineraryRef} className="bg-white rounded-lg shadow-sm p-6 mb-8 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Itinerary</h2>

      {/* Day Selector Tabs */}
      {itineraryDays.length > 1 && (
        <div className="mb-6">
          <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
            {/* Overview Tab - only show if more than 2 days */}
            {showOverviewTab && (
              <button
                onClick={() => setSelectedDay('overview')}
                className={`flex-shrink-0 px-4 py-3 border-1 transition-all duration-200 ${selectedDay === 'overview'
                  ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                  }`}
              >
                <div className="text-sm font-medium">Overview</div>
                <div className="text-xs opacity-90">All locations</div>
              </button>
            )}

            {/* Individual Day Tabs */}
            {itineraryDays.map((day: any) => (
              <button
                key={day.day}
                onClick={() => setSelectedDay(day.day)}
                className={`flex-shrink-0 px-4 py-3 border-1 transition-all duration-200 ${selectedDay === day.day
                  ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                  }`}
              >
                <div className="text-sm font-medium">Day {day.day}</div>
                <div className="text-xs opacity-90 truncate max-w-32">
                  {day.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overview Content */}
      {selectedDay === 'overview' && showOverviewTab && (
        <div className="w-full">
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <div
              ref={overviewMapRef}
              className="w-full h-96 bg-gray-100 flex items-center justify-center"
            >
              {!window.google ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)] mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Loading map...</p>
                </div>
              ) : (
                <div className="text-center">
                  <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Map will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Individual Day Content */}
      {selectedDay !== 'overview' && currentDayData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Timeline */}
          <div className="space-y-6">
            {/* Day Header */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {itineraryDays.length === 1
                  ? <>Trip Plan{currentDayData.title ? `: ${currentDayData.title}` : ''}</>
                  : <>Day {currentDayData.day}: {currentDayData.title}</>
                }
              </h3>
              <p className="text-gray-700 text-sm">
                {currentDayData.description}
              </p>
            </div>

            {/* Pickup Information */}
            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-green-100 border-2 border-green-600 rounded-full flex items-center justify-center mr-3">
                  <Navigation className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">You'll get picked up</h4>
                  <button
                    onClick={() => {
                      if (detailsRef?.current && onNavigateToDeparture) {
                        // Scroll to details section
                        detailsRef.current.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                        // Call the callback to open the dropdown
                        setTimeout(() => {
                          onNavigateToDeparture();
                        }, 500);
                      } else {
                        setShowPickupInfo(!showPickupInfo);
                      }
                    }}
                    className="text-sm text-[var(--brand-primary)] hover:underline"
                  >
                    {detailsRef ? 'See departure and return details' : 'See pickup and meeting information'}
                  </button>
                </div>
              </div>

              {/* Pickup Details */}
              {showPickupInfo && (
                <div className="ml-11 bg-blue-50 rounded-lg p-4 mb-4">
                  <div className="space-y-2 text-sm">
                    <p><strong>Pickup Option:</strong> {getPickupInfo()?.option}</p>
                    <p><strong>Pickup Time:</strong> {getPickupInfo()?.startTime} before departure</p>
                    {getPickupInfo()?.details && (
                      <p><strong>Details:</strong> {getPickupInfo()?.details}</p>
                    )}
                    {getPickupInfo()?.locations && getPickupInfo()?.locations.length > 0 && (
                      <div>
                        <p><strong>Pickup Locations:</strong></p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          {getPickupInfo()?.locations.map((location: any, idx: number) => (
                            <li key={idx} className="text-xs text-gray-600">
                              {location.address}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Vertical Line connecting to activities */}
              <div className="absolute left-4 top-12 w-1 border-l-4 border-dotted border-gray-900 h-full"></div>
            </div>

            {/* Activities Timeline */}
            <div className="relative">
              {/* Main vertical dotted line that runs through all activities */}
              <div className="absolute left-4 top-0 bottom-0 w-1 border-l-4 border-dotted border-gray-900 z-0"></div>
              
              <div className="space-y-0">
                {currentDayData.activities.map((activity: Activity, index: number) => {
                  const activityId = `${selectedDay}-${index}`;
                  const isExpanded = expandedActivities[activityId];
                  
                  // Calculate stop number (only count stops for numbering)
                  const stopNumber = currentDayData.activities
                    .slice(0, index + 1)
                    .filter(act => act.isStop).length;

                  return (
                    <div key={activityId} className="relative">
                      {/* Activity Marker */}
                      <div className="flex items-start">
                        {activity.isStop ? (
                          <div className="relative z-10">
                            <div className="w-8 h-8 bg-[var(--brand-primary)] rounded-full flex items-center justify-center mr-3">
                              <span className="text-white text-sm font-bold">{stopNumber}</span>
                            </div>
                          </div>
                        ) : (
                          // For pass-by activities, no visible marker
                          <div className="w-8 h-8 mr-3"></div>
                        )}

                        <div className="flex-1 pb-6">
                          {activity.isStop ? (
                            // Stop Activity - Full card with details
                            <div className="bg-white border border-gray-200 p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-900 mb-2">
                                    {activity.location}
                                  </h4>

                                  <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                                    <div className="flex items-center">
                                      <Clock className="w-4 h-4 mr-1" />
                                      <span>Stop: {formatDuration(activity.stopDuration, activity.durationUnit)}</span>
                                    </div>

                                    {activity.isAdmissionIncluded && (
                                      <div className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                        Admission included
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {(activity.description || activity.inclusions.length > 0 || activity.exclusions.length > 0 || activity.images && activity.images.length > 0) && (
                                  <button
                                    onClick={() => toggleActivity(activityId)}
                                    className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>

                              {/* Expanded Content for Stops */}
                              {isExpanded && (
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                  {activity.description && (
                                    <>
                                      <p className="text-sm text-gray-700">
                                        {expandedActivityDesc[activityId] ||
                                          activity.description.length <= DESC_LIMIT
                                          ? activity.description
                                          : activity.description.slice(0, DESC_LIMIT) + "…"}
                                      </p>
                                      {activity.description.length > DESC_LIMIT && (
                                        <button
                                          onClick={() =>
                                            setExpandedActivityDesc(prev => ({
                                              ...prev,
                                              [activityId]: !prev[activityId],
                                            }))
                                          }
                                          className="mt-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                                        >
                                          {expandedActivityDesc[activityId] ? "Read less" : "Read more"}
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {activity.inclusions.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-medium text-green-800 mb-1">Inclusions:</h5>
                                      <ul className="text-sm text-gray-600 space-y-1">
                                        {activity.inclusions.map((inclusion, idx) => (
                                          <li key={idx} className="flex items-start">
                                            <span className="text-green-500 mr-2">•</span>
                                            {inclusion}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {activity.exclusions.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-medium text-red-800 mb-1">Exclusions:</h5>
                                      <ul className="text-sm text-gray-600 space-y-1">
                                        {activity.exclusions.map((exclusion, idx) => (
                                          <li key={idx} className="flex items-start">
                                            <span className="text-red-500 mr-2">•</span>
                                            {exclusion}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Activity Images */}
                                  {activity.images && activity.images.length > 0 && (
                                    <div className="mt-3">
                                      <h5 className="text-sm font-medium text-gray-900 mb-1"> Photos</h5>
                                      <div className="grid grid-cols-2 gap-2">
                                        {activity.images.map((img: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={img}
                                            alt={`Activity photo ${idx + 1}`}
                                            className="w-full h-32 object-cover rounded-lg shadow-sm"
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            // Pass By Activity - Simple display with left border and shifted towards map
                            <div className="flex flex-col space-y-1 py-2 border-l-4 border-gray-300 pl-4 ml-4">
                              <div className="text-sm text-gray-500">
                                Pass by
                              </div>
                              <h4 className="font-semibold text-gray-900">
                                {activity.location}
                              </h4>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* End Point */}
            <div className="relative">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-400 border-2 border-gray-600 rounded-full flex items-center justify-center mr-3">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{getEndingInfo()}</h4>
                  {detailsRef && onNavigateToDeparture && (
                    <button
                      onClick={() => {
                        detailsRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                        setTimeout(() => {
                          onNavigateToDeparture();
                        }, 500);
                      }}
                      className="text-sm text-[var(--brand-primary)] hover:underline"
                    >
                      See departure and return details
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Map */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                {itineraryDays.length === 1
                  ? "Trip Route"
                  : `Route Map - Day ${currentDayData.day}`}
              </h4>

              <div className="bg-white rounded-lg overflow-hidden shadow-sm">
                <div
                  ref={mapRef}
                  className="w-full h-96 bg-gray-100 flex items-center justify-center"
                >
                  {!window.google ? (
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)] mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Loading map...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Map will appear here</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Map Legend */}
              <div className="mt-4 text-xs text-gray-600">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-[var(--brand-primary)] rounded-full mr-2"></div>
                    <span>Stops</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};