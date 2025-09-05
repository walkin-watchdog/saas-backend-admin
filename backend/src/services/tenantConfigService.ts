import { prisma as rootPrisma } from '../utils/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';
import { EncryptionService } from '../utils/encryption';
import { CacheService } from '../utils/cache';
import { logger } from '../utils/logger';
import { 
  TenantConfigKey, 
  TenantConfigValue, 
  BrandingKey,
  BrandingConfig,
  ConfigData
} from '../types/tenantConfig';

// Define which keys should be encrypted
const ENCRYPTED_KEYS: Set<TenantConfigKey> = new Set([
  'smtp',
  'cloudinary',
  'wordpress',
  'currencyApi',
  'razorpay',
  'paypal',
  'maps',
  'hubspot',
]);

// Define branding keys that don't need encryption
const BRANDING_KEYS: Set<BrandingKey> = new Set([
  'companyName',
  'companyEmail',
  'companyPhone',
  'companyAddress',
  'whatsappNumber',
  'facebookUrl',
  'linkedinUrl',
  'xUrl',
  'instagramUrl',
  'logoUrl',
  'footerHtml',
  'primaryColor',
  'secondaryColor',
  'tertiaryColor',
  'whiteLabelBranding'
]);

// Default branding values
const DEFAULT_BRANDING: Partial<BrandingConfig> = {
  companyName: process.env.COMPANY_NAME || 'Zenseeo',
  companyEmail: process.env.COMPANY_EMAIL || 'info@zenseeo.com',
  companyPhone: process.env.COMPANY_PHONE || '+91 98765 43210',
  companyAddress: process.env.COMPANY_ADDRESS || '123, Block A, New Delhi, Delhi - India',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '+919876543210',
  facebookUrl: process.env.FACEBOOK_URL || '',
  linkedinUrl: process.env.LINKEDIN_URL || '',
  xUrl: process.env.X_URL || '',
  instagramUrl: process.env.INSTAGRAM_URL || '',
  logoUrl: process.env.LOGO_URL || '',
  footerHtml: process.env.FOOTER_HTML || '',
  primaryColor: process.env.PRIMARY_COLOR || '#0F62FE',
  secondaryColor: process.env.SECONDARY_COLOR || '#111827',
  tertiaryColor: process.env.TERTIARY_COLOR || '#6B7280',
  whiteLabelBranding: false,
};

function isSameTenantOrNoContext(targetTenantId: string): boolean {
  const current = getTenantId();
  return !current || current === targetTenantId;
}

function denyIfCrossTenant<T>(op: string, tenantId: string, extra?: Record<string, unknown>): T | null {
  const current = getTenantId();
  logger.warn('Cross-tenant access blocked', { op, currentTenantId: current, targetTenantId: tenantId, ...(extra || {}) });
  return null;
}

// Union of all valid keys (encrypted + non-encrypted integrations + branding)
const ALL_KEYS: Set<TenantConfigKey> = new Set<TenantConfigKey>([
  // integrations
  'smtp','cloudinary','wordpress','currencyApi','razorpay','paypal','maps','hubspot','tax',
  // branding
  'companyName','companyEmail','companyPhone','companyAddress','whatsappNumber',
  'facebookUrl','linkedinUrl','xUrl','instagramUrl','logoUrl','footerHtml',
  'primaryColor','secondaryColor','tertiaryColor','whiteLabelBranding','imageRules',
]);

export class TenantConfigService {
  private static getPrismaFor(targetTenantId?: string): PrismaClient {
    const current = getTenantId();
    if (current && (!targetTenantId || current === targetTenantId)) {
      return getTenantPrisma();
    }
    return rootPrisma;
  }

  static async createConfig(
    tenantId: string,
    key: TenantConfigKey,
    data: ConfigData
  ): Promise<TenantConfigValue> {
    const prisma = this.getPrismaFor(tenantId);
    if (!isSameTenantOrNoContext(tenantId)) {
      throw new Error('Forbidden: cross-tenant write');
    }
    try {
      const isEncrypted = ENCRYPTED_KEYS.has(key);
      
      let enc: string | null = null;
      let dek: string | null = null;
      if (isEncrypted) {
        try {
          const env = EncryptionService.encryptEnvelope(JSON.stringify(data));
          enc = env.ciphertext;
          dek = env.dek;
        } catch (e) {
          logger.error('Encryption failed while creating tenant config', {
            tenantId, key, error: (e as any)?.message, stack: (e as any)?.stack
          });
          const err = new Error('Failed to create configuration');
          (err as any).cause = e;
          throw err;
        }
      }
      // Use a single race-safe upsert on the compound unique (tenantId, key)
      const config = await prisma.tenantConfig.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: isEncrypted
          // Omit "value" entirely for encrypted keys (Prisma JSON cannot be set to plain null)
          ? { tenantId, key, value: Prisma.DbNull, secret: enc, dek }
          : { tenantId, key, value: data as any, secret: null, dek: null },
        update: isEncrypted
          // Explicitly clear JSON column with DbNull on update
          ? { value: Prisma.DbNull, secret: enc, dek, updatedAt: new Date() }
          : { value: data as any, secret: null, dek: null, updatedAt: new Date() }
      });
      
