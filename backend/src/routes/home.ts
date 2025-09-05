import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const homeSchema = z.object({
  imageUrl: z.string().min(1),
});

// Get all home slides
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const home = await GenericService.findManyHome();
    res.json({
      images: home.map((h:any) => ({ url: h.imageUrl }))
    });
  } catch (error) {
    next(error);
  }
});

// Add a home slide (Admin and Editor)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { imageUrl } = homeSchema.parse(req.body);
      const home = await GenericService.createHome({ imageUrl });
      res.status(201).json(home);
    } catch (error) {
      next(error);
    }
  }
);

// Remove a home slide (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: TenantRequest, res, next) => {
    try {
      await GenericService.deleteHome(req.params.id);
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
      await GenericService.deleteManyHome();
      if (Array.isArray(images) && images.length > 0) {
        await GenericService.createManyHome(
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