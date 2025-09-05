import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const partnerSchema = z.object({
  imageUrl: z.string().min(1),
});

// Get all partners
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const partners = await GenericService.findManyPartners();
    res.json({
      images: partners.map(p => ({ url: p.imageUrl }))
    });
  } catch (error) {
    next(error);
  }
});

// Add a partner logo (Admin and Editor)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { imageUrl } = partnerSchema.parse(req.body);
      const partner = await GenericService.createPartners({ imageUrl });
      res.status(201).json(partner);
    } catch (error) {
      next(error);
    }
  }
);

// Remove a partner logo (Admin only)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: TenantRequest, res, next) => {
    try {
      await GenericService.deletePartners(req.params.id);
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
      // 1) clear out whatever was there
      await GenericService.deleteManyPartners();
      // 2) re-create one record per URL (each URL already includes your Cloudinary crop params)
      if (Array.isArray(images) && images.length > 0) {
        await GenericService.createManyPartners(
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