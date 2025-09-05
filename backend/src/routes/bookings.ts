import express from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { ExcelService } from '../services/excelService';
import { EmailService } from '../services/emailService';
import { idempotency } from '../middleware/idempotency';
import { HubSpotService } from '../services/hubspotService';
import { logger } from '../utils/logger';
import { BookingService } from '../services/bookingService';
import { ProductService } from '../services/productService';
import { CouponService } from '../services/couponService';
import { AbandonedCartService } from '../services/abandonedCartService';
import { AvailabilityService } from '../services/availabilityService';
import { ProposalService } from '../services/proposalService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

const bookingSchema = z.object({
  slotId: z.string(),
  currency: z.string(),
  productId: z.string().optional(),
  packageId: z.string().optional(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  adults: z.number().min(1),
  children: z.number().min(0),
  bookingDate: z.string().transform(str => new Date(str)),
  selectedTimeSlot: z.string().min(1),
  notes: z.string().optional(),
  provideTravellerDetails: z.boolean().optional(),
  travellerDetails: z
    .array(
      z.object({
        name: z.string().min(1),
        age: z.number().int().min(0),
        dietaryRestrictions: z.string().optional()
      })
    )
    .optional(),
  partialPaymentAmount: z.number().min(0).optional(),
  couponCode: z.string().nullable().optional(),
  discountAmount: z.number().min(0).optional()
});

const customDetailsSchema = z.object({
  packageName:      z.string().min(1),
  location:         z.string().min(1),
  duration:         z.string().min(1),
  durationUnit:     z.enum(['hours','days']),
  code:             z.string().optional(),
  pricePerPerson:   z.number().min(0),
  childPricePerPerson: z.number().min(0).optional(),
  discountType:     z.enum(['percentage','fixed']),
  discountValue:    z.number().min(0),
  selectedTimeSlot: z.string().min(1),
  itinerary: z.array(z.object({
    date:     z.string(),
    time:     z.string(),
    activity: z.string().min(1),
    location: z.string().min(1),
    remarks:  z.string().optional()
  })).optional()
});

type DiscountKind = 'none' | 'percentage' | 'fixed';

function asDiscountKind(val: unknown): DiscountKind | undefined {
   const v = typeof val === 'string' ? val.toLowerCase() : val;
   if (v === 'percentage' || v === 'fixed' || v === 'none') return v;
   return undefined;
}

function priceAfterPackageDiscount(
  unitPrice: number,
  discountType?: DiscountKind | null,
  discountValue?: number | null
): number {
  if (!discountType || discountType === 'none' || !discountValue) return unitPrice;
  if (discountType === 'percentage') return unitPrice * (1 - discountValue / 100);
  if (discountType === 'fixed') return Math.max(0, unitPrice - discountValue);
  return unitPrice;
}

function computeProposalTotal(
  details: {
    pricePerPerson?: number;
    childPricePerPerson?: number;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
  },
  adults: number,
  children: number
): number {
  const adultUnit  = details.pricePerPerson        ?? 0;
  const childUnit  = details.childPricePerPerson   ?? adultUnit;

  let gross = adultUnit * adults + childUnit * children;

  if (details.discountType === 'percentage') {
    gross = gross * (1 - (details.discountValue ?? 0) / 100);
  } else if (details.discountType === 'fixed') {
    gross = Math.max(0, gross - (details.discountValue ?? 0));
  }

  return Math.round(gross * 100) / 100;
}

function computePackageTotal(opts: {
  pkg: {
    basePrice: number;
    discountType?: string | null;
    discountValue?: number | null;
  };
  slot?: {
    adultTiers?: { min: number; max: number; price: number }[];
    childTiers?: { min: number; max: number; price: number }[];
  } | null;
  adults: number;
  children: number;
  extraDiscount?: number;
}): number {
  const { pkg, slot, adults, children, extraDiscount = 0 } = opts;
  let adultUnit = pkg.basePrice;
  let childUnit = pkg.basePrice;

  const adultTier = slot?.adultTiers?.find(t => adults >= t.min && adults <= t.max);
  if (adultTier) adultUnit = adultTier.price;
  const childTier = children > 0 ? slot?.childTiers?.find(t => children >= t.min && children <= t.max) : undefined;
  if (childTier) childUnit = childTier.price;

  const kind: DiscountKind | undefined = asDiscountKind(pkg.discountType);
  const value: number | null = pkg.discountValue ?? null;

  adultUnit = priceAfterPackageDiscount(adultUnit, kind, value);
  childUnit = priceAfterPackageDiscount(childUnit, kind, value);

  const gross = (adultUnit * adults) + (childUnit * children);
  const net = Math.max(0, gross - (extraDiscount || 0));
  return Math.round(net * 100) / 100;
}

// Get all bookings (Admin/Editor only)
router.get('/', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req, res, next) => {
  try {
    const { status, productId, limit, offset } = req.query;
    
    const where: any = {};
    if (status) where.status = status;
    if (productId) where.productId = productId;

    const bookings = await BookingService.findManyBookings({
      where,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        product: {
          select: {
            id: true,
            title: true,
            productCode: true
          }
        },
        package: {
          select: {
            id: true,
            name: true
          }
        },
        payments: true
      },
      take: limit ? parseInt(limit as string) : undefined,
      skip: offset ? parseInt(offset as string) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

// Export bookings to Excel
router.get('/export', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req, res, next) => {
  try {
    const { ids, fromDate, toDate, status } = req.query;
    
    const where: any = {};
    
    // Filter by IDs if provided
    if (ids) {
      const bookingIds = (ids as string).split(',');
      where.id = { in: bookingIds };
    }
    
    // Filter by date range
    if (fromDate || toDate) {
      where.bookingDate = {};
      if (fromDate) where.bookingDate.gte = new Date(fromDate as string);
      if (toDate) where.bookingDate.lte = new Date(toDate as string);
    }
    
    // Filter by status
    if (status) {
      where.status = status;
    }
    
    const bookings = await BookingService.findManyBookings({
      where,
      include: {
        product: {
          select: {
            title: true,
            productCode: true,
            type: true,
            location: true
          }
        },
        package: {
          select: {
            name: true
          }
        },
        slot: {
          select: {
            Time: true
          }
        },
        payments: {
          select: {
            amount: true,
            currency: true,
            status: true,
            paymentMethod: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (bookings.length === 0) {
      return res.status(404).json({ error: 'No bookings found matching the criteria' });
    }
    
    // Generate Excel file
    const buffer = await ExcelService.generateBookingsExcel(bookings);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bookings_export_${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    // Send the Excel buffer
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// Export single booking to Excel
router.get('/:id/export', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const booking = await BookingService.findBooking(
      { id },
      {
        include: {
        product: {
          select: {
            title: true,
            productCode: true,
            type: true,
            location: true
          }
        },
        package: {
          select: {
            name: true
          }
        },
        slot: {
          select: {
            Time: true
          }
        },
        payments: {
          select: {
            amount: true,
            currency: true,
            status: true,
            paymentMethod: true,
            createdAt: true
          }
        }
        }
      });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Generate Excel file for a single booking
    const buffer = await ExcelService.generateBookingsExcel([booking]);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="booking_${booking.bookingCode}.xlsx"`);
    
    // Send the Excel buffer
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// Create booking
router.post('/', idempotency, async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);

    // Verify the slot exists
    const packageSlot = await AvailabilityService.findManyPackageSlots({
      where: { id: data.slotId },
      include: {
        adultTiers: true,
        childTiers: true,
        package: true
      },
      take: 1
    });
    
    if (!packageSlot.length) {
      return res.status(404).json({ error: 'Selected time-slot not found' });
    }

    const slot = packageSlot[0];
    const slotPricing = slot
      ? { adultTiers: (slot as any).adultTiers, childTiers: (slot as any).childTiers }
      : null;
    
    // Count existing bookings for this slot
    const existingBookings = await BookingService.findManyBookings({
      where: {
        slotId: data.slotId,
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      select: {
        adults: true,
        children: true
      }
    });
    
    const product = await ProductService.findProduct(
      { id: data.productId },
      { include: { packages: true } }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get pricing based on package and tiers
    let totalAmount = 0;

    let selectedPackage: typeof product.packages[number] | null = null;
    if (data.packageId) {
      const pkg = product.packages.find(p => p.id === data.packageId);
      selectedPackage = pkg ?? null;

      if (!pkg) {
        return res.status(400).json({ error: 'Selected package not found' });
      }

      // Type assertion to ensure pkg has the required Package properties
      const packageData = pkg as any;
      if (typeof packageData.basePrice !== 'number') {
        return res.status(500).json({ error: 'Invalid package pricing data' });
      }

      totalAmount = computePackageTotal({
        pkg: {
          basePrice: packageData.basePrice,
          discountType: packageData.discountType,
          discountValue: packageData.discountValue
        },
        slot: slotPricing,
        adults: data.adults,
        children: data.children,
        extraDiscount: data.discountAmount ?? 0
      });
    }

    // Generate booking code
    const bookingCode = `LT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Create the booking
    const created = await BookingService.createBooking({
        bookingCode,
        currency: data.currency,
        totalAmount,
        slotId: data.slotId,
        packageId: data.packageId,
        productId: data.productId,
        customerName:  data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        adults:        data.adults,
        children:      data.children,
        bookingDate:   data.bookingDate,
        selectedTimeSlot: data.selectedTimeSlot,
        notes:         data.notes,
        travellerDetails: data.travellerDetails,
        couponCode:     data.couponCode? data.couponCode : undefined,
        discountAmount: data.discountAmount,
    });

    const booking = await BookingService.findBooking(
      { id: created.id },
      {
        include: {
          product: { select: { id: true, title: true, productCode: true } },
          package: { select: { id: true, name: true } }
        }
      }
    );

    if (data.couponCode && data.discountAmount) {
      const coupon = await CouponService.findCouponByCode(data.couponCode);
      if (coupon) {
        await CouponService.createCouponUsage({
          data: {
            couponId: coupon.id,
            bookingId: created.id,
            bookingCode: created.bookingCode,
            customerName: created.customerName,
            customerEmail: created.customerEmail,
            discountAmount: data.discountAmount
          }
        });
        await CouponService.updateCoupon(coupon.id, { usedCount: { increment: 1 } });
      }
    }

    await AbandonedCartService.deleteManyAbandonedCarts({ where: { email: data.customerEmail } });

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

// Admin booking creation endpoint
router.post('/admin', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: AuthRequest, res, next) => {
  try {
    const adminBookingSchema = z.object({
      productId: z.string().optional(),
      customDetails: customDetailsSchema.optional(),
      packageId: z.string().optional(),
      slotId: z.string().optional(),
      customerName: z.string().min(1),
      customerEmail: z.string().email(),
      customerPhone: z.string().min(1),
      adults: z.number().min(1),
      children: z.number().min(0),
      bookingDate: z.string().transform(str => new Date(str)),
      selectedTimeSlot: z.string().min(1),
      notes: z.string().optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).default('CONFIRMED'),
      paymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED']).default('PAID'),
      partialPaymentAmount: z.number().min(0).optional(),
      additionalDiscount: z.number().min(0).optional(),
      currency: z.string(),
      proposalId: z.string().optional(),
    });

    const data = adminBookingSchema.parse(req.body);

    /* ──────────────────────────────────────────────────────────────
       1. FAST-PATH: booking comes from an APPROVED proposal
       ──────────────────────────────────────────────────────────────*/
    if (data.proposalId) {
      const proposal = await ProposalService.findProposal({
        id: data.proposalId,
      });
      if (
        !proposal ||
        proposal.status !== 'APPROVED' ||
        proposal.bookingId /* already consumed */
      ) {
        return res.status(400).json({ error: 'Invalid or unavailable proposal' });
      }

      /* helper already exists in this file */
      const totalAmount = computeProposalTotal(
        proposal.customDetails as any,
        proposal.adults,
        proposal.children,
      );

      const booking = await BookingService.createBooking({
        bookingCode: `LT${Date.now()}${Math.random().toString(36).slice(2,6).toUpperCase()}`,
        currency:    proposal.currency,
        isManual:    true,
        createdById: req.user?.id,

        /* customer and trip */
        customerName:  proposal.customerName,
        customerEmail: proposal.customerEmail,
        customerPhone: proposal.customerPhone,
        adults:        proposal.adults,
        children:      proposal.children,
        bookingDate:   proposal.startDate,
        selectedTimeSlot: (proposal.customDetails as any).selectedTimeSlot ?? '',

        /* financials */
        totalAmount,
        status:        data.status,
        paymentStatus: data.paymentStatus,
        partialPaymentAmount: data.partialPaymentAmount ?? 0,

        /* keep the snapshot for voucher generation */
        customDetails: proposal.customDetails as any,
      });

      /* mark proposal as archived & linked */
      await ProposalService.updateProposal(proposal.id, { 
        status: 'ARCHIVED', 
        bookingId: booking.id 
      });

      await EmailService.sendBookingConfirmation(booking, {
        title: (proposal.customDetails as any).packageName,
      });
      return res.status(201).json(booking);
    }

    /* ──────────────────────────────────────────────────────────────
       2. NORMAL manual-booking path (existing code continues below)
       ──────────────────────────────────────────────────────────────*/

    if (data.customDetails) {
      const cd = data.customDetails;
      const adultPrice  = cd.pricePerPerson;
      const childPrice  = cd.childPricePerPerson ?? cd.pricePerPerson;
      const baseTotal   = (adultPrice * data.adults) + (childPrice * data.children);
      const totalAmount = cd.discountType === 'percentage'
        ? baseTotal * (1 - cd.discountValue/100)
        : Math.max(0, baseTotal - cd.discountValue);
      const bookingCode = `LT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const booking = await BookingService.createBooking({
          bookingCode:       bookingCode,
          currency:          data.currency ?? "INR",
          isManual:          true,
          createdById:       req.user?.id,
          productId:         null,
          packageId:         null,
          slotId:            null,
          customerName:      data.customerName,
          customerEmail:     data.customerEmail,
          customerPhone:     data.customerPhone,
          adults:            data.adults,
          children:          data.children,
          totalAmount,
          partialPaymentAmount: data.partialPaymentAmount ?? 0,
          status:            data.status,
          paymentStatus:     data.paymentStatus,
          bookingDate:       data.bookingDate,
          selectedTimeSlot:  cd.selectedTimeSlot,
          notes:             `Location: ${cd.location}, Duration: ${cd.duration}`,
          customDetails:     cd
      });
      await EmailService.sendBookingConfirmation(
        booking,
        { title: data.customDetails.packageName }
      );
      return res.status(201).json(booking);
    }
    
    // Generate booking code
    const bookingCode = `LT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Calculate total amount based on package/slot
    let totalAmount = 0;
    
    const product = await ProductService.findProduct(
      { id: data.productId },
      { include: { packages: true } }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    let selectedPackage;
    if (data.packageId) {
      selectedPackage = product.packages.find(p => p.id === data.packageId);
    }
    
    if (selectedPackage) {
      let slot: any | null = null;
      if (data.slotId) {
        const slots = await AvailabilityService.findManyPackageSlots({
          where: { id: data.slotId },
          include: { adultTiers: true, childTiers: true },
          take: 1
        });
        slot = slots.length ? slots[0] : null;
      }
      const slotPricing2 = slot
        ? { adultTiers: (slot as any).adultTiers, childTiers: (slot as any).childTiers }
        : null;
      // Type assertion and validation for selectedPackage
      const packageData = selectedPackage as any;
      if (typeof packageData.basePrice !== 'number') {
        return res.status(500).json({ error: 'Invalid package pricing data' });
      }

      totalAmount = computePackageTotal({
        pkg: {
          basePrice: packageData.basePrice,
          discountType: packageData.discountType,
          discountValue: packageData.discountValue
        },
        slot: slotPricing2,
        adults: data.adults,
        children: data.children,
        extraDiscount: data.additionalDiscount ?? 0
      });
    }
    
    // Create the booking
    const booking = await BookingService.createBooking({
        bookingCode,
        currency: data.currency,
        isManual: true,
        createdById: req.user?.id,
        productId: data.productId,
        packageId: data.packageId,
        slotId: data.slotId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        adults: data.adults,
        children: data.children,
        totalAmount,
        bookingDate: data.bookingDate,
        selectedTimeSlot: data.selectedTimeSlot,
        notes: data.notes,
        status: data.status,
        paymentStatus: data.paymentStatus,
        partialPaymentAmount: data.partialPaymentAmount ?? 0,
    });

    await AbandonedCartService.deleteManyAbandonedCarts({ where: { email: data.customerEmail } });
    await EmailService.sendBookingConfirmation(booking, product);
    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

// Send voucher for a booking
router.post('/:id/send-voucher', authenticate, authorize(['ADMIN', 'EDITOR']), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const booking = await BookingService.findBooking(
      { id },
      {
        include: {
        product: true,
        package: true,
        slot: true
        }
      }
    );
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    let productForVoucher = booking.product as any;
    if (!productForVoucher || !productForVoucher.title) {
      const cd = (booking as any).customDetails;
      productForVoucher = {
        title: cd.packageName,
        location: cd.location,
        duration: `${cd.duration} ${cd.durationUnit}`
      };
    }
    
    await EmailService.sendBookingVoucher({
      ...booking,
      product: productForVoucher
    });
    return res.json({ message: 'Voucher sent successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /bookings/:id
router.get('/:id', authenticate, authorize(['ADMIN','EDITOR','VIEWER']), async (req,res,next)=>{
  try{
    const booking = await BookingService.findBooking(
      { id: req.params.id },
      {
        include: {
        product: true,
        package: true,
        slot: true,
        payments: true,
        proposal: { select: { id: true } }
        }
      }
    );
    if (!booking) return res.status(404).json({error:'Not found'});
    res.json(booking);
  }catch(e){ next(e); }
});

// Update booking status (Admin/Editor only)
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'EDITOR']), async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
    }).parse(req.body);

    const booking = await BookingService.updateBooking(req.params.id, { status });
    const bookingWithIncludes = await BookingService.findBooking(
      { id: req.params.id },
      {
        include: {
        product: {
          select: {
            id: true,
            title: true,
            productCode: true
          }
        },
        package: {
          select: {
            id: true,
            name: true
          }
        }
        }
      }
    );

    res.json(bookingWithIncludes);
  } catch (error) {
    next(error);
  }
});

// Update booking status (Admin/Editor only)
router.patch('/:id/payment-status', authenticate, authorize(['ADMIN', 'EDITOR']), async (req, res, next) => {
  try {
    const { paymentStatus } = z.object({
      paymentStatus: z.enum(['PENDING', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED'])
    }).parse(req.body);

    const booking = await BookingService.updateBooking(req.params.id, { paymentStatus });
    const bookingWithIncludes = await BookingService.findBooking(
      { id: req.params.id },
      {
        include: {
        product: {
          select: {
            id: true,
            title: true,
            productCode: true
          }
        },
        package: {
          select: {
            id: true,
            name: true
          }
        }
        }
      }
    );

    res.json(bookingWithIncludes);
  } catch (error) {
    next(error);
  }
});

// Reserve Now Pay Later
router.post('/pay-later', idempotency, async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);

    // Verify the slot exists
    const packageSlot = await AvailabilityService.findManyPackageSlots({
      where: { id: data.slotId },
      include: {
        adultTiers: true,
        childTiers: true,
        package: true
      },
      take: 1
    });
    
    if (!packageSlot.length) {
      return res.status(404).json({ error: 'Selected time-slot not found' });
    }

    const slot = packageSlot[0];
    
    // Count existing bookings for this slot
    const existingBookings = await BookingService.findManyBookings({
      where: {
        slotId: data.slotId,
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      select: {
        adults: true,
        children: true
      }
    });
    
    const product = await ProductService.findProduct(
      { id: data.productId },
      { include: { packages: true } }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get pricing based on package and tiers
    let totalAmount = 0;

    let selectedPackage: typeof product.packages[number] | null = null;
    if (data.packageId) {
      const pkg = product.packages.find(p => p.id === data.packageId);
      selectedPackage = pkg ?? null;
      
      if (!pkg) {
        return res.status(400).json({ error: 'Selected package not found' });
      }

      const slotPricing3 = slot
        ? { adultTiers: (slot as any).adultTiers, childTiers: (slot as any).childTiers }
        : null;
      // Type assertion and validation for pkg
      const packageData = pkg as any;
      if (typeof packageData.basePrice !== 'number') {
        return res.status(500).json({ error: 'Invalid package pricing data' });
      }

      totalAmount = computePackageTotal({
        pkg: {
          basePrice: packageData.basePrice,
          discountType: packageData.discountType,
          discountValue: packageData.discountValue
        },
        slot: slotPricing3,
        adults: data.adults,
        children: data.children,
        extraDiscount: data.discountAmount ?? 0
      });
    }

    // Generate booking code
    const bookingCode = `LT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Create the booking
    const created = await BookingService.createBooking({
        bookingCode,
        currency: data.currency,
        totalAmount,
        slotId: data.slotId,
        packageId: data.packageId,
        productId: data.productId,
        customerName:  data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        adults:        data.adults,
        children:      data.children,
        bookingDate:   data.bookingDate,
        selectedTimeSlot: data.selectedTimeSlot,
        notes:         data.notes,
        travellerDetails: data.travellerDetails,
        couponCode:     data.couponCode? data.couponCode : undefined,
        discountAmount: data.discountAmount,
    });

    const booking = await BookingService.findBooking(
      { id: created.id },
      {
        include: {
          product: { select: { id: true, title: true, productCode: true } },
          package: { select: { id: true, name: true } }
        }
      }
    );

    if (data.couponCode && data.discountAmount) {
      const coupon = await CouponService.findCouponByCode(data.couponCode);
      if (coupon) {
        await CouponService.createCouponUsage({
          data: {
            couponId: coupon.id,
            bookingId: created.id,
            bookingCode: created.bookingCode,
            customerName: created.customerName,
            customerEmail: created.customerEmail,
            discountAmount: data.discountAmount
          }
        });
        await CouponService.updateCoupon(coupon.id, { usedCount: { increment: 1 } });
      }
    }

    await AbandonedCartService.deleteManyAbandonedCarts({ where: { email: data.customerEmail } });
    await EmailService.sendBookingConfirmation(booking, product);
    try {
      const existed = !!(await HubSpotService.getContactByEmail(data.customerEmail));
      const contact = await HubSpotService.ensureContact({
        email: data.customerEmail,
        name : data.customerName,
        phone: data.customerPhone,
      });
      const productTitle = product?.title ?? 'Booking';
      const dealName = `Pay Later – ${created.bookingCode} ${productTitle} `;
      await HubSpotService.createDealForContact({
        contactId: contact.id,
        dealName,
        stageLabel: 'Qualified Lead',
        dealType: existed ? 'existingbusiness' : 'newbusiness',
        priorityLabel: 'HIGH',
        amount: created.totalAmount,
        properties: {
          bookingCode: created.bookingCode,
          productCode: product?.productCode,
          bookingDate: created.bookingDate,
          currency: created.currency,
          totalAmount: created.totalAmount,
          adults: data.adults,
          children: data.children,
          couponCode: data.couponCode,
          discountAmount: data.discountAmount,
          notes: data.notes
        }
      });
    } catch (e) {
      logger.error('HubSpot sync (pay-later) failed', { error: (e as Error).message });
    }
    res.json({ success: true, booking })
  } catch (error) {
    next(error);
  }
});

// Send voucher for a booking
router.post('/:id/payment-reminder', authenticate, authorize(['ADMIN', 'EDITOR']), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const booking = await BookingService.findBooking(
      { id },
      {
        include: {
        product: true,
        package: true,
        slot: true
        }
      }
    );

    let product: any = null;
    if (booking?.productId) {
      product = await ProductService.findProduct({ id: booking.productId });
    } else if ((booking as any).customDetails) {
      const cd = (booking as any).customDetails as { packageName?: string };
      product = { title: cd.packageName ?? 'Custom Package' };
     }
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Send reminder using the shared function
    const success = await EmailService.sendPaymentPendingNotice(booking, product);
    
    if (success) {
      res.json({ message: 'Reminder sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send remider' });
    }
  } catch (error) {
    next(error);
  }
});

export default router;