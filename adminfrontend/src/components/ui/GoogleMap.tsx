import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { GoogleMapProps } from '../../types/index.ts';



export const GoogleMap: React.FC<GoogleMapProps> = ({
  locations,
  className = "",
  height = "400px"
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const checkGoogleMaps = () => {
      if (window.google && window.google.maps) {
        initializeMap();
        setIsLoaded(true);
      } else {
        setTimeout(checkGoogleMaps, 100);
      }
    };

    checkGoogleMaps();
  }, []);

  useEffect(() => {
    if (isLoaded && mapInstanceRef.current) {
      updateMapMarkers();
    }
  }, [locations, isLoaded]);

  const initializeMap = () => {
    if (!mapRef.current) return;

    try {
      const defaultCenter = locations.length > 0 
        ? { lat: locations[0].lat, lng: locations[0].lng }
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

      console.log('Map initialized successfully');
    } catch (err) {
      console.error('Error initializing map:', err);
      setError('Failed to initialize map');
    }
  };

  const clearMapElements = () => {
    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Clear existing circles
    circlesRef.current.forEach(circle => circle.setMap(null));
    circlesRef.current = [];
  };

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current) return;

    clearMapElements();

    if (locations.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    locations.forEach((location, index) => {
      // Create marker with red color
      const marker = new google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map: mapInstanceRef.current,
        title: location.address,
        label: {
          text: (index + 1).toString(),
          color: 'white',
          fontWeight: 'bold'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#dc2626',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      // Create radius circle with red theme
      const circle = new google.maps.Circle({
        strokeColor: '#dc2626',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#dc2626',
        fillOpacity: 0.15,
        map: mapInstanceRef.current,
        center: { lat: location.lat, lng: location.lng },
        radius: location.radius * 1000 // Convert km to meters
      });

      // Create info window
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="max-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
              Location ${index + 1}
            </h3>
            <p style="margin: 0 0 4px 0; font-size: 12px;">
              ${location.address}
            </p>
            <p style="margin: 0; font-size: 11px; color: #666;">
              Radius: ${location.radius}km<br>
              Coordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}
            </p>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
      circlesRef.current.push(circle);
      bounds.extend({ lat: location.lat, lng: location.lng });
    });

    // Fit map to show all markers
    if (locations.length === 1) {
      mapInstanceRef.current.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
      mapInstanceRef.current.setZoom(13);
    } else if (locations.length > 1) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  };

  if (error) {
    return (
      <div className={`flex items-center justify-center border border-red-300 rounded-md bg-red-50 ${className}`} 
           style={{ height }}>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-gray-300 rounded-md overflow-hidden ${className}`}>
      <div ref={mapRef} style={{ height, width: '100%' }} />
      {locations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-90">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Add locations to see them on the map</p>
          </div>
        </div>
      )}
    </div>
  );
};
