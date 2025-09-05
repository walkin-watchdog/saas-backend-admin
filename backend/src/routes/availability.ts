import express from 'express';
import { z } from 'zod';
import { ProductService } from '../services/productService';
import { BookingService } from '../services/bookingService';
import { AvailabilityService } from '../services/availabilityService';
import { computeStatus } from '../utils/availability';
import { authenticate, authorize } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const subrangeSchema = z.object({
  productId: z.string(),
  startDate: z.string().transform(s => new Date(s)),
  endDate:   z.string().transform(s => new Date(s)),
  status:    z.enum(['SOLD_OUT','NOT_OPERATING'])
});

// Prevent overlapping sub‐ranges
async function assertNoOverlap(productId: string, id: string|undefined, start: Date, end: Date) {
  const conflict = await AvailabilityService.findFirstSubrange({
    where: {
      productId,
      NOT: id ? { id } : {},
      OR: [{ startDate: { lte: end }, endDate: { gte: start } }]
    }
  });
  if (conflict) throw new Error('Sub-range overlaps existing range');
}

// List all temp SoldOut/NotOperating ranges
router.get('/product/:productId/subranges', async (req: TenantRequest, res, next) => {
  try {
    const list = await AvailabilityService.findManySubranges({
      where: { productId: req.params.productId },
      orderBy: { startDate: 'asc' }
    });
    res.json(list);
  } catch (err) { next(err); }
});

// Create a new SoldOut/NotOperating range
router.post('/subrange',
  authenticate, authorize(['ADMIN','EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { productId, startDate, endDate, status } = subrangeSchema.parse(req.body);
      // Base window is non-nullable now
      const prod = await ProductService.findProduct({ id: productId }, {
        select: { availabilityStartDate: true, availabilityEndDate: true }
      });
      if (!prod) throw new Error('Product not found');
      
      if (prod.availabilityStartDate && (startDate < prod.availabilityStartDate
       || (prod.availabilityEndDate && endDate > prod.availabilityEndDate))) {
        return res.status(400).json({ error: 'Subrange must lie within base availability window' });
      }
      await assertNoOverlap(productId, undefined, startDate, endDate);
      const created = await AvailabilityService.createSubrange({ productId, startDate, endDate, status });
      res.status(201).json(created);
    } catch (err) { next(err); }
});

// Edit an existing sub‐range
router.put('/subrange/:id',
  authenticate, authorize(['ADMIN','EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const data = subrangeSchema.partial().parse(req.body);
      const existing = await AvailabilityService.findSubrange(req.params.id);
      if (!existing) throw new Error('Subrange not found');
      
      const start = data.startDate ?? existing.startDate;
      const end   = data.endDate   ?? existing.endDate;
      const prod = await ProductService.findProduct({ id: existing.productId }, {
        select: { availabilityStartDate: true, availabilityEndDate: true }
      });
      if (!prod) throw new Error('Product not found');
      
      if (prod.availabilityStartDate && (start < prod.availabilityStartDate
       || (prod.availabilityEndDate && end > prod.availabilityEndDate))) {
        return res.status(400).json({ error: 'Subrange out of base availability window' });
      }
      await assertNoOverlap(existing.productId, existing.id, start, end);
      const updated = await AvailabilityService.updateSubrange(existing.id, { ...data, startDate: start, endDate: end });
      res.json(updated);
    } catch (err) { next(err); }
});

// Delete sub-range
router.delete('/subrange/:id',
  authenticate, authorize(['ADMIN','EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      await AvailabilityService.deleteSubrange(req.params.id);
      res.json({ message: 'Sub-range deleted' });
    } catch (err) { next(err); }
});

// Set or clear a permanent Sold Out/Not Operating override
const overrideSchema = z.object({
  status: z.enum(['SOLD_OUT','NOT_OPERATING','AVAILABLE'])
});
router.put('/product/:productId/override',
  authenticate, authorize(['ADMIN','EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const { status } = overrideSchema.parse(req.body);
      const perm = status === 'AVAILABLE' ? null : status;
      const prod = await ProductService.updateProduct(req.params.productId, { permanentAvailabilityStatus: perm });
      res.json(prod);
    } catch (err) { next(err); }
});

// Get availability for a product
router.get('/product/:productId', async (req: TenantRequest, res, next) => {
  try {
    const id = req.params.productId;
    const prod = await ProductService.findProduct({ id }, {
      include: {
        availabilitySubranges: {
          orderBy: { startDate: 'asc' }
        },
        blockedDates: true,
      }
    }) as any;
    if (!prod) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const availability = prod.availabilitySubranges.map((r: any) => ({
      startDate:   r.startDate,
      endDate:     r.endDate,
      status:      r.status,
      booked:      0,
      product: {
        id: prod.id,
        title: prod.title,
        productCode: prod.productCode,
        accessibilityFeatures: prod.accessibilityFeatures
      },
      package: null
    }));

    const { status, nextAvailableDate } = computeStatus(prod);
    const summary = {
      total:              availability.length,
      soldOut:            availability.filter((a: any) => a.status === 'SOLD_OUT').length,
      notOperating:       availability.filter((a: any) => a.status === 'NOT_OPERATING').length,
      nextAvailable:      nextAvailableDate,
      totalSeatsBooked:   0
    };

    res.json({
      availability,
      blockedDates: prod.blockedDates.filter((b: any) => !b.isActive),
      summary
    });
  } catch (error) {
    next(error);
  }
});

