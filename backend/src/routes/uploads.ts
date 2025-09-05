import express from 'express';
import type { Express, Response, NextFunction } from 'express';
import { uploadWithRules, UploadService, requireCloudinaryConfigured } from '../services/uploadService';
import { authenticate, authorize } from '../middleware/auth';
import { GenericService } from '../services/genericService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

async function ensureCloudinary(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    await requireCloudinaryConfigured(req.tenantId);
    next();
  } catch (err: any) {
    if (err?.code === 'CLOUDINARY_CONFIG_MISSING') {
      return res.status(412).json({
        code: 'CLOUDINARY_CONFIG_MISSING',
        message: 'Set Cloudinary in Settings → Integrations',
      });
    }
    next(err);
  }
}

// Upload product images
router.post(
  '/products',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('products'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'products',
          'products'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload gallery images
router.post(
  '/gallery',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('destinations', 'images', 20),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'gallery',
          'destinations'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/home',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('home-slide'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'home',
          'home-slide'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/logo',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('logos'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'logo',
          'logos'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload destination images
router.post(
  '/destinations',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('destination-banner'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'destinations',
          'destination-banner'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload experiences images
router.post(
  '/experiences',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('experience-category-banner'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'experiences',
          'experience-category-banner'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/itinerary',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('destination-banner'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'itinerary',
          'destination-banner'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/team',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('team'),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const saved = await UploadService.uploadSingleImage(
          file,
          'team',
          'team'
        );
        uploadResults.push({
          publicId: saved.publicId,
          url: saved.url,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/partners',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('partners'),
  async (req: TenantRequest, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const uploaded = await UploadService.uploadSingleImage(
          file,
          'partners',
          'partners'
        );
        const saved = await GenericService.createPartners({
          imageUrl: uploaded.url,
        });
        uploadResults.push({
          id: saved.id,
          publicId: uploaded.publicId,
          url: saved.imageUrl,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/slides',
  authenticate,
  authorize(['ADMIN', 'EDITOR']),
  ensureCloudinary,
  uploadWithRules('slides'),
  async (req: TenantRequest, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const files = req.files as Express.Multer.File[];
      const uploadResults = [] as any[];

      for (const file of files) {
        const uploaded = await UploadService.uploadSingleImage(
          file,
          'slides',
          'slides'
        );
        const saved = await GenericService.createSlides({
          imageUrl: uploaded.url,
        });
        uploadResults.push({
          id: saved.id,
          publicId: uploaded.publicId,
          url: saved.imageUrl,
          originalName: file.originalname,
        });
      }

      res.json({
        success: true,
        images: uploadResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete image
router.delete('/:publicId(.*)', authenticate, authorize(['ADMIN', 'EDITOR']), ensureCloudinary, async (req: TenantRequest, res, next) => {
  try {
    const { publicId } = req.params;
    const result = await UploadService.deleteImage(publicId);

    if (result.result === 'ok') {
      if (publicId.startsWith('website/partners/')) {
        await GenericService.deleteManyPartners({
          where: { imageUrl: { contains: publicId } }
        });
      } else if (publicId.startsWith('website/slides/')) {
        await GenericService.deleteManySlides({
          where: { imageUrl: { contains: publicId } }
        });
      }
    }
    
    res.json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

// Search images
router.get('/search', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), ensureCloudinary, async (req, res, next) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const limit = parseInt(req.query.limit as string) || 25;
    const nextCursor = req.query.next_cursor as string;

    const result = await UploadService.searchImages(query, {
      limit,
      nextCursor
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get all images
router.get('/:folder?', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), ensureCloudinary, async (req, res, next) => {
  try {
    const folder = req.params.folder || '';
    const limit = parseInt(req.query.limit as string) || 25;
    const nextCursor = req.query.next_cursor as string;
    const prefix = req.query.prefix as string;

    const result = await UploadService.getImages(folder, {
      limit,
      nextCursor,
      prefix
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;