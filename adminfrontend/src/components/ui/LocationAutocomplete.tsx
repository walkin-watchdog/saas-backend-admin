import React, { useState, useRef, useEffect } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import type { LocationAutocompleteProps } from '@/types';

function findInputInGmpElement(el: any): HTMLInputElement | null {
  if (el.inputElement instanceof HTMLInputElement) {
    return el.inputElement;
  }
  for (const key in el) {
    try {
      const val = el[key];
      if (val instanceof HTMLInputElement) {
        return val;
      }
    } catch {
    }
  }
  console.warn('No input element found in PlaceAutocompleteElement');
  return null;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Search for a location...",
  className = "",
  countryRestriction = 'IN',
  disabled = false,
  forceInit
}) => {
  const [inputValue, setInputValue] = useState(value);
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  
  const { isLoaded, loadError } = useGoogleMaps();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const pac = autocompleteRef.current;
    if (!pac) return;
    const innerInput = findInputInGmpElement(pac);
    if (innerInput && innerInput.value !== inputValue) {
      innerInput.value = inputValue;
    }
  }, [inputValue]);

  useEffect(() => {
    if (isLoaded && inputRef.current && !disabled) {
      initializeAutocomplete();
    }
    return () => {
      cleanupAutocomplete();
    };
  }, [isLoaded, disabled, forceInit]);

  const cleanupAutocomplete = () => {
    autocompleteRef.current?.remove();
    autocompleteRef.current = null;
  };

  const initializeAutocomplete = () => {
    if (
      !inputRef.current ||
      !window.google ||
      !window.google.maps ||
      !window.google.maps.places ||
      disabled
    ) return;
  
    cleanupAutocomplete();
  
    try {
      const pac = new google.maps.places.PlaceAutocompleteElement({
      componentRestrictions: countryRestriction ? { country: [countryRestriction] } : undefined
    });
    pac.classList.add(...inputRef.current!.classList);
    pac.setAttribute('placeholder', placeholder);
    containerRef.current!.replaceChild(pac, inputRef.current!);

    autocompleteRef.current = pac;
    pac.addEventListener('gmp-select', onPlaceChanged as EventListener);
    const initInput = findInputInGmpElement(pac);
    if (initInput && initInput.value !== inputValue) {
      initInput.value = inputValue;
    }
    } catch (error) {
      console.error('Error initializing autocomplete:', error);
    }
  };

  const onPlaceChanged = async (e: any) => {
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
      const locationName = place.formattedAddress || place.name || '';
      
      setInputValue(locationName);
      onChange(locationName, lat, lng, place.id);
      
      // Reinitialize autocomplete
      const pac = autocompleteRef.current;
      if (pac) {
        const innerInput = findInputInGmpElement(pac);
        if (innerInput) innerInput.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // If user clears the input or types manually, clear coordinates
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  if (loadError) {
    return (
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className} pr-10`}
        />
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <span title={loadError}>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={isLoaded ? placeholder : "Loading Google Maps..."}
        disabled={!isLoaded || disabled}
        className={`${className} pr-10`}
      />
      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
        {!isLoaded ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--brand-primary)]"></div>
        ) : (
          <MapPin className="h-4 w-4 text-gray-400" />
        )}
      </div>
    </div>
  );
};