      // Update cache
      try {
        CacheService.setTenantConfig(tenantId, key, data, { broadcast: true });
      } catch (e) {
        logger.warn('Cache set failed, continuing without cache', {
          tenantId, key, error: (e as any)?.message
        });
      }
      
      logger.info('Tenant config created', { tenantId, key: key, encrypted: isEncrypted });
      
      return {
        ...config,
        key: key // Ensure the key is properly typed
      } as TenantConfigValue;
    } catch (error) {
      logger.error('Failed to create tenant config', {
        tenantId, key, 
        error: (error as any)?.message, 
        stack: (error as any)?.stack
      });
      throw error;
    }
  }

  static async updateConfig(
    tenantId: string,
    key: TenantConfigKey,
    data: ConfigData
  ): Promise<TenantConfigValue> {
    const prisma = this.getPrismaFor(tenantId);
    if (!isSameTenantOrNoContext(tenantId)) {
      throw new Error('Forbidden: cross-tenant write');
    }
    try {
      const isEncrypted = ENCRYPTED_KEYS.has(key);
      
      let enc: string | null = null;
      let dek: string | null = null;
      if (isEncrypted) {
        try {
          const env = EncryptionService.encryptEnvelope(JSON.stringify(data));
          enc = env.ciphertext;
          dek = env.dek;
        } catch (e) {
          logger.error('Encryption failed while updating tenant config', {
            tenantId, key, error: (e as any)?.message, stack: (e as any)?.stack
          });
          const err = new Error('Failed to update configuration');
          (err as any).cause = e;
          throw err;
        }
      }
      const config = await prisma.tenantConfig.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: isEncrypted
          // Omit "value" entirely for encrypted keys
          ? { tenantId, key, value: Prisma.DbNull, secret: enc, dek }
          : { tenantId, key, value: data as any, secret: null, dek: null },
        update: isEncrypted
          // Clear JSON properly with DbNull
          ? { value: Prisma.DbNull, secret: enc, dek, updatedAt: new Date() }
          : { value: data as any, secret: null, dek: null, updatedAt: new Date() }
      });
      
      // Update cache
      try {
        CacheService.setTenantConfig(tenantId, key, data, { broadcast: true });
      } catch (e) {
        logger.warn('Cache set failed, continuing without cache', {
          tenantId, key, error: (e as any)?.message
        });
      }
      
      logger.info('Tenant config updated', { tenantId, key, encrypted: isEncrypted });
      
      return {
        ...config,
        key: key // Ensure the key is properly typed
      } as TenantConfigValue;
    } catch (error) {
      logger.error('Failed to update tenant config', { tenantId, key, error: (error as any)?.message, stack: (error as any)?.stack });
      throw error;
    }
  }

  static async getConfig<T = ConfigData>(
    tenantId: string,
    key: TenantConfigKey,
    useCache: boolean = true
  ): Promise<T | null> {
    if (!isSameTenantOrNoContext(tenantId)) {
      return denyIfCrossTenant<T | null>('getConfig', tenantId, { key }) as T | null;
    }
    try {
      // Try cache first
      if (useCache) {
        try {
          const cached = CacheService.getTenantConfig(tenantId, key);
          if (cached !== null) {
            return cached as T;
          }
        } catch (e) {
          logger.warn('Cache read failed, falling back to DB', {
            tenantId, key, error: (e as any)?.message
          });
        }
      }
      
      // Fallback to database
      const prisma = this.getPrismaFor(tenantId);
      const config = await prisma.tenantConfig.findFirst({
        where: { tenantId, key }
      });
      
      if (!config) {
        return null;
      }
      
      let configData: T;
      
      if (config.secret) {
        try {
          const decrypted = config.dek
            ? EncryptionService.decryptEnvelope(config.secret, config.dek)
            : EncryptionService.decrypt(config.secret);
          configData = JSON.parse(decrypted) as T;
        } catch (e) {
          logger.error('Config decrypt failed', { tenantId, key, error: (e as any)?.message });
          return null;
        }
      } else {
        // Use non-sensitive data
        configData = config.value as T;
      }
      
      // Update cache
      if (useCache) {
        try {
          CacheService.setTenantConfig(tenantId, key, configData);
        } catch (e) {
          logger.warn('Cache set failed, continuing without cache', {
            tenantId, key, error: (e as any)?.message
          });
        }
      }
      
      return configData;
    } catch (error) {
      logger.error('Failed to get tenant config', { tenantId, key, error: (error as any)?.message, stack: (error as any)?.stack });
      
      return null;
    }
  }

  static async getMultipleConfigs(
    tenantId: string,
    keys: TenantConfigKey[],
    opts: { decryptSecrets?: boolean; useEnvDefaults?: boolean } = { decryptSecrets: false, useEnvDefaults: true }
  ): Promise<{ [K in TenantConfigKey]?: any } & { defaultsUsed?: boolean }> {
    if (!isSameTenantOrNoContext(tenantId)) {
      denyIfCrossTenant('getMultipleConfigs', tenantId, { keys });
      return { defaultsUsed: true }; // safe, empty result with "defaultsUsed" hint
    }
    const result: any = {};
    let defaultsUsed = false;

    try {
      // Single DB round-trip; do NOT decrypt here by default.
      const prisma = this.getPrismaFor(tenantId);
      const rows = await prisma.tenantConfig.findMany({
        where: { tenantId, key: { in: keys } },
        select: { key: true, value: true, secret: true, dek: true }
      });
      
      // Properly type the database result
      type ConfigRow = {
        key: string;
        value: any;
        secret: string | null;
        dek: string | null;
      };
      
      type Row = { key: string; value: any; secret: string | null; dek: string | null };
      const byKey = new Map<TenantConfigKey, ConfigRow>(
        rows.map((r: ConfigRow) => [r.key as TenantConfigKey, r])
      );

      for (const key of keys) {
        const row = byKey.get(key);

        if (!row) {
          // Not set -> optionally apply env defaults for branding keys
          if (opts.useEnvDefaults !== false && BRANDING_KEYS.has(key as BrandingKey)) {
            const def = DEFAULT_BRANDING[key as BrandingKey];
            if (def !== undefined) {
              result[key] = def;
              defaultsUsed = true;
            }
          }
          continue;
        }

        // Non-secret keys: return JSON value as-is.
        if (!ENCRYPTED_KEYS.has(key)) {
          result[key] = row.value;
          continue;
        }

        // Secret keys:
        if (opts.decryptSecrets === true) {
          // Explicitly allowed decrypted multi-get (rare; avoid by default)
          try {
            if (row.secret) {
              const json = row.dek
                ? EncryptionService.decryptEnvelope(row.secret, row.dek)
                : EncryptionService.decrypt(row.secret);
              result[key] = JSON.parse(json);
            } else {
              result[key] = null;
            }
          } catch (e) {
            logger.error('Decryption failed in multi-get (secret key)', { tenantId, key, error: (e as any)?.message });
            // Do not fall back to defaults for secrets; just indicate presence
            result[key] = { secretSet: !!row.secret };
          }
        } else {
          // DEFAULT: do NOT decrypt in multi-get; return masked metadata only.
          result[key] = { secretSet: !!row.secret };
        }
      }
    } catch (error) {
      logger.error('Failed multi-get for tenant configs', { tenantId, keys, error: (error as any)?.message });
      // Optionally apply env defaults if allowed when the whole read failed
      if (opts.useEnvDefaults !== false) {
        for (const key of keys) {
          if (BRANDING_KEYS.has(key as BrandingKey)) {
            const def = DEFAULT_BRANDING[key as BrandingKey];
            if (def !== undefined) {
              result[key] = def;
              defaultsUsed = true;
            }
          }
        }
      }
    }

    if (defaultsUsed) {
      result.defaultsUsed = true;
      logger.warn('Using default values for some config keys', { tenantId, keys });
    }

    return result;
  }

  static async deleteConfig(tenantId: string, key: TenantConfigKey): Promise<boolean> {
    
    try {
      const prisma = this.getPrismaFor(tenantId);
      if (!isSameTenantOrNoContext(tenantId)) {
        denyIfCrossTenant('deleteConfig', tenantId, { key });
        return false;
      }
      const res = await prisma.tenantConfig.deleteMany({
        where: { tenantId, key }
      });
      
      // Remove from cache
      try {
        CacheService.deleteTenantConfig(tenantId, key);
      } catch (e) {
        logger.warn('Cache delete failed, continuing', {
          tenantId, key, error: (e as any)?.message
        });
      }
      
      logger.info('Tenant config deleted', { tenantId, key });
      
      return res.count > 0;
    } catch (error) {
      logger.error('Failed to delete tenant config', { tenantId, key, error: (error as any)?.message, stack: (error as any)?.stack });
      return false;
    }
  }

  static async listConfigs(tenantId: string): Promise<Array<{
    key: TenantConfigKey;
    hasValue: boolean;
    isEncrypted: boolean;
    updatedAt: Date;
  }>> {
    if (!isSameTenantOrNoContext(tenantId)) {
      denyIfCrossTenant('listConfigs', tenantId);
      return [];
    }
    try {
      const prisma = this.getPrismaFor(tenantId);
      const configs = await prisma.tenantConfig.findMany({
        where: { tenantId },
        select: {
          key: true,
          value: true,
          secret: true,
          dek: true,
          updatedAt: true
        },
        orderBy: { key: 'asc' }
      });
      
      return configs.map((config: any) => ({
        key: config.key as TenantConfigKey,
        hasValue: (config.value != null) || (config.secret != null),
        isEncrypted: config.secret != null,
        updatedAt: config.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to list tenant configs', { tenantId, error: (error as any)?.message, stack: (error as any)?.stack });
      throw new Error('Failed to list configurations');
    }
  }

  static async getBrandingConfig(tenantId: string): Promise<BrandingConfig & { defaultsUsed?: boolean }> {
    const brandingKeys: BrandingKey[] = [
      'companyName',
      'companyEmail', 
      'companyPhone',
      'companyAddress',
      'whatsappNumber',
      'facebookUrl',
      'linkedinUrl',
      'xUrl',
      'instagramUrl',
      'logoUrl',
      'footerHtml',
      'primaryColor',
      'secondaryColor',
      'tertiaryColor',
      'whiteLabelBranding',
    ];
    
    const result = await this.getMultipleConfigs(tenantId, brandingKeys, { useEnvDefaults: false });
    if (Object.keys(result).length === 0) {
      const err: any = new Error('Branding configuration missing');
      err.code = 'BRANDING_CONFIG_MISSING';
      throw err;
    }
    return result as BrandingConfig & { defaultsUsed?: boolean };
  }

  // Convenience helpers for frontend-backed integrations to call backend later
  static async getMapsApiKey(tenantId: string): Promise<string | null> {
    const cfg = await this.getConfig<{ googleApiKey?: string }>(tenantId, 'maps');
    return cfg?.googleApiKey || null;
  }

  static async getWordpressConfig(tenantId: string): Promise<any | null> {
    const cfg = await this.getConfig<any>(tenantId, 'wordpress');
    if (!cfg) {
      const err: any = new Error('WordPress configuration missing');
      err.code = 'WORDPRESS_CONFIG_MISSING';
      throw err;
    }
    return cfg;
  }

  static async warmUpCache(tenantId?: string): Promise<void> {
    const prisma = this.getPrismaFor(tenantId);
    
    try {
      if (tenantId) {
        CacheService.clearTenantConfigs(tenantId);
      } else {
        CacheService.clear();
      }
      const where = tenantId ? { tenantId } : {};
      const configs = await prisma.tenantConfig.findMany({
        where,
        select: {
          tenantId: true,
          key: true,
          value: true,
          secret: true,
          dek: true,
          updatedAt: true,
        } as any,
        orderBy: [{ tenantId: 'asc' }, { key: 'asc' }, { updatedAt: 'desc' }]
      });
      
      for (const config of configs) {
        try {
          let configData: any;
          
          if (config.secret) {
            const plaintext = config.dek
              ? EncryptionService.decryptEnvelope(config.secret, config.dek)
              : EncryptionService.decrypt(config.secret);
            configData = JSON.parse(plaintext);
          } else {
            configData = config.value;
          }
          
          try {
            CacheService.setTenantConfig(
              config.tenantId,
              config.key as TenantConfigKey,
              configData
            );
          } catch (e) {
            logger.warn('Cache set failed during warm-up, continuing', { tenantId: config.tenantId, key: config.key, error: (e as any)?.message });
          }
        } catch (error) {
          logger.error('Failed to warm up cache for config', { 
            tenantId: config.tenantId, 
            key: config.key, 
            error: (error as any)?.message,
            stack: (error as any)?.stack 
          });
        }
      }
      
      logger.info('Cache warmed up', { 
        tenantId: tenantId || 'all', 
        configCount: configs.length 
      });
    } catch (error) {
      logger.error('Failed to warm up cache', { tenantId, error: (error as any)?.message, stack: (error as any)?.stack });
    }
  }

  static async validateConfigKey(key: string): Promise<boolean> {
    return ALL_KEYS.has(key as TenantConfigKey);
  }

  static isEncryptedKey(key: TenantConfigKey): boolean {
    return ENCRYPTED_KEYS.has(key);
  }

  static isBrandingKey(key: string): key is BrandingKey {
    return BRANDING_KEYS.has(key as BrandingKey);
  }

  static getDefaultBrandingValue<K extends BrandingKey>(key: K): BrandingConfig[K] | undefined {
    return DEFAULT_BRANDING[key as K];
  }
}

// Initialize cache warming on module load
CacheService.on('tenant:*:config-updated', (data: { tenantId: string; key: TenantConfigKey }) => {
  logger.info('Config updated via cache event', data);
});

// Export for testing
export { ENCRYPTED_KEYS, BRANDING_KEYS, DEFAULT_BRANDING };