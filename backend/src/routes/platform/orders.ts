import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest, requireMfaEnabled } from '../../middleware/platformAuth';
import { platformSensitiveLimiter } from '../../middleware/platformRateLimit';
import { OrderService } from '../../services/orderService';
import { idempotency } from '../../middleware/idempotency';

const router = express.Router();

const orderFiltersSchema = z.object({
  tenantId: z.string().optional(),
  type: z.enum(['invoice', 'refund', 'adjustment']).optional(),
  gateway: z.enum(['razorpay', 'paypal', 'manual']).optional(),
  status: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().transform(str => new Date(str)).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const refundOrderSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1),
});

const createAdjustmentSchema = z.object({
  tenantId: z.string(),
  amount: z.number(),
  currency: z.string().optional().default('USD'),
  reason: z.string().min(1),
  metadata: z.object({}).optional(),
});

// Get all orders
router.get('/', 
  requirePlatformPermissions('orders.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = orderFiltersSchema.parse(req.query);
      const orders = await OrderService.findOrders(filters);
      
      res.json({
        orders,
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

// Get single order
router.get('/:id', 
  requirePlatformPermissions('orders.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const order = await OrderService.getOrderById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      next(error);
    }
  }
);

// Process refund
router.post('/:id/refund',
  requireMfaEnabled,
  platformSensitiveLimiter,
  idempotency,
  requirePlatformPermissions('orders.refund'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const parsed = refundOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      const { amount, reason } = parsed.data;
      
      const refundOrder = await OrderService.processRefund(
        req.params.id,
        amount,
        reason,
        req.platformUser!.id
      );
      
      res.json(refundOrder);
    } catch (error: any) {
      if (error?.message === 'Order not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error?.message === 'Order already refunded') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
);

// Create adjustment
router.post('/adjustment',
  requireMfaEnabled,
  platformSensitiveLimiter,
  idempotency,
  requirePlatformPermissions('orders.adjust'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const parsed = createAdjustmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      const data = parsed.data;
      
      const adjustment = await OrderService.createOrder({
        tenantId: data.tenantId,
        type: 'adjustment',
        gateway: 'manual', // manual adjustment
        status: 'completed',
        total: data.amount,
        currency: data.currency,
        metadata: {
          reason: data.reason,
          ...data.metadata
        }
      }, req.platformUser!.id);
      
      res.status(201).json(adjustment);
    } catch (error) {
      next(error);
    }
  }
);

export default router;