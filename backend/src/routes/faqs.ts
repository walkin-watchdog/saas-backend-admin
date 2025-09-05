import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const faqSchema = z.object({
  category: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1)
});

// Get all FAQs
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const faqs = await GenericService.findManyFAQs({
      orderBy: [
        { category: 'asc' },
        { createdAt: 'desc' }
      ]
    });
    res.json(faqs);
  } catch (error) {
    next(error);
  }
});

// Get FAQ by ID
router.get('/:id', async (req: TenantRequest, res, next) => {
  try {
    const faq = await GenericService.findFAQ(req.params.id);
    
    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }
    
    res.json(faq);
  } catch (error) {
    next(error);
  }
});

// Create FAQ (Admin only)
router.post('/', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = faqSchema.parse(req.body);
    
    const faq = await GenericService.createFAQ(data);
    
    res.status(201).json(faq);
  } catch (error) {
    next(error);
  }
});

// Update FAQ (Admin only)
router.put('/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = faqSchema.parse(req.body);
    
    const faq = await GenericService.updateFAQ(req.params.id, data);
    
    res.json(faq);
  } catch (error) {
    next(error);
  }
});

// Delete FAQ (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await GenericService.deleteFAQ(req.params.id);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;