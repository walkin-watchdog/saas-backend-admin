import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { DomainService } from '../services/domainService';

const router = express.Router();

const logoSchema = z.object({
  imageUrl: z.string().min(1),
});

// Get all logo slides
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const logo = await GenericService.findManyLogo();
    res.json({
      images: logo.map((h:any) => ({ url: h.imageUrl }))
    });
  } catch (error) {
    next(error);
  }
});

// Add a logo slide (Admin and Editor)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { imageUrl } = logoSchema.parse(req.body);
      const logo = await GenericService.createLogo({ imageUrl });
      res.status(201).json(logo);
    } catch (error) {
      next(error);
    }
  }
);

// Remove a logo slide (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: TenantRequest, res, next) => {
    try {
      await GenericService.deleteLogo(req.params.id);
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
      await GenericService.deleteManyLogo();
      if (Array.isArray(images) && images.length > 0) {
        await GenericService.createManyLogo(
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