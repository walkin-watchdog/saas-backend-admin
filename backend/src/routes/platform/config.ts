import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { PlatformConfigService } from '../../services/platformConfigService';
import ConfigService from '../../services/configService';
import type { ImageType } from '../../types/tenantConfig';

const router = express.Router();

const configSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  encrypt: z.boolean().optional(),
});

const maintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
  scheduledStart: z.string().transform(str => new Date(str)).optional(),
  scheduledEnd: z.string().transform(str => new Date(str)).optional(),
});

// Get all configurations
router.get('/', 
  requirePlatformPermissions('config.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const configs = await PlatformConfigService.listConfigs('platform');
      
      res.json({ configs });
    } catch (error) {
      next(error);
    }
  }
);

// Get single configuration
router.get('/:key',
  requirePlatformPermissions('config.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const config = await PlatformConfigService.getConfigEntry(req.params.key, 'platform');

      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      if (config.secretData) {
        return res.json({ key: req.params.key, value: '********', hasValue: true });
      }

      if (config.data === null) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      res.json({ key: req.params.key, value: config.data, hasValue: true });
    } catch (error) {
      next(error);
    }
  }
);

// Set configuration
router.post('/',
  requirePlatformPermissions('config.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { key, value, encrypt } = configSchema.parse(req.body);

      await PlatformConfigService.setConfig(key, value, req.platformUser!.id, { scope: 'platform', encrypt });
      
      res.json({
        key,
        hasValue: true,
        message: 'Configuration updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete configuration
router.delete('/:key', 
  requirePlatformPermissions('config.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const deleted = await PlatformConfigService.deleteConfig(
        req.params.key,
        req.platformUser!.id,
        'platform'
      );
      
      if (!deleted) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      res.json({ message: 'Configuration deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Get maintenance mode status
router.get('/maintenance/status', async (req, res, next) => {
  try {
    const maintenanceMode = await PlatformConfigService.getMaintenanceMode();
    res.json(maintenanceMode);
  } catch (error) {
    next(error);
  }
});

// Set maintenance mode
router.post('/maintenance',
  requirePlatformPermissions('config.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = maintenanceModeSchema.parse(req.body);
      
      const config = await PlatformConfigService.setMaintenanceMode(
        data.enabled,
        {
          message: data.message,
          scheduledStart: data.scheduledStart,
          scheduledEnd: data.scheduledEnd
        },
        req.platformUser!.id
      );
      
      res.json(config);
    } catch (error) {
      next(error);
    }
  }
);

const imageRuleSchema = z.object({
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  fit: z.enum(['cover', 'contain']).optional(),
  format: z.enum(['webp', 'jpg', 'png']).optional(),
  quality: z.union([z.literal('auto'), z.number().int().min(1).max(100)]).optional(),
  minSource: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .nullable()
    .optional(),
  thumbnails: z.array(z.number().int().positive()).optional(),
  allowedTypes: z.array(z.string()).optional(),
  maxUploadBytes: z.number().int().positive().optional(),
});

router.get('/image-rules/:tenantId',
  requirePlatformPermissions('tenants.manage'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { tenantId } = req.params;
      const cfg = await ConfigService.getTenantImageConfig(tenantId);
      res.json({ rules: cfg.rules || {} });
    } catch (err) {
      next(err);
    }
  }
);

router.put('/image-rules/:tenantId/:imageType',
  requirePlatformPermissions('tenants.manage'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { tenantId, imageType } = req.params;
      const rule = imageRuleSchema.parse(req.body);
      const cfg = await ConfigService.setTenantImageRule(
        tenantId,
        imageType as ImageType,
        { ...rule, imageType: imageType as ImageType }
      );
      res.json(cfg.rules[imageType as ImageType]);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/image-rules/:tenantId/:imageType',
  requirePlatformPermissions('tenants.manage'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { tenantId, imageType } = req.params;
      const rule = imageRuleSchema.parse(req.body);
      const cfg = await ConfigService.setTenantImageRule(
        tenantId,
        imageType as ImageType,
        { ...rule, imageType: imageType as ImageType }
      );
      res.json(cfg.rules[imageType as ImageType]);
    } catch (err) {
      next(err);
    }
  }
);

// Get signup configuration
router.get('/signup/settings', 
  requirePlatformPermissions('config.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const signupConfig = await PlatformConfigService.getConfig('signup_settings', 'platform') || {
        mode: 'open', // 'open' | 'invite_only'
        allowedDomains: [],
        requireEmailVerification: true,
        trialEnabled: true,
        trialDurationDays: 7
      };
      
      res.json(signupConfig);
    } catch (error) {
      next(error);
    }
  }
);

// Update signup configuration
router.put('/signup/settings', 
  requirePlatformPermissions('config.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const signupConfigSchema = z.object({
        mode: z.enum(['open', 'invite_only']),
        allowedDomains: z.array(z.string()).optional(),
        requireEmailVerification: z.boolean().optional(),
        trialEnabled: z.boolean().optional(),
        trialDurationDays: z.number().min(1).max(365).optional()
      });

      const config = signupConfigSchema.parse(req.body);
      
      await PlatformConfigService.setConfig('signup_settings', config, req.platformUser!.id, { scope: 'platform' });
      
      res.json({
        message: 'Signup configuration updated successfully',
        config
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;