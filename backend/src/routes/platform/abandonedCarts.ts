import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { PlatformAbandonedCartService } from '../../services/platformAbandonedCartService';

const router = express.Router();

const cartFiltersSchema = z.object({
  status: z.enum(['open', 'recovered', 'discarded']).optional(),
  email: z.string().optional(),
  planId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  seenSince: z.coerce.date().optional(),
  seenBefore: z.coerce.date().optional(),
});

const sendError = (res: express.Response, err: unknown) => {
  const e = err as any;
  const status =
    typeof e?.status === 'number'
      ? e.status
      : e?.code === 'P2025'
      ? 404
      : 500;
  return res.status(status).json({ error: (e?.message as string) || 'Internal Server Error' });
};

// Get all abandoned carts
router.get('/', 
  requirePlatformPermissions('abandoned_carts.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = cartFiltersSchema.parse(req.query);
      const carts = await PlatformAbandonedCartService.findCarts(filters);
      
      res.json({
        carts,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// Get single abandoned cart
router.get('/:id', 
  requirePlatformPermissions('abandoned_carts.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const cart = await PlatformAbandonedCartService.findCartById(req.params.id);
      
      if (!cart) {
        return res.status(404).json({ error: 'Abandoned cart not found' });
      }

      res.json(cart);
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// Send recovery link
router.post('/:id/recover', 
  requirePlatformPermissions('abandoned_carts.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const result = await PlatformAbandonedCartService.sendRecoveryLink(
        req.params.id,
        req.platformUser!.id
      );
      
      res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// Discard cart
router.post('/:id/discard', 
  requirePlatformPermissions('abandoned_carts.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const cart = await PlatformAbandonedCartService.discardCart(
        req.params.id,
        req.platformUser!.id
      );
      
      res.json(cart);
    } catch (error) {
      return sendError(res, error);
    }
  }
);

// Get cart statistics
router.get('/stats/overview', 
  requirePlatformPermissions('abandoned_carts.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const [openCarts, recoveredCarts, discardedCarts] = await Promise.all([
        PlatformAbandonedCartService.countCarts({ status: 'open' }),
        PlatformAbandonedCartService.countCarts({ status: 'recovered' }),
        PlatformAbandonedCartService.countCarts({ status: 'discarded' }),
      ]);

      const total = openCarts + recoveredCarts + discardedCarts;
      const recoveryRate = total > 0 ? (recoveredCarts / total) * 100 : 0;

      res.json({
        openCarts,
        recoveredCarts,
        discardedCarts,
        total,
        recoveryRate
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

export default router;