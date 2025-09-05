import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { AbandonedCartService } from '../services/abandonedCartService';
import { BookingService } from '../services/bookingService';
import { authenticate, authorize } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { keyByTenantRouteIp } from '../middleware/rateLimit';

const router = express.Router();

const abandonedCartSchema = z.object({
  email: z.string().email(),
  productId: z.string(),
  packageId: z.string().optional(),
  slotId: z.string().optional(),
  currency: z.string(),
  customerData: z.object({
    customerName: z.string(),
    customerEmail: z.string().email(),
    customerPhone: z.string(),
    adults: z.number(),
    children: z.number(),
    selectedDate: z.string(),
    selectedTimeSlot: z.string(),
    totalAmount: z.number()
  })
});

const TOKEN_TTL_HOURS = 24;
function newRecoverToken() {
  return crypto.randomUUID();
}

// Create abandoned cart entry
router.post('/', async (req: TenantRequest, res, next) => {
  try {
    const data = abandonedCartSchema.parse(req.body);
    
    // Check if cart already exists for this email and product
    const existingCart = await AbandonedCartService.findFirstAbandonedCart({
      where: {
        email: data.email,
        productId: data.productId,
        packageId: data.packageId || null,
        slotId: data.slotId || null,
        currency: data.currency
      }
    });

    if (existingCart) {
      // Update existing cart
      const updatedCart = await AbandonedCartService.updateAbandonedCart(existingCart.id, {
          customerData: data.customerData,
          updatedAt: new Date(),
          remindersSent: 0,
          recoverToken: existingCart.recoverToken ?? newRecoverToken(),
          tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000),
          currency: data.currency
      });
      return res.json({ ...updatedCart, status: 'open' });
    }

    // Create new abandoned cart
    const abandonedCart = await AbandonedCartService.createAbandonedCart({
      email: data.email,
      productId: data.productId,
      packageId: data.packageId,
      slotId: data.slotId,
      customerData: data.customerData,
      recoverToken: newRecoverToken(),
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000),
      currency: data.currency
    });
    return res.status(201).json({ ...abandonedCart, status: 'open' });
  } catch (error) {
    next(error);
  }
});

// Get all abandoned carts (Admin only)
router.get('/', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const { page = 1, limit = 20, email, productId } = req.query;
    
    const where: any = {};
    if (email) where.email = { contains: email as string, mode: 'insensitive' };
    if (productId) where.productId = productId;

    const [carts, total] = await Promise.all([
      AbandonedCartService.findManyAbandonedCarts({
        where,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              images: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string)
      }),
      AbandonedCartService.countAbandonedCarts(where)
    ]);

    res.json({
      carts,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/status', async (req: TenantRequest, res, next) => {
  try {
    const { email, productId } = req.query;
    if (!email || !productId)
      return res.status(400).json({ error: 'email and productId required' });

    const cart = await AbandonedCartService.findFirstAbandonedCart({
      where: { email: String(email), productId: String(productId) },
      orderBy: { updatedAt: 'desc' },
    });

    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    res.json({ ...cart, status: 'open' });
  } catch (error) {
    next(error);
  }
});

// Send manual reminder
router.post('/:id/reminder', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const cart = await AbandonedCartService.findAbandonedCart(req.params.id, {
      include: {
        product: true
      }
    });

    if (!cart) {
      return res.status(404).json({ error: 'Abandoned cart not found' });
    }

    await EmailService.sendAbandonedCartReminder(cart, cart.product);

    await AbandonedCartService.updateAbandonedCart(cart.id, {
        remindersSent: cart.remindersSent + 1,
        updatedAt: new Date()
    });

    res.json({ message: 'Reminder sent successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete abandoned cart
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await AbandonedCartService.deleteAbandonedCart(req.params.id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Convert abandoned cart to booking
router.post('/:id/convert', async (req: TenantRequest, res, next) => {
  try {
    const cart = await AbandonedCartService.findAbandonedCart(req.params.id);

    if (!cart) {
      return res.status(404).json({ error: 'Abandoned cart not found' });
    }

    const bookingCode = `LT${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const customerData = cart.customerData as any;

    const booking = await BookingService.createBooking({
      bookingCode,
      productId: cart.productId,
      packageId: cart.packageId,
      currency: cart.currency,
      customerName: customerData.customerName,
      customerEmail: customerData.customerEmail,
      customerPhone: customerData.customerPhone,
      adults: customerData.adults,
      children: customerData.children,
      totalAmount: customerData.totalAmount,
      bookingDate: new Date(customerData.selectedDate),
      selectedTimeSlot: customerData.selectedTimeSlot
    });

    // Delete the abandoned cart
    await AbandonedCartService.deleteAbandonedCart(cart.id);

    res.json(booking);
  } catch (error) {
    next(error);
  }
});

const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});

router.get('/recover/:token', recoverLimiter, async (req: TenantRequest, res, next) => {
  try {
    const { token } = req.params;

    const cart = await AbandonedCartService.findFirstAbandonedCart({
      where: {
        recoverToken : token,
        tokenExpiresAt: { gte: new Date() }
      }
    });

    if (!cart) return res.status(404).json({ error: 'Invalid or expired token' });

    const safe = {
      productId       : cart.productId,
      packageId       : cart.packageId,
      slotId          : cart.slotId,
      currency        : cart.currency,
      ...(cart.customerData as Record<string, unknown>),
      updatedAt       : cart.updatedAt
    };
    res.json(safe);
  } catch (error) {
    next(error);
  }
});

export default router;