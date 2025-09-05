import express from 'express';
import { z } from 'zod';
import { NewsletterService } from '../services/newsletterService';
import { authenticate, authorize } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();


const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

// Subscribe to newsletter (public)
router.post('/subscribe', async (req: TenantRequest, res, next) => {
  try {
    const { email, name } = subscribeSchema.parse(req.body);
    
    const subscriber = await NewsletterService.upsertNewsletter(
      { tenantId_email: { tenantId: req.tenantId!, email } },
      { email, name, isActive: true },
      { name, isActive: true }
    );

    res.status(201).json({ message: 'Successfully subscribed to newsletter' });
  } catch (error) {
    next(error);
  }
});

// Unsubscribe from newsletter (public)
router.post('/unsubscribe', async (req: TenantRequest, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    
    await NewsletterService.updateManyNewsletters(
      { email },
      { isActive: false }
    );

    res.json({ message: 'Successfully unsubscribed from newsletter' });
  } catch (error) {
    next(error);
  }
});

// Get all subscribers (Admin only)
router.get('/subscribers', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const subscribers = await NewsletterService.findManyNewsletters({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(subscribers);
  } catch (error) {
    next(error);
  }
});

// Export subscribers (Admin only)
router.get('/subscribers/export', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const subscribers = await NewsletterService.findManyNewsletters({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    const csvData = subscribers.map(sub => ({
      Email: sub.email,
      Name: sub.name || '',
      'Subscribed At': sub.createdAt.toISOString()
    }));

    res.json(csvData);
  } catch (error) {
    next(error);
  }
});

export default router;