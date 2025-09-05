import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { Plus, X, AlertCircle } from 'lucide-react';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import type { MeetingPoint, MeetingPointMapProps } from '../../types/index.ts';



const mapContainerStyle = {
    width: '100%',
    height: '400px'
};

const defaultCenter = {
    lat: 28.6139, // Delhi
    lng: 77.2090
};

export const MeetingPointMap: React.FC<MeetingPointMapProps> = ({
    meetingPoints,
    onMeetingPointsChange,
    className = ''
}) => {
    const [selectedMarker, setSelectedMarker] = useState<number | null>(null);
    const [isAddingPoint, setIsAddingPoint] = useState(false);
    const [newPoint, setNewPoint] = useState<Partial<MeetingPoint>>({});
    const [searchValue, setSearchValue] = useState('');
    const mapRef = useRef<google.maps.Map | null>(null);
    const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef   = useRef<HTMLDivElement>(null);
    const { isLoaded, loadError } = useGoogleMaps();

    useEffect(() => {
        if (!isLoaded || !isAddingPoint || autocompleteRef.current) return;
        initializeAutocomplete();
        
        return () => {
            autocompleteRef.current?.remove();
            autocompleteRef.current = null;
        };
    }, [isLoaded, isAddingPoint]);

    const initializeAutocomplete = () => {
        if (!inputRef.current || !window.google) return;

        // Clear any existing autocomplete instance
        autocompleteRef.current?.remove();
        autocompleteRef.current = null;
        
        try {
            const pac = new google.maps.places.PlaceAutocompleteElement({
            componentRestrictions: { country: ['IN'] }
          });
          pac.classList.add(...inputRef.current!.classList);
          pac.setAttribute('placeholder', 'Search for a location…');
          containerRef.current!.replaceChild(pac, inputRef.current!);
        
          autocompleteRef.current = pac;
          pac.addEventListener('gmp-select', onPlaceChanged as EventListener);
        } catch (error) {
            console.error('Error initializing autocomplete:', error);
        }
    };

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    const onPlaceChanged = async (e: any) => {
        if (autocompleteRef.current) {
            const { placePrediction } = e;
            const place = await placePrediction.toPlace();

            try {
              await place.fetchFields({
                fields: ['formattedAddress', 'location', 'id', 'displayName']
              });
            } catch (err) {
              console.error('Failed to fetch place details:', err);
              return;
            }
            if (place.location) {
                const lat = place.location.lat();
                const lng = place.location.lng();

                setNewPoint({
                    address: place.formattedAddress || place.name || '',
                    lat,
                    lng,
                    placeId: place.id,
                    description: ''
                });

                if (mapRef.current) {
                    mapRef.current.setCenter({ lat, lng });
                    mapRef.current.setZoom(15);
                }
            }
        }
    };

    const addMeetingPoint = () => {
        if (newPoint.address && newPoint.lat && newPoint.lng) {
            const pointToAdd: MeetingPoint = {
                address: newPoint.address,
                description: newPoint.description || '',
                lat: newPoint.lat,
                lng: newPoint.lng,
                placeId: newPoint.placeId
            };

            onMeetingPointsChange([...meetingPoints, pointToAdd]);
            
            // Reset form
            setNewPoint({});
            setSearchValue('');
            setIsAddingPoint(false);
            
            // Clear autocomplete instance
            autocompleteRef.current?.remove();
            autocompleteRef.current = null;
        }
    };

    const removeMeetingPoint = (index: number) => {
        const updatedPoints = meetingPoints.filter((_, i) => i !== index);
        onMeetingPointsChange(updatedPoints);
        setSelectedMarker(null);
    };

    const handleCancelAdd = () => {
        setIsAddingPoint(false);
        setNewPoint({});
        setSearchValue('');
        
        // Clear autocomplete instance
        autocompleteRef.current?.remove();
        autocompleteRef.current = null;
    };

    if (loadError) {
        return (
            <div className={`space-y-4 ${className}`}>
                <div className="flex items-center px-3 py-2 border border-red-300 rounded-md bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                    <span className="text-red-700 text-sm">{loadError}</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">Meeting Points</h4>
                <button
                    type="button"
                    onClick={() => setIsAddingPoint(!isAddingPoint)}
                    className="flex items-center space-x-2 px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    <span>Add Meeting Point</span>
                </button>
            </div>

            {/* Add Meeting Point Form */}
            {isAddingPoint && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">Add New Meeting Point</h5>

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Search Location
                        </label>
                        <div ref={containerRef}>
                            <input
                            ref={inputRef}
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder={isLoaded ? "Search for a location..." : "Loading Google Maps..."}
                            disabled={!isLoaded}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm disabled:bg-gray-100"
                            />
                        </div>

                        {newPoint.address && (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Selected Address
                                    </label>
                                    <input
                                        type="text"
                                        value={newPoint.address}
                                        onChange={(e) => setNewPoint({ ...newPoint, address: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Description (Optional)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={newPoint.description || ''}
                                        onChange={(e) => setNewPoint({ ...newPoint, description: e.target.value })}
                                        placeholder="Additional instructions for this meeting point..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-sm"
                                    />
                                </div>

                                <div className="flex justify-end space-x-2">
                                    <button
                                        type="button"
                                        onClick={handleCancelAdd}
                                        className="px-3 py-2 text-sm text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={addMeetingPoint}
                                        className="px-3 py-2 text-sm bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors"
                                    >
                                        Add Point
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Meeting Points List */}
            {meetingPoints.length > 0 && (
                <div className="space-y-2">
                    <h5 className="text-sm font-medium text-gray-700">Current Meeting Points:</h5>
                    {meetingPoints.map((point, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="font-medium text-sm text-gray-900">{point.address}</div>
                                    {point.description && (
                                        <div className="text-sm text-gray-600 mt-1">{point.description}</div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeMeetingPoint(index)}
                                    className="text-red-500 hover:text-red-700 ml-2"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Map Display */}
            {meetingPoints.length > 0 && isLoaded && (
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <GoogleMap
                        mapContainerStyle={mapContainerStyle}
                        center={meetingPoints.length > 0 ? { lat: meetingPoints[0].lat, lng: meetingPoints[0].lng } : defaultCenter}
                        zoom={meetingPoints.length === 1 ? 15 : 12}
                        onLoad={onMapLoad}
                    >
                        {meetingPoints.map((point, index) => (
                            <Marker
                                key={index}
                                position={{ lat: point.lat, lng: point.lng }}
                                onClick={() => setSelectedMarker(selectedMarker === index ? null : index)}
                                icon={{
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 12,
                                    fillColor: '#dc2626',
                                    fillOpacity: 1,
                                    strokeColor: '#ffffff',
                                    strokeWeight: 2,
                                    labelOrigin: new google.maps.Point(0, 0)
                                }}
                                label={{
                                    text: `M${index + 1}`,
                                    color: 'white',
                                    fontSize: '10px',
                                    fontWeight: 'bold'
                                }}
                            />
                        ))}
                        {selectedMarker !== null && (
                            <InfoWindow
                                position={{ lat: meetingPoints[selectedMarker].lat, lng: meetingPoints[selectedMarker].lng }}
                                onCloseClick={() => setSelectedMarker(null)}
                            >
                                <div className="p-2 max-w-xs">
                                    <div className="font-medium text-sm">{meetingPoints[selectedMarker].address}</div>
                                    {meetingPoints[selectedMarker].description && (
                                        <div className="text-sm text-gray-600 mt-1">{meetingPoints[selectedMarker].description}</div>
                                    )}
                                </div>
                            </InfoWindow>
                        )}
                    </GoogleMap>
                </div>
            )}
        </div>
    );
};