// Get package slots for a specific date
router.get('/package/:packageId/slots', async (req: TenantRequest, res, next) => {
  try {
    const { packageId } = req.params;
    const { date } = z.object({ date: z.string() }).parse(req.query);

    const targetDate = new Date(date);
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate); 
    dayEnd.setHours(23, 59, 59, 999);
    
    const slots = await AvailabilityService.findManyPackageSlots({
      where: {
        packageId,
      },
      include: {
        adultTiers: {
          where: { isActive: true },
          orderBy: { min: 'asc' }
        },
        childTiers: {
          where: { isActive: true },
          orderBy: { min: 'asc' }
        },
        package: {
          include: {
            product: {
              select: {
                cutoffTime: true
              }
            }
          }
        }
      },
      orderBy: { Time: 'asc' }
    });
    
    // Get booking counts separately for each slot
    const slotsWithBookings = await Promise.all(slots.map(async (slot) => {
      const bookings = await BookingService.findManyBookings({
        where: {
          slotId: slot.id,
          bookingDate: {
            gte: dayStart,
            lte: dayEnd
          },
          status: { in: ['CONFIRMED', 'PENDING'] }
        },
        select: {
          adults: true,
          children: true,
          status: true
        }
      });
      
      return { ...slot, bookings };
    }));
    
    // Get booking count for each slot
    const slotsWithBookingInfo = slotsWithBookings.map(slot => {
      const totalBooked = slot.bookings.reduce((sum, booking) =>
        sum + booking.adults + booking.children, 0
      );
      
      // Type assertion needed due to complex nested includes
      const slotWithPackage = slot as typeof slot & {
        package?: {
          product?: {
            cutoffTime?: number;
          };
        };
      };
      
      return {
        ...slot,
        booked: totalBooked,
        bookings: undefined,
        cutoffTime: slotWithPackage.package?.product?.cutoffTime || 24
      };
    });

    res.json({ 
      date, 
      packageId,
      slots: slotsWithBookingInfo
    });
  } catch (error) {
    next(error);
  }
});

// Get blocked dates for a product
router.get('/blocked/:productId', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate, isActive } = req.query;
    
    const where: any = {
      productId
    };

    // Filter by active status if provided
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const blockedDates = await AvailabilityService.findManyBlockedDates({
      where,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            productCode: true
          }
        }
      },
      orderBy: { date: 'asc' }
    });

    res.json({
      productId,
      blockedDates,
      count: blockedDates.length
    });
  } catch (error) {
    next(error);
  }
});

// Get all blocked dates (Admin/Editor only)
router.get('/blocked', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const { productId, startDate, endDate, isActive } = req.query;
    
    const where: any = {};

    if (productId) where.productId = productId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Filter by date range if provided
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const blockedDates = await AvailabilityService.findManyBlockedDates({
      where,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            productCode: true
          }
        }
      },
      orderBy: [
        { productId: 'asc' },
        { date: 'asc' }
      ]
    });

    res.json({
      blockedDates,
      count: blockedDates.length
    });
  } catch (error) {
    next(error);
  }
});

// Block specific dates (Admin/Editor only)
router.post('/block', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const { productId, dates, reason } = req.body;
    
    if (!productId || !Array.isArray(dates)) {
      return res.status(400).json({ error: 'Product ID and dates array are required' });
    }

    const results = [];
    
    for (const dateStr of dates) {
      const date = new Date(dateStr);
      
      // Find existing blocked date record
      const existingBlockedDate = await AvailabilityService.findFirstBlockedDate({
        where: {
          productId,
          date
        }
      });

      let blockedDate;
      if (existingBlockedDate) {
        // Update existing record
        blockedDate = await AvailabilityService.updateBlockedDate(existingBlockedDate.id, {
            reason,
            isActive: false
        });
      } else {
        // Create new record
        blockedDate = await AvailabilityService.createBlockedDate({
            productId,
            date,
            reason,
            isActive: false
        });
      }
      
      results.push(blockedDate);
    }

    res.json({ 
      message: 'Dates blocked successfully', 
      count: results.length, 
      blockedDates: results 
    });
  } catch (error) {
    next(error);
  }
});

// Unblock a specific date (Admin/Editor only)
router.delete('/unblock/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
    try {
      const deleted = await AvailabilityService.deleteBlockedDate(req.params.id);
      res.json({
        message: 'Blocked date removed successfully',
        blockedDate: deleted
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;