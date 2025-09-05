import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { WebhookMonitorService } from '../../services/webhookMonitorService';

const router = express.Router();

const webhookFiltersSchema = z.object({
  provider: z.enum(['razorpay', 'paypal']).optional(),
  status: z.enum(['received', 'processed', 'skipped', 'failed']).optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().transform(str => new Date(str)).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const endpointListSchema = z.object({
  provider: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

// List webhook endpoints
router.get('/',
  requirePlatformPermissions('webhooks.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = endpointListSchema.parse(req.query);
      const endpoints = await WebhookMonitorService.listEndpoints(filters);
      res.json({ endpoints });
    } catch (error) {
      next(error);
    }
  }
);

// Get webhook deliveries
router.get('/deliveries', 
  requirePlatformPermissions('webhooks.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = webhookFiltersSchema.parse(req.query);
      const deliveries = await WebhookMonitorService.findDeliveries(filters);
      
      res.json({
        deliveries,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single webhook delivery
router.get('/deliveries/:id', 
  requirePlatformPermissions('webhooks.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const delivery = await WebhookMonitorService.findDeliveryById(req.params.id);
      
      if (!delivery) {
        return res.status(404).json({ error: 'Webhook delivery not found' });
      }

      res.json(delivery);
    } catch (error) {
      next(error);
    }
  }
);

// Replay webhook
router.post('/deliveries/:id/replay',
  requireMfaEnabled,
  platformSensitiveLimiter,
  requirePlatformPermissions('webhooks.replay'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const result = await WebhookMonitorService.replayWebhook(
        req.params.id,
        req.platformUser!.id
      );
      
      return res.json(result);
    } catch (error) {
      const msg = (error as Error)?.message || '';
      if (msg === 'Webhook delivery not found') {
        return res.status(404).json({ error: 'Webhook delivery not found' });
      }
      if (msg === 'Webhook already processed successfully') {
        // Defensive: if service still throws this in any edge case, return 200 no-op
        return res.status(200).json({ success: true });
      }
      return next(error);
    }
  }
);

// Get webhook statistics
router.get('/stats', 
  requirePlatformPermissions('webhooks.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { timeframe = 'day' } = z.object({
        timeframe: z.enum(['hour', 'day', 'week']).optional()
      }).parse(req.query);

      const stats = await WebhookMonitorService.getWebhookStats(timeframe);
      
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;