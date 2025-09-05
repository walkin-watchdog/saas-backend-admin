import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const slideSchema = z.object({
  imageUrl: z.string().min(1),
});

// Get all slides
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const slides = await GenericService.findManySlides();
    res.json({
      images: slides.map(s => ({ url: s.imageUrl }))
    });
  } catch (error) {
    next(error);
  }
});

// Add a slide (Admin and Editor)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { imageUrl } = slideSchema.parse(req.body);
      const slide = await GenericService.createSlides({ imageUrl });
      res.status(201).json(slide);
    } catch (error) {
      next(error);
    }
  }
);

// Remove a slide (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: TenantRequest, res, next) => {
    try {
      await GenericService.deleteSlides(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { images } = req.body as { images: string[] };
      await GenericService.deleteManySlides();
      if (Array.isArray(images) && images.length > 0) {
        await GenericService.createManySlides(
          images.map((url) => ({ imageUrl: url }))
        );
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  }
);

export default router;