import { platformApiRequest, generateIdempotencyKey } from './base';
import type { ImageResolutionRule } from '@/hooks/useImageRule';

export interface GlobalConfigData {
  scope: string;
  key: string;
  data?: any;
  secretData?: string;
  expiresAt?: string;
}

export interface GlobalConfigUpdateData {
  data?: any;
  secretData?: string;
  expiresAt?: string;
}

export interface GlobalConfigFilters {
  scope?: string;
  search?: string;
}

export interface TestConnectivityResult {
  service: string;
  status: 'success' | 'failed';
  responseTime: number;
  error?: string;
}

export const configApi = {
  // List global configs
  async list(): Promise<{ key: string; hasValue: boolean }[]> {
    const res = await platformApiRequest<{ configs: { key: string; hasValue: boolean }[] }>('/config');
    return res.configs;
  },

  // Get config by key
  async get(key: string): Promise<{ key: string; value: any; hasValue: boolean }> {
    return platformApiRequest(`/config/${key}`);
  },

  // Create or update config
  async upsert(data: { key: string; value: any; encrypt?: boolean }): Promise<{ key: string; hasValue: boolean; message: string }> {
    return platformApiRequest('/config', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Delete config
  async delete(key: string): Promise<{ message: string }> {
    return platformApiRequest(`/config/${key}`, {
      method: 'DELETE',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get maintenance banner (uses maintenance/status endpoint)
  async getMaintenanceBanner(): Promise<{
    enabled: boolean;
    message?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
  }> {
    return platformApiRequest('/config/maintenance/status');
  },

  // Update maintenance mode
  async updateMaintenanceBanner(data: {
    enabled: boolean;
    message?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
  }): Promise<void> {
    return platformApiRequest('/config/maintenance', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get signup mode
  async getSignupMode(): Promise<{
    mode: 'open' | 'invite_only';
    allowedDomains: string[];
    requireEmailVerification: boolean;
    trialEnabled: boolean;
    trialDurationDays: number;
  }> {
    return platformApiRequest('/config/signup/settings');
  },

  // Update signup mode
  async updateSignupMode(data: {
    mode?: 'open' | 'invite_only';
    allowedDomains?: string[];
    requireEmailVerification?: boolean;
    trialEnabled?: boolean;
    trialDurationDays?: number;
  }): Promise<void> {
    return platformApiRequest('/config/signup/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get image upload defaults
  async getImageDefaults(): Promise<{
    maxFileSize: number;
    allowedTypes: string[];
    compressionQuality: number;
    thumbnailSizes: number[];
  }> {
    try {
      const res = await (this as any).get('image_defaults');
      return res.value;
    } catch {
      return {
        maxFileSize: 5 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        compressionQuality: 80,
        thumbnailSizes: [200, 400],
      };
    }
  },

  // Update image upload defaults
  async updateImageDefaults(data: {
    maxFileSize: number;
    allowedTypes: string[];
    compressionQuality: number;
    thumbnailSizes: number[];
  }): Promise<void> {
    return (this as any).upsert({ key: 'image_defaults', value: data });
  },

  // Tenant image rules
  async getImageRules(tenantId: string): Promise<{ rules: Record<string, any> }> {
    return platformApiRequest(`/config/image-rules/${tenantId}`);
  },

  async updateImageRule(
    tenantId: string,
    imageType: string,
    rule: {
      width: number;
      height: number;
      fit?: string;
      format?: string;
      quality?: number | 'auto';
      minSource?: { width: number; height: number } | null;
      thumbnails?: number[];
      allowedTypes?: string[];
      maxUploadBytes?: number;
    }
  ): Promise<ImageResolutionRule> {
    return platformApiRequest(`/config/image-rules/${tenantId}/${imageType}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  async createImageRule(
    tenantId: string,
    imageType: string,
    rule: {
      width: number;
      height: number;
      fit?: string;
      format?: string;
      quality?: number | 'auto';
      minSource?: { width: number; height: number } | null;
      thumbnails?: number[];
      allowedTypes?: string[];
      maxUploadBytes?: number;
    }
  ): Promise<ImageResolutionRule> {
    return platformApiRequest(`/config/image-rules/${tenantId}/${imageType}`, {
      method: 'POST',
      body: JSON.stringify(rule),
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};
