import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { 
  ConfigListResponse, 
  SecretConfigResponse, 
  NonSecretConfigResponse, 
  CloudinaryCloudNameResponse,
  TenantConfigKey,
  BrandingConfig
} from '@/types/config';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const useConfigApi = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const handleApiCall = useCallback(async <T>(
    apiCall: () => Promise<Response>
  ): Promise<T> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiCall();
      
      if (!response.ok) {
        if (response.status === 412) {
          const errorData = await response.json();
          throw new Error(`PRECONDITION:${errorData.code}`);
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get multiple configs (masked secrets)
  const getConfigs = useCallback(async (keys: TenantConfigKey[]): Promise<ConfigListResponse> => {
    return handleApiCall(async () => 
      fetch(`${API_BASE}/tenant/config?keys=${keys.join(',')}`, { headers })
    );
  }, [headers, handleApiCall]);

  // Get single config (decrypted if secret)
  const getConfig = useCallback(
    async (
      key: TenantConfigKey,
      provider?: string
    ): Promise<SecretConfigResponse | NonSecretConfigResponse> => {
      return handleApiCall(async () =>
        fetch(
          `${API_BASE}/tenant/config/${key}${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`,
          { headers }
        )
      );
    },
    [headers, handleApiCall]
  );

  // Save config
  const saveConfig = useCallback(async (key: TenantConfigKey, value: any): Promise<void> => {
    return handleApiCall(async () => 
      fetch(`${API_BASE}/tenant/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key, value })
      })
    );
  }, [headers, handleApiCall]);

  // Save branding (batch)
  const saveBranding = useCallback(async (branding: Partial<BrandingConfig>): Promise<void> => {
    return handleApiCall(async () => 
      fetch(`${API_BASE}/tenant/config/branding`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(branding)
      })
    );
  }, [headers, handleApiCall]);

  // Get public branding
  const getPublicBranding = useCallback(async (): Promise<BrandingConfig> => {
    return handleApiCall(async () => 
      fetch(`${API_BASE}/tenant/config/branding/public`, { headers })
    );
  }, [headers, handleApiCall]);

  // Get Cloudinary cloud name
  const getCloudinaryCloudName = useCallback(async (): Promise<CloudinaryCloudNameResponse> => {
    return handleApiCall(async () => 
      fetch(`${API_BASE}/tenant/config/cloudinary/cloud-name`, { headers })
    );
  }, [headers, handleApiCall]);

  // Test template
  const testTemplate = useCallback(async (templateName: string, testData?: any): Promise<string> => {
    const params = testData ? `?testData=${encodeURIComponent(JSON.stringify(testData))}` : '';
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tenant/config/test-template/${templateName}${params}`, { headers });
      if (!response.ok) {
        if (response.status === 412) {
          const errorData = await response.json();
          throw new Error(`PRECONDITION:${errorData.code}`);
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [headers]);

  return {
    getConfigs,
    getConfig,
    saveConfig,
    saveBranding,
    getPublicBranding,
    getCloudinaryCloudName,
    testTemplate,
    loading,
    error,
    clearError: () => setError(null)
  };
};