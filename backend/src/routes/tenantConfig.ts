import express from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { TenantConfigService } from '../services/tenantConfigService';
import ConfigService from '../services/configService';
import { TemplateLoader } from '../utils/templateLoader';
import { logger } from '../utils/logger';
import { TenantConfigKey, BrandingKey, ConfigData, CloudinaryConfig } from '../types/tenantConfig';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

// Validation schemas for different config types
const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().email()
});

const cloudinaryConfigSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1)
});

const razorpayConfigSchema = z.object({
  keyId: z.string().min(1),
  keySecret: z.string().min(1),
  webhookSecret: z.string().min(1)
});

const paypalConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  webhookId: z.string().min(1),
  baseUrl: z.string().url(),
  redirectUrl: z.string().url()
});

const mapsConfigSchema = z.object({
  provider: z.enum(['google']).optional().default('google'),
  googleApiKey: z.string().min(1)
});

const hubspotConfigSchema = z.object({
  accessToken: z.string().min(1),
  defaultOwnerId: z.string().optional(),
  contactSourceProperty: z.string().optional(),
  dealsPipelineId: z.string().optional(),
  dealsPipelineName: z.string().optional()
});

const currencyApiConfigSchema = z.object({
  apiKey: z.string().min(1)
});

const wordpressConfigSchema = z.object({
  baseUrl: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1)
});

const brandingConfigSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyEmail: z.string().email().optional(),
  companyPhone: z.string().min(1).optional(),
  companyAddress: z.string().min(1).optional(),
  whatsappNumber: z.string().min(1).optional(),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  xUrl: z.string().url().optional().or(z.literal('')),
  instagramUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  footerHtml: z.string().optional(),
});

// NEW: tax config
const taxConfigSchema = z.object({
  // Accept 0–100; normalization to 0–1 happens downstream
  percent: z.number().min(0).max(100),
  jurisdiction: z.string().min(1)
});

const configRequestSchema = z.object({
  key: z.string(),
  value: z.any()
});

// Validate config data based on key
function validateConfigData(key: TenantConfigKey, value: unknown): ConfigData {
  switch (key) {
    case 'smtp':
      return smtpConfigSchema.parse(value);
    case 'cloudinary':
      return cloudinaryConfigSchema.parse(value);
    case 'wordpress':
      return wordpressConfigSchema.parse(value);
    case 'razorpay':
      return razorpayConfigSchema.parse(value);
    case 'paypal':
      return paypalConfigSchema.parse(value);
    case 'maps':
      return mapsConfigSchema.parse(value);
    case 'hubspot':
      return hubspotConfigSchema.parse(value);
    case 'currencyApi':
      return currencyApiConfigSchema.parse(value);
    case 'tax':
      return taxConfigSchema.parse(value);
    case 'companyName':
    case 'companyEmail':
    case 'companyPhone':
    case 'companyAddress':
    case 'whatsappNumber':
    case 'facebookUrl':
    case 'linkedinUrl':
    case 'xUrl':
    case 'instagramUrl':
    case 'logoUrl':
    case 'footerHtml':

    default: {
      // Exhaustiveness safeguard
      const _never: never = key as never;
      throw new Error(`Unknown config key: ${_never}`);
    }
  }
}

// Get multiple configs by keys
router.get('/', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { keys } = z.object({
      keys: z.string().optional()
    }).parse(req.query);

    if (!keys) {
      // Return list of available configs
      const configList = await TenantConfigService.listConfigs(req.tenantId!);
      return res.json({ configs: configList });
    }

    const keyArray = keys
      .split(',')
      .map(k => k.trim()) as (TenantConfigKey | 'imageRulesFromPlatformConfig')[];

    // Validate all keys except the computed flag
    for (const key of keyArray) {
      if (key === 'imageRulesFromPlatformConfig') continue;
      const isValid = await TenantConfigService.validateConfigKey(key as TenantConfigKey);
      if (!isValid) {
        return res.status(400).json({
          error: `Invalid config key: ${key}`
        });
      }
    }

    const tenantKeys = keyArray.filter(
      k => k !== 'imageRulesFromPlatformConfig'
    ) as TenantConfigKey[];
    const configs: any = await TenantConfigService.getMultipleConfigs(
      req.tenantId!,
      tenantKeys,
      { decryptSecrets: false }
    );
    if (keyArray.includes('imageRulesFromPlatformConfig')) {
      configs.imageRulesFromPlatformConfig = await ConfigService.usePlatformRules(req.tenantId!);
    }
    res.json(configs);
  } catch (error) {
    next(error);
  }
});

// Get branding config (public endpoint for frontend)
router.get('/branding/public', async (req: TenantRequest, res, next) => {
  try {
    const branding = await TenantConfigService.getBrandingConfig(req.tenantId!);
    
    // Only return public branding fields
    const publicBranding = {
      companyName: branding.companyName,
      companyEmail: branding.companyEmail,
      companyPhone: branding.companyPhone,
      companyAddress: branding.companyAddress,
      whatsappNumber: branding.whatsappNumber,
      facebookUrl: branding.facebookUrl,
      linkedinUrl: branding.linkedinUrl,
      xUrl: branding.xUrl,
      instagramUrl: branding.instagramUrl,
      logoUrl: branding.logoUrl,
      footerHtml: branding.footerHtml,
      defaultsUsed: branding.defaultsUsed,
    };

    res.json(publicBranding);
  } catch (error) {
    next(error);
  }
});

