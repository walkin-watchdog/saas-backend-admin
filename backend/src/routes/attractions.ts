import express from 'express';
import { z } from 'zod';
import { AttractionService } from '../services/attractionService';
import { authenticate, authorize } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const attractionSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  placeId: z.string().nullable().optional(),
  tagline: z.string().min(1),
  description: z.string().min(1),
  image: z.string().min(1),
  bannerImage: z.string().min(1),
  duration: z.number().nullable().optional(),
  durationUnit: z.enum(['minutes', 'hours']).optional().default('minutes'),
  destinationId: z.string().cuid(),
});

// Get all attractions (public)
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const attractions = await AttractionService.findManyAttractions({
      include: {
        destination: true,
        _count: {
          select: { itineraries: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(attractions);
  } catch (error) {
    next(error);
  }
});

// Get single attraction by slug (public)
router.get('/:slug', async (req: TenantRequest, res, next) => {
  try {
    const attraction = await AttractionService.findAttraction(
      { slug: req.params.slug },
      {
        include: {
          destination: true,
          _count: {
            select: { itineraries: true }
          }
        }
      }
    );

    if (!attraction) {
      return res.status(404).json({ error: 'attraction not found' });
    }

    res.json(attraction);
  } catch (error) {
    next(error);
  }
});

// Create attraction (Admin/Editor only)
router.post('/', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = attractionSchema.parse(req.body);
    
    const slug = data.name.toLowerCase().replace(/\s+/g, '-')
                     .replace(/[^a-z0-9-]/g, '');

    const { destinationId, ...rest } = data;
    const attraction = await AttractionService.createAttraction({
      ...rest,
      slug,
      destination: { connect: { id: destinationId } },
      tenantId: req.tenantId!
    });

    res.status(201).json(attraction);
  } catch (error) {
    next(error);
  }
});

// Update attraction (Admin/Editor only)
router.put('/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const data = attractionSchema.parse(req.body);
    
    const slug = data.name.toLowerCase().replace(/\s+/g, '-')
                     .replace(/[^a-z0-9-]/g, '');
    
    const { destinationId, ...rest } = data;
    const attraction = await AttractionService.updateAttraction(req.params.id, {
      ...rest,
      slug,
      destination: { connect: { id: destinationId } }
    });

    res.json(attraction);
  } catch (error) {
    next(error);
  }
});

// Delete attraction (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    // Check if the attraction has any products
    const attraction = await AttractionService.findAttraction(req.params.id, {
      include: {
        destination: true,
        _count: {
          select: { itineraries: true }
        }
      }
    });

    if (!attraction) {
      return res.status(404).json({ error: 'attraction not found' });
    }

    if (attraction._count && attraction._count.itineraries > 0) {
      return res.status(400).json({
        error: 'Cannot delete an attraction that is in use by one or more itineraries.'
      });
    }

    await AttractionService.deleteAttraction(req.params.id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;