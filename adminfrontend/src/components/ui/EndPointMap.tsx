import  { useState, useRef, useEffect } from 'react';
import { MapPin, Plus, X, Edit2, AlertCircle } from 'lucide-react';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import { LocationAutocomplete } from '../ui/LocationAutocomplete';
import type { EndPoint, EndPointMapProps } from '../../types/index.ts';

export const EndPointMap = ({ endPoints = [], onEndPointsChange }: EndPointMapProps) => {
  const [isAddingEndPoint, setIsAddingEndPoint] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newEndPoint, setNewEndPoint] = useState<EndPoint>({
    address: '',
    description: '',
    lat: 0,
    lng: 0,
    placeId: ''
  });
  const [showMap, setShowMap] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  
  // Map references
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  
  const { isLoaded, loadError } = useGoogleMaps();

  // Initialize map when Google Maps is loaded
  useEffect(() => {
    if (isLoaded && mapRef.current && showMap) {
      initializeMap();
    }
  }, [isLoaded, showMap, endPoints.length]);

  // Update map markers when endPoints change
  useEffect(() => {
    if (isLoaded && mapInstanceRef.current) {
      updateMapMarkers();
    }
  }, [endPoints, isLoaded]);

  const initializeMap = () => {
    if (!mapRef.current) return;

    try {
      const defaultCenter = endPoints.length > 0 
        ? { lat: endPoints[0].lat, lng: endPoints[0].lng }
        : { lat: 28.6139, lng: 77.2090 }; // Default to Delhi

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        zoom: 10,
        center: defaultCenter,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          }
        ]
      });

      updateMapMarkers();
    } catch (err) {
      console.error('Error initializing map:', err);
    }
  };

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    if (endPoints.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    endPoints.forEach((endPoint, index) => {
      const marker = new google.maps.Marker({
        position: { lat: endPoint.lat, lng: endPoint.lng },
        map: mapInstanceRef.current,
        title: endPoint.address,
        label: {
          text: `E${index + 1}`,
          color: 'white',
          fontWeight: 'bold'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#dc2626', // Red color for end points
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      // Create info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="max-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
              End Point ${index + 1}
            </h3>
            <p style="margin: 0 0 4px 0; font-size: 12px;">
              ${endPoint.address}
            </p>
            ${endPoint.description ? `
              <p style="margin: 0 0 4px 0; font-size: 11px; color: #666;">
                ${endPoint.description}
              </p>
            ` : ''}
            <p style="margin: 0; font-size: 11px; color: #666;">
              Coordinates: ${endPoint.lat.toFixed(6)}, ${endPoint.lng.toFixed(6)}
            </p>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: endPoint.lat, lng: endPoint.lng });
    });

    // Fit map to show all markers
    if (endPoints.length === 1) {
      mapInstanceRef.current.setCenter({ lat: endPoints[0].lat, lng: endPoints[0].lng });
      mapInstanceRef.current.setZoom(15);
    } else if (endPoints.length > 1) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  };

  const handleAddEndPoint = () => {
    if (newEndPoint.address && newEndPoint.lat && newEndPoint.lng) {
      if (editingIndex !== null) {
        const updated = [...endPoints];
        updated[editingIndex] = newEndPoint;
        onEndPointsChange(updated);
        setEditingIndex(null);
      } else {
        onEndPointsChange([...endPoints, newEndPoint]);
      }
      
      setNewEndPoint({ address: '', description: '', lat: 0, lng: 0, placeId: '' });
      setIsAddingEndPoint(false);
      setSearchValue('');
    }
  };

  const handleEditEndPoint = (index: number) => {
    setNewEndPoint(endPoints[index]);
    setEditingIndex(index);
    setIsAddingEndPoint(true);
    setSearchValue(endPoints[index].address);
  };

  const handleRemoveEndPoint = (index: number) => {
    const updated = endPoints.filter((_, i) => i !== index);
    onEndPointsChange(updated);
  };

  const handleCancelEdit = () => {
    setNewEndPoint({ address: '', description: '', lat: 0, lng: 0, placeId: '' });
    setIsAddingEndPoint(false);
    setEditingIndex(null);
    setSearchValue('');
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center px-3 py-2 border border-red-300 rounded-md bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
          <span className="text-red-700 text-sm">{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tour End Locations *
          </label>
          <p className="text-sm text-gray-600">
            Add locations where the tour ends. Travelers will be dropped off at these points.
          </p>
        </div>
        {!isAddingEndPoint && (
          <button
            type="button"
            onClick={() => setIsAddingEndPoint(true)}
            className="flex items-center px-3 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors text-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add End Point
          </button>
        )}
      </div>

      {/* Add/Edit End Point Form */}
      {isAddingEndPoint && (
        <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-3">
            {editingIndex !== null ? 'Edit End Point' : 'Add New End Point'}
          </h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Location *
              </label>
              <div>
                <LocationAutocomplete
                  value={searchValue}
                  onChange={(address, lat, lng, placeId) => {
                    if (lat == null || lng == null || !placeId) {
                      console.warn('EndPointMap: missing lat/lng/placeId, skipping update');
                      return;
                    }
                    setSearchValue(address);
                    setNewEndPoint(prev => ({
                      ...prev,
                      address,
                      lat,
                      lng,
                      placeId
                    }));
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setCenter({ lat, lng });
                      mapInstanceRef.current.setZoom(15);
                    }
                  }}
                  placeholder={isLoaded ? "Search for end location..." : "Loading Google Maps..."}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  forceInit={isAddingEndPoint}
                  disabled={!isLoaded}
                />
              </div>
              {!isLoaded && (
                <div className="text-xs text-gray-500 mt-1">
                  <div className="inline-block animate-spin rounded-full h-3 w-3 border-b border-[var(--brand-primary)] mr-1"></div>
                  Loading Google Maps...
                </div>
              )}
            </div>

            {newEndPoint.address && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selected Address
                  </label>
                  <input
                    type="text"
                    value={newEndPoint.address}
                    onChange={(e) => setNewEndPoint(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Details (Optional)
                  </label>
                  <textarea
                    value={newEndPoint.description || ''}
                    onChange={(e) => setNewEndPoint(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    placeholder="Additional instructions for this end point..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddEndPoint}
                    className="px-3 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors text-sm"
                  >
                    {editingIndex !== null ? 'Update End Point' : 'Add End Point'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Map Display */}
      {endPoints.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              End Points Map
            </label>
            <button
              onClick={() => setShowMap(!showMap)}
              className="flex items-center space-x-1 text-sm text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)]"
            >
              <MapPin className="h-4 w-4" />
              <span>{showMap ? 'Hide Map' : 'Show Map'}</span>
            </button>
          </div>
          {showMap && isLoaded && (
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div ref={mapRef} style={{ height: '400px', width: '100%' }} />
            </div>
          )}
        </div>
      )}

      {/* End Points List */}
      {endPoints.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900">End Locations ({endPoints.length})</h4>
          <div className="space-y-2">
            {endPoints.map((endPoint, index) => (
              <div key={index} className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-md">
                <div className="flex items-start space-x-3 flex-1">
                  <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{endPoint.address}</div>
                    {endPoint.description && (
                      <div className="text-sm text-gray-600 mt-1">{endPoint.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Coordinates: {endPoint.lat.toFixed(6)}, {endPoint.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-3">
                  <button
                    type="button"
                    onClick={() => handleEditEndPoint(index)}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                    title="Edit end point"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveEndPoint(index)}
                    className="text-red-600 hover:text-red-800 transition-colors"
                    title="Remove end point"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {endPoints.length === 0 && !isAddingEndPoint && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No end locations added</p>
          <p className="text-sm text-gray-500 mt-1">
            Click "Add End Point" to specify where the tour ends
          </p>
        </div>
      )}
    </div>
  );
};