// Expose cloudinary cloud name (public, safe)
router.get('/cloudinary/cloud-name', authenticate, async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const cfg = await TenantConfigService.getConfig<CloudinaryConfig>(req.tenantId!, 'cloudinary');
    res.json({
      cloudName: cfg?.cloudName || null,
      configured: !!(cfg?.cloudName && cfg?.apiKey && cfg?.apiSecret)
    });
  } catch (error) {
    next(error);
  }
});

// Get single config
router.get('/:key', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { key } = req.params;
    
    const isValid = await TenantConfigService.validateConfigKey(key);
    if (!isValid) {
      return res.status(400).json({ 
        error: `Invalid config key: ${key}` 
      });
    }

    // Single-key fetch:
    // - Non-secret keys -> return value
    // - Secret keys -> return decrypted payload (authorized admin only)
    const isSecret = TenantConfigService.isEncryptedKey(key as TenantConfigKey);
    const config = await TenantConfigService.getConfig(req.tenantId!, key as TenantConfigKey);
    
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    if (isSecret) {
      // Decrypted payload is returned under "secret"
      // (Value column is intentionally DbNull for secret keys.)
      return res.json({
        key,
        secret: config,
        isEncrypted: true,
        hasValue: true
      });
    } else {
      return res.json({
        key,
        value: config,
        isEncrypted: false,
        hasValue: true
      });
    }
  } catch (error) {
    next(error);
  }
});

// Create or update config
router.post('/', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { key, value } = configRequestSchema.parse(req.body);
    
    const isValid = await TenantConfigService.validateConfigKey(key);
    if (!isValid) {
      return res.status(400).json({ 
        error: `Invalid config key: ${key}` 
      });
    }

    // Validate the config data
    const validatedValue = validateConfigData(key as TenantConfigKey, value);
    
    // Check if config already exists
    const existing = await TenantConfigService.getConfig(req.tenantId!, key as TenantConfigKey, false);
    
    let result;
    if (existing && validatedValue !== undefined) {
      result = await TenantConfigService.updateConfig(req.tenantId!, key as TenantConfigKey, validatedValue);
    } else if (validatedValue !== undefined) {
      result = await TenantConfigService.createConfig(req.tenantId!, key as TenantConfigKey, validatedValue);
    } else {
      return res.status(400).json({ error: 'Invalid configuration value' });
    }

    // Return response without sensitive data
    const response: any = {
      id: result.id,
      key: result.key,
      hasValue: true,
      isEncrypted: TenantConfigService.isEncryptedKey(key as TenantConfigKey),
      updatedAt: result.updatedAt
    };

    // Include non-sensitive values in response
    if (!TenantConfigService.isEncryptedKey(key as TenantConfigKey)) {
      response.value = validatedValue;
    }

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid configuration value', issues: error.issues });
    }
    next(error);
  }
});

// Update multiple branding configs at once
router.put('/branding', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const brandingData = brandingConfigSchema.parse(req.body);
    
    const results: any[] = [];
    
    for (const [key, value] of Object.entries(brandingData)) {
      if (value !== undefined) {
        try {
          const existing = await TenantConfigService.getConfig(req.tenantId!, key as BrandingKey, false);
          
          let result;
          if (existing) {
            result = await TenantConfigService.updateConfig(req.tenantId!, key as BrandingKey, value as any);
          } else {
            result = await TenantConfigService.createConfig(req.tenantId!, key as BrandingKey, value as any);
          }
          
          results.push({
            key,
            hasValue: true,
            isEncrypted: false,
            updatedAt: result.updatedAt
          });
        } catch (error) {
          logger.error('Failed to update branding config', { tenantId: req.tenantId, key, error });
          results.push({
            key,
            error: 'Failed to update'
          });
        }
      }
    }

    res.json({ 
      message: 'Branding configuration updated',
      results
    });
  } catch (error) {
    next(error);
  }
});

// Delete config
router.delete('/:key', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { key } = req.params;
    
    const isValid = await TenantConfigService.validateConfigKey(key);
    if (!isValid) {
      return res.status(400).json({ 
        error: `Invalid config key: ${key}` 
      });
    }

    const deleted = await TenantConfigService.deleteConfig(req.tenantId!, key as TenantConfigKey);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Test template rendering with tenant config
router.get('/test-template/:templateName', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const { templateName } = req.params;
    const { testData } = req.query;
    
    const context: any = {
      tenantId: req.tenantId!,
      customerName: 'Test Customer',
      bookingCode: 'TEST123',
      productTitle: 'Test Product',
      ...(testData ? JSON.parse(testData as string) : {})
    };

    const rendered = await TemplateLoader.renderTemplate(templateName, context);
    
    if (!rendered) {
      return res.status(404).json({ error: 'Template not found or failed to render' });
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(rendered);
  } catch (error) {
    next(error);
  }
});

export default router;