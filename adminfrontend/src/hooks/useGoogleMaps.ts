import type { UseGoogleMapsReturn } from '@/types';
import { useState, useEffect } from 'react';

let loaderPromise: Promise<void> | null = null;

export const useGoogleMaps = (): UseGoogleMapsReturn => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setLoadError('Google Maps API key is missing. Please check your environment variables.');
      return;
    }

    // Check if Google Maps is already loaded
    if (window.google?.maps?.places) {
      setIsLoaded(true);
      return;
    }

    if (!loaderPromise) {
      loaderPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src*="maps.googleapis.com/maps/api/js"]'
        );
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () =>
            reject(new Error('Google Maps script failed to load'))
          );
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error('Google Maps script failed to load'));
        document.head.appendChild(script);
      });
    }

    loaderPromise
      .then(() => setIsLoaded(true))
      .catch(err => setLoadError(err.message));
  }, []);

  return { isLoaded, loadError };
};
