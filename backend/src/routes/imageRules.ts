import express from 'express';
import ConfigService from '../services/configService';
import { z } from 'zod';
import type { ImageType } from '../types/tenantConfig';
import { authenticate, requirePlatformAdmin, AuthRequest } from '../middleware/auth';
import type { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

router.get(
  '/:tenantId/:imageType',
  authenticate,
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const { tenantId, imageType } = req.params;
      if (tenantId !== req.tenantId) {
        return res.status(403).json({ error: 'Cross-tenant access forbidden.' });
      }
      const rule = await ConfigService.getTenantImageRule(
        tenantId,
        imageType as ImageType
      );
      const etag = ConfigService.generateEtag(rule);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'max-age=300');
      res.json(rule);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:tenantId',
  authenticate,
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const { tenantId } = req.params;
      if (tenantId !== req.tenantId) {
        return res.status(403).json({ error: 'Cross-tenant access forbidden.' });
      }
      const cfg = await ConfigService.getTenantImageConfig(tenantId);
      const etag = ConfigService.generateEtag(cfg);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'max-age=300');
      res.json(cfg);
    } catch (err) {
      next(err);
    }
  }
);

const ruleSchema = z.object({
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

router.put(
  '/:tenantId/:imageType',
  authenticate,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      const { tenantId, imageType } = req.params;
      const rule = ruleSchema.parse(req.body);
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

export default router;