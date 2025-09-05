import crypto from 'crypto';
import type {
  ImageType,
  ImageResolutionRule,
  TenantImageConfig,
  CloudinaryConfig,
} from '../types/tenantConfig';
import { TenantConfigService } from './tenantConfigService';
import { logger } from '../utils/logger';

const defaultConfig: TenantImageConfig = {
  tenantId: 'default',
  updatedAt: new Date().toISOString(),
  rules: {
    destinations: {
      imageType: 'destinations',
      width: 1600,
      height: 900,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1600, height: 900 },
      thumbnails: [480, 960],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 2 * 1024 * 1024,
    },
    logos: {
      imageType: 'logos',
      width: 280,
      height: 121,
      fit: 'contain',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 280, height: 121 },
      thumbnails: [256],
      allowedTypes: ['image/png', 'image/webp'],
      maxUploadBytes: 512 * 1024,
    },
    slides: {
      imageType: 'slides',
      width: 640,
      height: 256,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 640, height: 256 },
      thumbnails: [320],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 1024 * 1024,
    },
    partners: {
      imageType: 'partners',
      width: 400,
      height: 200,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 400, height: 200 },
      thumbnails: [200],
      allowedTypes: ['image/webp', 'image/jpeg', 'image/png'],
      maxUploadBytes: 512 * 1024,
    },
    products: {
      imageType: 'products',
      width: 1280,
      height: 800,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1280, height: 800 },
      thumbnails: [480, 960],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 2 * 1024 * 1024,
    },
    'destination-card': {
      imageType: 'destination-card',
      width: 300,
      height: 200,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 300, height: 200 },
      thumbnails: [150],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 512 * 1024,
    },
    'destination-banner': {
      imageType: 'destination-banner',
      width: 1280,
      height: 430,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1280, height: 430 },
      thumbnails: [640],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 2 * 1024 * 1024,
    },
    'attraction-card': {
      imageType: 'attraction-card',
      width: 300,
      height: 200,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 300, height: 200 },
      thumbnails: [150],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 512 * 1024,
    },
    'attraction-banner': {
      imageType: 'attraction-banner',
      width: 1280,
      height: 430,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1280, height: 430 },
      thumbnails: [640],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 2 * 1024 * 1024,
    },
    'experience-category-card': {
      imageType: 'experience-category-card',
      width: 300,
      height: 200,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 300, height: 200 },
      thumbnails: [150],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 512 * 1024,
    },
    'experience-category-banner': {
      imageType: 'experience-category-banner',
      width: 1280,
      height: 430,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1280, height: 430 },
      thumbnails: [640],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 2 * 1024 * 1024,
    },
    team: {
      imageType: 'team',
      width: 400,
      height: 260,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 400, height: 260 },
      thumbnails: [200],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 512 * 1024,
    },
    'home-slide': {
      imageType: 'home-slide',
      width: 1280,
      height: 370,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 1280, height: 370 },
      thumbnails: [640],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 1024 * 1024,
    },
    'itinerary-activity': {
      imageType: 'itinerary-activity',
      width: 125,
      height: 125,
      fit: 'cover',
      format: 'webp',
      quality: 'auto',
      minSource: { width: 125, height: 125 },
      thumbnails: [64],
      allowedTypes: ['image/webp', 'image/jpeg'],
      maxUploadBytes: 256 * 1024,
    },
  },
};

const tenantConfigs: Record<string, TenantImageConfig> = {};

// Ensure default rules are persisted and cached on startup
void (async () => {
  try {
    // Import here to avoid circular dependency
    const { TenantService } = await import('./tenantService');
    const defaultTenant = await TenantService.getOrCreateDefaultTenant();
    const defaultTenantId = defaultTenant.id;

    const existing = await TenantConfigService.getConfig<TenantImageConfig>(
      defaultTenantId,
      'imageRules'
    );
    if (existing) {
      tenantConfigs[defaultTenantId] = existing;
    } else {
      const configWithCorrectId = { ...defaultConfig, tenantId: defaultTenantId };
      await TenantConfigService.createConfig(defaultTenantId, 'imageRules', configWithCorrectId);
      tenantConfigs[defaultTenantId] = configWithCorrectId;
    }
    // Also set 'default' key for backward compatibility
    tenantConfigs['default'] = tenantConfigs[defaultTenantId];
  } catch (e) {
    logger.error('Failed to initialize default image rules', {
      error: (e as any)?.message,
    });
    tenantConfigs['default'] = defaultConfig;
  }
})();

export class ConfigService {
  static async usePlatformRules(tenantId: string): Promise<boolean> {
    try {
      const cloud = await TenantConfigService.getConfig<CloudinaryConfig>(
        tenantId,
        'cloudinary'
      );
      return !!(cloud?.cloudName && cloud.apiKey && cloud.apiSecret);
    } catch (e) {
      logger.warn('Failed to compute imageRulesFromPlatformConfig', {
        tenantId,
        error: (e as any)?.message,
      });
      return false;
    }
  }

  static async getTenantImageConfig(tenantId: string): Promise<TenantImageConfig> {
    const useRules = await this.usePlatformRules(tenantId);
    if (useRules) {
      const cached = tenantConfigs[tenantId];
      if (cached) return cached;

      const cfg = await TenantConfigService.getConfig<TenantImageConfig>(
        tenantId,
        'imageRules'
      );
      if (cfg) {
        tenantConfigs[tenantId] = cfg;
        return cfg;
      }
    }

    // Use default tenant config
    const { TenantService } = await import('./tenantService');
    const defaultTenant = await TenantService.getOrCreateDefaultTenant();
    const defaultTenantId = defaultTenant.id;
    const cached = tenantConfigs[defaultTenantId];
    if (cached) return cached;

    const cfg = await TenantConfigService.getConfig<TenantImageConfig>(
      defaultTenantId,
      'imageRules'
    );
    if (cfg) {
      tenantConfigs[defaultTenantId] = cfg;
      return cfg;
    }
    // Fallback to default config if retrieval fails
    return tenantConfigs['default'] || defaultConfig;
  }

  static async setTenantImageRule(
    tenantId: string,
    imageType: ImageType,
    rule: ImageResolutionRule
  ): Promise<TenantImageConfig> {
    const existing = await TenantConfigService.getConfig<TenantImageConfig>(
      tenantId,
      'imageRules'
    );

    let base = existing;
    if (!base) {
      // Try to get default config
      const { TenantService } = await import('./tenantService');
      const defaultTenant = await TenantService.getOrCreateDefaultTenant();
      const defaultTenantId = defaultTenant.id;
      base =
        tenantConfigs[defaultTenantId] ||
        (await TenantConfigService.getConfig<TenantImageConfig>(defaultTenantId, 'imageRules')) ||
        defaultConfig;
    }

    const updated: TenantImageConfig = {
      tenantId,
      updatedAt: new Date().toISOString(),
      rules: { ...base.rules, [imageType]: { ...rule, imageType } },
    };
    tenantConfigs[tenantId] = updated;
    await TenantConfigService.updateConfig(tenantId, 'imageRules', updated);
    return updated;
  }

  static async getTenantImageRule(
    tenantId: string,
    imageType: ImageType
  ): Promise<ImageResolutionRule> {
    const cfg = await this.getTenantImageConfig(tenantId);
    const rule = cfg.rules[imageType] || cfg.rules['destinations'];
    return rule;
  }

  static generateEtag(data: unknown): string {
    return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
  }
}

export default ConfigService;