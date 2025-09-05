import express from 'express';
import { z } from 'zod';
import { computeStatus } from '../utils/availability';
import type { ProductAvailabilitySubrange, BlockedDate } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { SitemapService } from '../services/sitemapService';
import { ProductService } from '../services/productService';
import { DestinationService } from '../services/destinationService';
import { ExperienceCategoryService } from '../services/experienceCategoryService';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { TenantConfigService } from '../services/tenantConfigService';

// Add this function at the top level
const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')  // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single hyphen
    .trim();                    // Trim leading/trailing spaces
};

const router = express.Router();

// Add validation schema for the new guide structure
const guideSchema = z.object({
  language: z.string().min(1),
  inPerson: z.boolean(),
  audio: z.boolean(),
  written: z.boolean()
});

const subrangeSchema = z.object({
  productId: z.string().optional(),
  startDate: z.string().transform(s => new Date(s)),
  endDate:   z.string().transform(s => new Date(s)),
  status:    z.enum(['SOLD_OUT','NOT_OPERATING']),
})
  .refine(data => data.endDate >= data.startDate, {
    message: "endDate must be the same or after startDate",
    path: ["endDate"],
  });

const itineraryActivitySchema = z.object({
  location: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().optional(),
  isStop: z.boolean().optional(),
  description: z.string().optional().default(''),
  stopDuration: z.number().nullable().optional(),
  duration: z.number().nullable().optional(), // New duration figure
  durationUnit: z.enum(['minutes', 'hours']).optional().default('minutes'), // New duration unit
  isAdmissionIncluded: z.boolean().optional().default(false), // New admission field
  inclusions: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  order: z.number().optional(),
  images: z.array(z.string()).default([]),
  attractionId: z.string().nullable().optional(),
});

const itinerarySchema = z.object({
  day: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  activities: z.array(itineraryActivitySchema).default([]),
});

const productSchema = z.object({
  title: z.string().min(1),
  productCode: z.string().min(1).optional(),
  description: z.string().min(1),
  type: z.enum(['TOUR', 'EXPERIENCE']),
  category: z.string().nullable().optional(),
  location: z.string().min(1),
  duration: z.string().min(1),
  capacity: z.number().min(1),
  minparticipants: z.number().min(1).optional().default(1),
  highlights: z.array(z.string()).optional().default([]),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()).optional().default([]),
  itineraries: z.array(itinerarySchema).optional(),
  availabilitySubranges: z.array(subrangeSchema).optional().default([]),
  packages: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    basePrice: z.union([z.number().min(0), z.string().transform(val => Number(val))]),
    discountType: z.enum(['none', 'percentage', 'fixed']).optional().default('none'),
    discountValue: z.union([z.number().min(0), z.string().transform(val => Number(val))]).optional().default(0),
    currency: z.string().optional(),
    inclusions: z.array(z.string()),
    maxPeople: z.union([z.number().min(1), z.string().transform(val => Number(val))]),
    isActive: z.boolean().optional(),
    startDate: z.string().min(1),
    endDate: z.string().optional().nullable(),
    pricingType: z.enum(['per_person', 'per_group']).default('per_person'),
    ageGroups: z.object({
      adult: z.object({
        enabled: z.boolean(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional(),
      child: z.object({
        enabled: z.boolean(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional(),
    }).optional().nullable().default({}),
    slotConfigs: z.array(z.object({
      id: z.string().optional(),
      times: z.array(z.string()),
      days: z.array(z.string()),
      adultTiers: z.array(z.object({
        min: z.union([z.number(), z.string().transform(val => Number(val))]),
        max: z.union([z.number(), z.string().transform(val => Number(val))]),
        price: z.union([z.number(), z.string().transform(val => Number(val))])
      })),
      childTiers: z.array(z.object({
        min: z.union([z.number(), z.string().transform(val => Number(val))]),
        max: z.union([z.number(), z.string().transform(val => Number(val))]),
        price: z.union([z.number(), z.string().transform(val => Number(val))])
      })).optional().default([])
    })).optional().default([])
  })).optional(),
  images: z.array(z.string()),
  tags: z.array(z.string()),
  difficulty: z.string().optional().nullable(),
  healthRestrictions: z.array(z.string()).optional(),
  guides: z.array(guideSchema).optional(),
  meetingPoint: z.string().optional().nullable(),
  meetingPoints: z.array(z.object({
    address: z.string(),
    description: z.string().optional(),
    lat: z.number(),
    lng: z.number(),
    placeId: z.string().optional(),
  })).optional().default([]),
  doesTourEndAtMeetingPoint: z.boolean().optional().default(false),
  endPoints: z.array(z.object({
    address: z.string(),
    description: z.string().optional(),
    lat: z.number(),
    lng: z.number(),
    placeId: z.string().optional(),
  })).optional().default([]),
  pickupLocations: z.array(z.string()),
  pickupOption: z.string(),
  allowTravelersPickupPoint: z.boolean().optional().default(false),
  pickupStartTime: z.string().optional().nullable(),
  additionalPickupDetails: z.string().optional().nullable(),
  pickupLocationDetails: z.array(z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
    radius: z.number().optional().default(1), // in km
    placeId: z.string().optional(),
  })).optional().default([]),
  cancellationPolicy: z.string().min(1),
  cancellationPolicyType: z.enum(['standard', 'moderate', 'strict', 'no_refund', 'custom']).optional().default('standard'),
  freeCancellationHours: z.number().min(0).optional().default(24),
  partialRefundPercent: z.number().min(0).max(100).optional().default(50),
  noRefundAfterHours: z.number().min(0).optional().default(12),
  cancellationTerms: z.array(z.object({
    timeframe: z.string(),
    refundPercent: z.number().min(0).max(100),
    description: z.string()
  })).optional().default([]),
  requirePhone: z.boolean().optional().default(false),
  requireId: z.boolean().optional().default(false),
  requireAge: z.boolean().optional().default(false),
  requireMedical: z.boolean().optional().default(false),
  requireDietary: z.boolean().optional().default(false),
  requireEmergencyContact: z.boolean().optional().default(false),
  requirePassportDetails: z.boolean().optional().default(false),
  additionalRequirements: z.string().optional().nullable(),
  customRequirementFields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'textarea', 'select', 'checkbox', 'date', 'file']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional()
  })).optional().default([]),
  isActive: z.boolean().default(true),
  isDraft: z.boolean().default(false),
  availabilityStartDate: z.string().transform(str => new Date(str)),
  availabilityEndDate: z.string().transform(str => new Date(str)).optional(),
  blockedDates: z.array(z.object({ date: z.string(), reason: z.string().optional() })).optional(),
  permanentAvailabilityStatus: z.enum(['SOLD_OUT','NOT_OPERATING']).nullable().optional(),
  destinationId: z.string().nullable(),
  experienceCategoryId: z.string().nullable(),
  accessibilityFeatures: z.array(z.string().min(1)).optional().default([]),
  wheelchairAccessible: z.string().min(1).default('no').optional(),
  strollerAccessible: z.string().min(1).default('no').optional(),
  serviceAnimalsAllowed: z.string().min(1).default('no').optional(),
  publicTransportAccess: z.string().min(1).default('no').optional(),
  infantSeatsRequired: z.string().min(1).default('no').optional(),
  infantSeatsAvailable: z.string().min(1).default('no').optional(),
  phonenumber: z.string().default(''),
  tourType: z.string().default('public').optional(),
  cutoffTime: z.number().min(0).optional().default(24), 
  passportDetailsOption: z.string().optional(),
  reserveNowPayLater: z.boolean().optional().default(true),
  paymentType: z.enum(['FULL','PARTIAL','DEPOSIT']).optional().default('FULL'),
  minimumPaymentPercent: z.number().min(1).max(100).optional().default(20),
  depositAmount: z.number().min(0).optional().default(0),
});

// Get all products (public)
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const { type, category, location, limit, offset, minPrice, maxPrice } = req.query;

    const where: any = {};
    const { draft } = req.query;

    if (type) where.type = type;
    if (category) where.category = category;
    // if (location) where.location = location;

    if (draft === 'draft') {
      where.isDraft = true;
    } else if (draft === 'published') {
      where.isDraft = false;
    }

    if (!req.headers.authorization) {
      where.isActive = true;
      where.isDraft = false;
    }

    const priceFilter = minPrice || maxPrice;

    const products = await ProductService.findManyProducts({
      where,
      include: {
        packages: {
          where: { isActive: true },
          include: {
            slots: {
              include: {
                adultTiers: true,
                childTiers: true
              }
            }
          }
        },
        reviews: {
          where: { isApproved: true },
          select: {
            id: true,
            name: true,
            rating: true,
            comment: true,
            createdAt: true
          }
        },
        availabilitySubranges: true,
        blockedDates: true,
        itineraries: {
          orderBy: { day: 'asc' },
          include: {
            activities: {
              include: { attraction: true }
            }
          }
        },
      },
      take: limit ? parseInt(limit as string) : undefined,
      skip: offset ? parseInt(offset as string) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    const productsWithAvailability = products.map((product: any) => {

      let lowestPrice: number | null = null;
      let lowestDiscountedPrice: number | null = null;

      if (product.packages && product.packages.length > 0) {
        type PackagePricing = {
          basePrice: number;
          discountType: 'none' | 'percentage' | 'fixed' | null;
          discountValue: number | null;
        };
        for (const pkg of (product.packages as PackagePricing[])) {
          // Type assertion and validation for package properties
          const packageData = pkg as any;
          if (typeof packageData.basePrice !== 'number') continue;
          
          const basePrice = packageData.basePrice;
          let discountedPrice = basePrice;
          if (packageData.discountType === 'percentage' && packageData.discountValue != null) {
            discountedPrice = basePrice - (basePrice * packageData.discountValue / 100);
          } else if (packageData.discountType === 'fixed' && packageData.discountValue != null) {
            discountedPrice = basePrice - packageData.discountValue;
          }
          if (lowestPrice === null || basePrice < lowestPrice) lowestPrice = basePrice;
          if (packageData.discountType !== 'none' &&
              (lowestDiscountedPrice === null || discountedPrice < lowestDiscountedPrice)) {
            lowestDiscountedPrice = discountedPrice;
          }
        }
      }

      const { status, nextAvailableDate } = computeStatus({
        availabilityStartDate: product.availabilityStartDate,
        availabilityEndDate: product.availabilityEndDate,
        permanentAvailabilityStatus: product.permanentAvailabilityStatus,
        availabilitySubranges: product.availabilitySubranges,
        blockedDates: product.blockedDates
      });

      return {
        ...product,
        availabilityStatus: status,
        nextAvailableDate,
        lowestPackagePrice: lowestPrice,
        lowestDiscountedPackagePrice: lowestDiscountedPrice !== lowestPrice ? lowestDiscountedPrice : null
      };
    });

    type ProductWithPricing = {
      lowestDiscountedPackagePrice: number | null;
      lowestPackagePrice: number | null;
    };
    const filtered = priceFilter
      ? productsWithAvailability.filter((p: ProductWithPricing) => {
          const price = p.lowestDiscountedPackagePrice ?? p.lowestPackagePrice;
          if (price === null) return true;
          if (minPrice && price < parseFloat(minPrice as string)) return false;
          if (maxPrice && price > parseFloat(maxPrice as string)) return false;
          return true;
        })
      : productsWithAvailability;

    res.json(filtered);

  } catch (error) {
    next(error);
  }
});

// Get single product (public)
router.get('/:id', async (req: TenantRequest, res, next) => {
  try {
    const product = await ProductService.findProduct(
      { id: req.params.id },
      {
        include: {
          packages: {
            where: { isActive: true },
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          reviews: {
            where: { isApproved: true },
            select: {
              id: true,
              name: true,
              rating: true,
              comment: true,
              createdAt: true
            }
          },
          availabilitySubranges: true,
          blockedDates: true,
          itineraries: {
            orderBy: { day: 'asc' },
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let parsedProduct = { ...product };
    if (product.meetingPoint) {
      try {
        const parsed = JSON.parse(product.meetingPoint);
        if (Array.isArray(parsed)) {
          parsedProduct.meetingPoints = parsed;
          parsedProduct.meetingPoint = null;
        }
      } catch {
        parsedProduct.meetingPoints = [];
      }
    } else {
      parsedProduct.meetingPoints = [];
    }

    if (!parsedProduct.endPoints) {
      parsedProduct.endPoints = [];
    }

    if (product.packages && product.packages.length > 0) {
      // Narrow the element type to the pricing fields we actually use
      type PackagePricing = { basePrice: number; discountType: 'none'|'percentage'|'fixed'|null; discountValue: number|null };
      for (const pkg of product.packages as PackagePricing[]) {
        // Type assertion and validation for package properties
        const packageData = pkg as any;
        if (typeof packageData.basePrice !== 'number') continue;
        
        const basePrice = packageData.basePrice;
        let effectivePrice = basePrice;
        if (packageData.discountType === 'percentage' && packageData.discountValue != null) {
          effectivePrice = basePrice - (basePrice * packageData.discountValue / 100);
        } else if (packageData.discountType === 'fixed' && packageData.discountValue != null) {
          effectivePrice = basePrice - packageData.discountValue;
        }
        // keep computed values local; we don't mutate the prisma payload
      }
    }

    // Pass the exact shape computeStatus expects to satisfy TS
    const { status: availabilityStatus, nextAvailableDate } = computeStatus({
      availabilityStartDate: product.availabilityStartDate,
      availabilityEndDate: product.availabilityEndDate,
      permanentAvailabilityStatus: product.permanentAvailabilityStatus,
      availabilitySubranges: product.availabilitySubranges as ProductAvailabilitySubrange[],
      blockedDates: product.blockedDates as BlockedDate[]
    });

    const productWithAvailability = {
      ...parsedProduct,
      availabilityStatus,
      nextAvailableDate,
    };

    res.json(productWithAvailability);
  } catch (error) {
    next(error);
  }
});

// Create product (Admin/Editor only)
router.post('/', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    let draft = { ...req.body };
    for (const key in draft) {
      const val = draft[key];
      if (
        (typeof val === 'string' && val.trim() === '') ||
        (typeof val === 'number' && val === 0)
      ) {
        delete draft[key];
      }
    }
    const data = draft
      ? productSchema.partial().parse(draft)
      : productSchema.parse(req.body);
    const {
      blockedDates = [],
      itineraries = [],
      packages = [],
      accessibilityFeatures = [],
      isDraft = false,
      availabilitySubranges = [],
      permanentAvailabilityStatus = null,
      ...rest
    } = data;

    if (availabilitySubranges.length) {
      const baseStart = rest.availabilityStartDate;
      const baseEnd   = rest.availabilityEndDate;

      const ranges = availabilitySubranges
        .map(r => ({ start: r.startDate, end: r.endDate }))
        .sort((a,b) => a.start.getTime() - b.start.getTime());

       for (const { start, end } of ranges) {
            if (baseStart === null || (baseEnd === null && baseEnd !== undefined)) {
              return res.status(400).json({ error: 'Base availability window is not set properly' });
            }
            if ((baseStart && start < baseStart) || (baseEnd && end > baseEnd)) {
              return res.status(400).json({ error: 'Sub-range out of base availability window' });
            }
          }

      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i].start.getTime() <= ranges[i-1].end.getTime()) {
          return res.status(400).json({ error: 'Availability subranges cannot overlap' });
        }
      }
    }

    const cap = rest.capacity ?? 0;
    if (!isDraft) {
      if ((packages || []).some(pkg => pkg.maxPeople > cap)) {
        return res.status(400).json({
          error: `Package travellers exceed product capacity (${cap}).`
        });
      }
    }
    if (!isDraft && rest.type === 'TOUR') {
      const dur = (rest.duration ?? '').toLowerCase();
      const allowedDays = dur.includes('hour') || dur === 'full day' || dur === 'half day'
        ? 1
        : parseInt(rest.duration ?? '0', 10) || 0;
      const actualDays = (itineraries || []).length;
      if (actualDays !== allowedDays) {
        return res.status(400).json({
          error: `Itinerary days (${actualDays}) must exactly match the duration (${allowedDays}).`
        });
      }
    }
    const baseSlug = generateSlug(rest.title ?? `draft-${Date.now()}`);

    let slug = baseSlug;
    let slugExists = true;
    let counter = 1;

    while (slugExists) {
      const existingProduct = await ProductService.findProduct(
        { slug },
        { select: { id: true } }
      );

      if (!existingProduct) {
        slugExists = false;
      } else {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    if (!rest.productCode) {
      const destCode = (rest.location || '')
        .trim()
        .replace(/\s+/g, '')
        .substring(0, 3)
        .toUpperCase();
      const typeCode = rest.type === 'EXPERIENCE' ? 'EXP' : '';
      const branding = await TenantConfigService.getBrandingConfig(req.tenantId!);
      const tenantCode =
        ((branding.companyName ?? '')
          .replace(/[^A-Za-z]/g, '')
          .slice(0, 3)
          .toUpperCase()) || 'ZEN';
      const pattern  = `${tenantCode}${destCode}${typeCode}`;

      rest.productCode = await ProductService.nextProductCode(pattern, 4, { excludeCopies: true });
    }

    if (data.guides) {
      data.guides = data.guides.map(guide => ({
        language: guide.language,
        inPerson: guide.inPerson || false,
        audio: guide.audio || false,
        written: guide.written || false
      }));
    }

    const cleanNullValues = (obj: any): any => {
      const cleaned = { ...obj };

      if (cleaned.destinationId === null) cleaned.destinationId = undefined;
      if (cleaned.experienceCategoryId === null) cleaned.experienceCategoryId = undefined;

      if (cleaned.itineraries?.create) {
        cleaned.itineraries.create = cleaned.itineraries.create.map((day: any) => ({
          ...day,
          activities: {
            create: (day.activities?.create || []).map((act: any) => ({
              ...act,
              stopDuration: act.stopDuration == null ? undefined : act.stopDuration,
            })),
          },
        }));
      }

      return cleaned;
    };

    const product = await ProductService.transaction(async (tx: any) => {
      let meetingPointData = rest.meetingPoint;
      if (data.meetingPoints && data.meetingPoints.length > 0) {
        meetingPointData = JSON.stringify(data.meetingPoints);
      }

      const productData = {
        ...rest,
        permanentAvailabilityStatus,
        slug,
        meetingPoint: meetingPointData,
        endPoints: data.endPoints || [],
        accessibilityFeatures: accessibilityFeatures.filter((feature: string) => feature.trim() !== ''),
        wheelchairAccessible: rest.wheelchairAccessible ?? 'no',
        strollerAccessible: rest.strollerAccessible ?? 'no',
        serviceAnimalsAllowed: rest.serviceAnimalsAllowed ?? 'no',
        publicTransportAccess: rest.publicTransportAccess ?? 'no',
        infantSeatsRequired: rest.infantSeatsRequired ?? 'no',
        infantSeatsAvailable: rest.infantSeatsAvailable ?? 'no',
        isDraft,
        guides: data.guides || [],
        ...(blockedDates.length && {
          blockedDates: {
            create: blockedDates.map(b => ({
              date: new Date(b.date),
              reason: b.reason,
              isActive: false
            }))
          }
        }),
        ...(itineraries.length && {
          itineraries: {
            create: itineraries.map(day => ({
              day: day.day,
              title: day.title,
              description: day.description,

              activities: {
                create: (day.activities || []).map(act => ({
                  attractionId: act.attractionId,
                  location: act.location,
                  locationLat: act.lat,
                  locationLng: act.lng,
                  locationPlaceId: act.placeId,
                  isStop: act.isStop ?? false,
                  stopDuration: act.stopDuration,
                  duration: act.duration, // New duration field
                  durationUnit: act.durationUnit, // New duration unit field
                  isAdmissionIncluded: act.isAdmissionIncluded, // New admission field
                  inclusions: act.inclusions ?? [],
                  exclusions: act.exclusions ?? [],
                  order: act.order ?? 0,
                  description: act.description || '', // New description field
                  images: act.images,
                }))
              }
            }))
          }
        })
      };

      if (rest.type === 'EXPERIENCE' && rest.experienceCategoryId) {
        productData.experienceCategoryId = rest.experienceCategoryId;
      } else {
        productData.experienceCategoryId = null;
      }

      if (data.availabilitySubranges?.length) {
        Object.assign(productData, {
          availabilitySubranges: {
            create: data.availabilitySubranges.map(r => ({
              startDate: new Date(r.startDate),
              endDate:   new Date(r.endDate),
              status:    r.status,
            })),
          },
        });
      }

      const createdProduct = await tx.product.create({
        data: cleanNullValues(productData)
      });

      if (createdProduct.destinationId) {
        await DestinationService.updateDestination(createdProduct.destinationId, {
          products: {
            connect: { id: createdProduct.id }
          }
        });
      }
      if (createdProduct.experienceCategoryId) {
        await ExperienceCategoryService.updateExperienceCategory(createdProduct.experienceCategoryId, {
          products: {
            connect: { id: createdProduct.id }
          }
        });
      }

      if (packages.length > 0) {
        for (const pkg of packages) {
          const createdPackage = await tx.package.create({
            data: {
              productId: createdProduct.id,
              name: pkg.name,
              description: pkg.description,
              basePrice: pkg.basePrice,
              discountType: pkg.discountType,
              discountValue: pkg.discountValue,
              currency: pkg.currency || 'INR',
              inclusions: pkg.inclusions,
              maxPeople: pkg.maxPeople,
              isActive: pkg.isActive ?? true,
              startDate: new Date(pkg.startDate),
              endDate: pkg.endDate ? new Date(pkg.endDate) : null,
              ageGroups: pkg.ageGroups === null ? undefined : pkg.ageGroups,
              pricingType: pkg.pricingType
            }
          });

          if (pkg.slotConfigs && pkg.slotConfigs.length > 0) {
            for (const slotConfig of pkg.slotConfigs) {
              const newSlot = await tx.packageSlot.create({
                data: {
                  packageId: createdPackage.id,
                  Time: slotConfig.times,
                  days: slotConfig.days,
                }
              });

              if (slotConfig.adultTiers?.length) {
                await tx.slotAdultTier.createMany({
                  data: slotConfig.adultTiers.map(tier => ({
                    slotId:   newSlot.id,
                    min:      tier.min,
                    max:      tier.max,
                    price:    tier.price
                  }))
                });
              }
              if (slotConfig.childTiers?.length) {
                await tx.slotChildTier.createMany({
                  data: slotConfig.childTiers.map(tier => ({
                    slotId:   newSlot.id,
                    min:      tier.min,
                    max:      tier.max,
                    price:    tier.price
                  }))
                });
              }
            }
          }
        }
      }

      return await tx.product.findUniqueOrThrow({
        where: { id: createdProduct.id },
        include: {
          packages: {
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          blockedDates: true,
          itineraries: {
            orderBy: { day: 'asc' },
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      });
    });

    res.status(201).json(product);

    await SitemapService.generateSitemap().catch(err =>
      console.error('Error regenerating sitemap after product creation:', err)
    );
  } catch (error) {
    console.error('Error creating product:', error);
    next(error);
  }
});

// Update product (Admin/Editor only)
router.put('/:id', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const cleanedBody = Object.fromEntries(
      Object.entries(req.body).filter(([_, v]) =>
        !(typeof v === 'string' && v.trim() === '') &&
        !(typeof v === 'number' && v === 0)
      )
    );
    const data = productSchema.partial().parse(cleanedBody);
    const existing = await ProductService.findProduct({ id: req.params.id });
    const isDraft = data.isDraft ?? existing?.isDraft;
    const effectiveType = data.type ?? existing?.type;
    if (!isDraft && effectiveType === 'TOUR') {
      const effectiveDuration = ((data.duration ?? existing?.duration) || '').toLowerCase();
      const allowedDays = effectiveDuration.includes('hour') || effectiveDuration === 'full day' || effectiveDuration === 'half day'
        ? 1
        : parseInt(effectiveDuration, 10) || 0;
      const actualDays = (data.itineraries || []).length;
      if (actualDays !== allowedDays) {
        return res.status(400).json({
          error: `Itinerary days (${actualDays}) must exactly match the duration (${allowedDays}).`
        });
      }
    }

    const {
    blockedDates,
    itineraries,
    packages,
    availabilitySubranges = [],
    permanentAvailabilityStatus,
    ...rest
  } = data;
  
    const cap = rest.capacity ?? 0;
    if (!isDraft) {
      if ((packages || []).some(pkg => pkg.maxPeople > cap)) {
        return res.status(400).json({
          error: `Package travellers exceed product capacity (${cap}).`
        });
      }
    }

    if (data.guides) {
      data.guides = data.guides.map(guide => ({
        language: guide.language,
        inPerson: guide.inPerson || false,
        audio: guide.audio || false,
        written: guide.written || false
      }));
    }

    let slug: string | undefined;
    if (rest.title) {
      const baseSlug = generateSlug(rest.title);

      let tempSlug = baseSlug;
      let slugExists = true;
      let counter = 1;

      while (slugExists) {
        const existingProduct = await ProductService.findProduct(
          { slug: tempSlug, id: { not: req.params.id } },
          { select: { id: true } }
        );

        if (!existingProduct) {
          slugExists = false;
          slug = tempSlug;
        } else {
          tempSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    }

    const product = await ProductService.transaction(async (tx: any) => {
      if (rest.type === 'EXPERIENCE' && rest.experienceCategoryId) {
        rest.experienceCategoryId = rest.experienceCategoryId;
      } else {
        rest.experienceCategoryId = null;
      }

      let meetingPointData = rest.meetingPoint;
      if (data.meetingPoints && data.meetingPoints.length > 0) {
        meetingPointData = JSON.stringify(data.meetingPoints);
      }

      if (data.availabilitySubranges) {
        await tx.productAvailabilitySubrange.deleteMany({
          where: { productId: req.params.id }
        });

        if (data.availabilitySubranges.length) {
          const prodRec   = await tx.product.findUniqueOrThrow({
            where: { id: req.params.id },
            select: { availabilityStartDate: true, availabilityEndDate: true }
          });
          const baseStart = prodRec.availabilityStartDate;
          const baseEnd   = prodRec.availabilityEndDate;
          const ranges = data.availabilitySubranges
            .map(r => ({ start: r.startDate, end: r.endDate }))
            .sort((a,b) => a.start.getTime() - b.start.getTime());

          for (const { start, end } of ranges) {
            if (baseStart === null || (baseEnd === null && baseEnd !== undefined)) {
              return res.status(400).json({ error: 'Base availability window is not set properly' });
            }
            if ((baseStart && start < baseStart) || (baseEnd && end > baseEnd)) {
              return res.status(400).json({ error: 'Sub-range out of base availability window' });
            }
          }
          for (let i = 1; i < ranges.length; i++) {
            if (ranges[i].start.getTime() <= ranges[i-1].end.getTime()) {
              return res.status(400).json({ error: 'Availability subranges cannot overlap' });
            }
          }
        }


        if (data.availabilitySubranges.length) {
          await tx.productAvailabilitySubrange.createMany({
            data: data.availabilitySubranges.map(r => ({
              productId: req.params.id,
              startDate: new Date(r.startDate),
              endDate:   new Date(r.endDate),
              status:    r.status,
            }))
          });
        }
      }

      let updatedProduct = await tx.product.update({
        where: { id: req.params.id },
        data: {
          ...rest,
          permanentAvailabilityStatus,
          meetingPoint: meetingPointData,
          endPoints: data.endPoints || [],
          ...(slug && { slug }),
          guides: data.guides || []
        }
      });

      if (blockedDates && Array.isArray(blockedDates)) {
        await tx.blockedDate.deleteMany({ where: { productId: req.params.id } });
        if (blockedDates.length > 0) {
          await tx.blockedDate.createMany({
            data: blockedDates.map(b => ({
              productId: req.params.id,
              date: new Date(b.date),
              reason: b.reason,
              isActive: false
            }))
          });
        }
      }

      if (itineraries) {
        await tx.itineraryActivity.deleteMany({
          where: { itinerary: { productId: req.params.id } }
        });
        await tx.itinerary.deleteMany({ where: { productId: req.params.id } });
        if (itineraries.length > 0) {
          for (const day of itineraries) {
            await tx.itinerary.create({
              data: {
                productId: req.params.id,
                day: day.day,
                title: day.title,
                description: day.description,
                activities: {
                  create: (day.activities || []).map(act => ({
                    attractionId: act.attractionId,
                    location: act.location,
                    locationLat: act.lat,
                    locationLng: act.lng,
                    locationPlaceId: act.placeId,
                    isStop: act.isStop ?? false,
                    stopDuration: act.stopDuration,
                    duration: act.duration, // New duration field
                    durationUnit: act.durationUnit, // New duration unit field
                    isAdmissionIncluded: act.isAdmissionIncluded, // New admission field
                    inclusions: act.inclusions ?? [],
                    exclusions: act.exclusions ?? [],
                    order: act.order ?? 0,
                    description: act.description || '', // New description field
                    images: act.images,
                  }))
                }
              }
            });
          }
        }
      }

      if (packages && Array.isArray(packages)) {
        const keptIds = packages.filter(p => p.id).map(p => p.id!);
        await tx.package.deleteMany({
          where: {
            productId: req.params.id,
            ...(keptIds.length ? { id: { notIn: keptIds } } : {})
          }
        });
        for (const pkg of packages) {
          const pkgData = {
            name: pkg.name,
            description: pkg.description,
            basePrice: pkg.basePrice,
            discountType: pkg.discountType,
            discountValue: pkg.discountValue,
            currency: pkg.currency ?? 'INR',
            inclusions: pkg.inclusions,
            maxPeople: pkg.maxPeople,
            isActive: pkg.isActive ?? true,
            startDate: new Date(pkg.startDate),
            endDate: pkg.endDate ? new Date(pkg.endDate) : null,
            ageGroups: pkg.ageGroups === null ? undefined : pkg.ageGroups,
            pricingType: pkg.pricingType
          };

          let createdOrUpdatedPkg;
          if (pkg.id) {
            try {
              createdOrUpdatedPkg = await tx.package.update({
                where: { id: pkg.id },
                data: pkgData
              });
            } catch (err: any) {
              if (err.code === 'P2025') {
                createdOrUpdatedPkg = await tx.package.create({
                  data: { ...pkgData, productId: req.params.id }
                });
              } else {
                throw err;
              }
            }
          } else {
            createdOrUpdatedPkg = await tx.package.create({
              data: { ...pkgData, productId: req.params.id }
            });
          }

          if (pkg.slotConfigs && pkg.slotConfigs.length > 0) {
            const keepIds = pkg.slotConfigs.filter(c => c.id).map(c => c.id!);
            await tx.packageSlot.deleteMany({
              where: {
                packageId: createdOrUpdatedPkg.id,
                id: { notIn: keepIds }
              }
            });
  
            for (const slotConfig of pkg.slotConfigs) {
              if (slotConfig.id) {
                const slotId = slotConfig.id;
                await tx.packageSlot.update({
                  where: { id: slotId },
                  data: { Time: slotConfig.times, days: slotConfig.days }
                });
  
                await tx.slotAdultTier.deleteMany({ where: { slotId } });
                if (slotConfig.adultTiers?.length) {
                  await tx.slotAdultTier.createMany({
                    data: slotConfig.adultTiers.map(t => ({
                      slotId, min: t.min, max: t.max, price: t.price
                    }))
                  });
                }
                await tx.slotChildTier.deleteMany({ where: { slotId } });
                if (slotConfig.childTiers?.length) {
                  await tx.slotChildTier.createMany({
                    data: slotConfig.childTiers.map(t => ({
                      slotId, min: t.min, max: t.max, price: t.price
                    }))
                  });
                }
              } else {
                const newSlot = await tx.packageSlot.create({
                  data: {
                    packageId: createdOrUpdatedPkg.id,
                    Time: slotConfig.times,
                    days: slotConfig.days,
                  }
                });
                if (slotConfig.adultTiers?.length) {
                  await tx.slotAdultTier.createMany({
                    data: slotConfig.adultTiers.map(t => ({
                      slotId: newSlot.id, min: t.min, max: t.max, price: t.price
                    }))
                  });
                }
                if (slotConfig.childTiers?.length) {
                  await tx.slotChildTier.createMany({
                    data: slotConfig.childTiers.map(t => ({
                      slotId: newSlot.id,
                      min: t.min,
                      max: t.max,
                      price: t.price
                    }))
                  });
                }
              }
            }
          }
        }
      }

      return await tx.product.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          packages: {
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          blockedDates: true,
          itineraries: {
            orderBy: { day: 'asc' },
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      });
    });

    res.json(product);

    await SitemapService.generateSitemap().catch(err =>
      console.error('Error regenerating sitemap after product update:', err)
    );
  } catch (error) {
    console.error('Error updating product:', error);
    next(error);
  }
});

// Delete product (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await ProductService.deleteProduct(req.params.id);

    res.status(204).send();

    await SitemapService.generateSitemap().catch(err =>
      console.error('Error regenerating sitemap after product deletion:', err)
    );
  } catch (error) {
    next(error);
  }
});

// Get product by slug
router.get('/by-slug/:slug', async (req: TenantRequest, res, next) => {
  try {
    const { slug } = req.params;

    const product = await ProductService.findProduct(
      { slug },
      {
        include: {
          packages: {
            where: { isActive: true },
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          reviews: {
            where: { isApproved: true },
            select: {
              id: true,
              name: true,
              rating: true,
              comment: true,
              createdAt: true
            }
          },
          availabilitySubranges: true,
          blockedDates: true,
          itineraries: {
            orderBy: { day: 'asc' },
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let parsedProduct = { ...product };
    if (product.meetingPoint) {
      try {
        const parsed = JSON.parse(product.meetingPoint);
        if (Array.isArray(parsed)) {
          parsedProduct.meetingPoints = parsed;
          parsedProduct.meetingPoint = null;
        }
      } catch {
        parsedProduct.meetingPoints = [];
      }
    } else {
      parsedProduct.meetingPoints = [];
    }

    if (!parsedProduct.endPoints) {
      parsedProduct.endPoints = [];
    }

    if (product.packages && product.packages.length > 0) {
      type PackagePricing = { basePrice: number; discountType: 'none'|'percentage'|'fixed'|null; discountValue: number|null };
      for (const pkg of product.packages as PackagePricing[]) {
        // Type assertion and validation for package properties
        const packageData = pkg as any;
        if (typeof packageData.basePrice !== 'number') continue;
        
        const basePrice = packageData.basePrice;
        let effectivePrice = basePrice;
        if (packageData.discountType === 'percentage' && packageData.discountValue != null) {
          effectivePrice = basePrice - (basePrice * packageData.discountValue / 100);
        } else if (packageData.discountType === 'fixed' && packageData.discountValue != null) {
          effectivePrice = basePrice - packageData.discountValue;
        }
      }
    }

    const { status: availabilityStatus, nextAvailableDate } = computeStatus({
      availabilityStartDate: product.availabilityStartDate,
      availabilityEndDate: product.availabilityEndDate,
      permanentAvailabilityStatus: product.permanentAvailabilityStatus,
      availabilitySubranges: product.availabilitySubranges as ProductAvailabilitySubrange[],
      blockedDates: product.blockedDates as BlockedDate[]
    });

    const productWithAvailability = {
      ...parsedProduct,
      availabilityStatus,
      nextAvailableDate,
    };

    res.json(productWithAvailability);
  } catch (error) {
    next(error);
  }
});


// Clone product (Admin/Editor only)
router.post('/:id/clone', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const originalProduct = await ProductService.findProduct(
      { id: req.params.id },
      {
        include: {
          packages: {
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          itineraries: {
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      }
    );

    if (!originalProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      packages,
      itineraries,
      id,
      createdAt,
      updatedAt,
      meetingPoints, 
      ...productData
    } = originalProduct;

    const baseSlug = `${productData.slug}-copy`;
    let slug = baseSlug;
    let slugExists = true;
    let counter = 1;

    while (slugExists) {
      const existingProduct = await ProductService.findProduct(
        { slug },
        { select: { id: true } }
      );

      if (!existingProduct) {
        slugExists = false;
      } else {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    let newId: string;

    do {
      newId = `LTC${counter.toString().padStart(3, '0')}`;
      const existingProduct = await ProductService.findProduct(
        { id: newId },
        { select: { id: true } }
      );
      if (!existingProduct) break;
      counter++;
    } while (true);

    const currentTime = new Date();

    const destCode = (productData.location || '')
      .trim()
      .replace(/\s+/g, '')
      .substring(0, 3)
      .toUpperCase();

    const typeCode = productData.type === 'EXPERIENCE' ? 'EXP' : '';
    const branding = await TenantConfigService.getBrandingConfig(req.tenantId!);
    const tenantCode =
      ((branding.companyName ?? '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase()) || 'ZEN';
    const pattern  = `${tenantCode}${destCode}${typeCode}`;

    const productCode = await ProductService.nextProductCode(pattern, 4, { excludeCopies: true });

    const cleanProductData = {
      ...productData,
      id: newId,
      title: `${productData.title} (Copy)`,
      productCode,
      slug,
      createdAt: currentTime,
      updatedAt: currentTime,
      isActive: false,
      guides: productData.guides || [],
      destinationId: productData.destinationId,
      experienceCategoryId: productData.experienceCategoryId,
      difficulty: productData.difficulty === null ? undefined : productData.difficulty,
      meetingPoint: productData.meetingPoint === null ? undefined : productData.meetingPoint,
      availabilityEndDate: productData.availabilityEndDate === null ? undefined : productData.availabilityEndDate,
      additionalPickupDetails: productData.additionalPickupDetails === null ? undefined : productData.additionalPickupDetails,
      pickupStartTime: productData.pickupStartTime === null ? undefined : productData.pickupStartTime,
      pickupLocationDetails: Array.isArray(productData.pickupLocationDetails)
        ? productData.pickupLocationDetails.filter(item => item !== null)
        : [],
      accessibilityFeatures: Array.isArray(productData.accessibilityFeatures)
        ? productData.accessibilityFeatures.filter(item => item !== null && item !== '')
        : [],
      healthRestrictions: Array.isArray(productData.healthRestrictions)
        ? productData.healthRestrictions.filter(item => item !== null && item !== '')
        : [],
      highlights: Array.isArray(productData.highlights)
        ? productData.highlights.filter(item => item !== null && item !== '')
        : [],
      inclusions: Array.isArray(productData.inclusions)
        ? productData.inclusions.filter(item => item !== null && item !== '')
        : [],
      exclusions: Array.isArray(productData.exclusions)
        ? productData.exclusions.filter(item => item !== null && item !== '')
        : [],
      images: Array.isArray(productData.images)
        ? productData.images.filter(item => item !== null && item !== '')
        : [],
      tags: Array.isArray(productData.tags)
        ? productData.tags.filter(item => item !== null && item !== '')
        : [],
      pickupLocations: Array.isArray(productData.pickupLocations)
        ? productData.pickupLocations.filter(item => item !== null && item !== '')
        : [],
      endPoints: Array.isArray(productData.endPoints)
        ? productData.endPoints.filter(item => item !== null)
        : [],
      cancellationTerms: Array.isArray(productData.cancellationTerms)
        ? productData.cancellationTerms.filter(item => item !== null)
        : [],
      customRequirementFields: Array.isArray(productData.customRequirementFields)
        ? productData.customRequirementFields.filter(item => item !== null)
        : [],
    };

    const result = await ProductService.transaction(async (tx: any) => {
      const clonedProduct = await tx.product.create({
        data: cleanProductData
      });

      for (const pkg of (packages as any[])) {
        // Cast each package to a concrete shape to avoid union-widening issues
        const { id: pkgId, slots, ...packageData } = pkg as {
          id: string;
          slots: any[];
          endDate: Date|null;
          currency?: string|null;
          ageGroups?: any;
          pricingType?: string;
          [k: string]: any;
        };

        const clonedPackage = await tx.package.create({
          data: {
            ...packageData,
            productId: clonedProduct.id,
            endDate: packageData.endDate === null ? undefined : packageData.endDate,
            currency: packageData.currency || 'INR',
            ageGroups: packageData.ageGroups === null ? undefined : packageData.ageGroups,
            pricingType: packageData.pricingType,
          }
        });

        for (const slot of (slots as any[])) {
          const { id: slotId, adultTiers, childTiers, ...slotData } = slot as {
            id: string;
            adultTiers: any[];
            childTiers: any[];
            [k: string]: any;
          };

          const clonedSlot = await tx.packageSlot.create({
            data: {
              ...slotData,
              packageId: clonedPackage.id
            }
          });

          if (adultTiers.length > 0) {
            await tx.slotAdultTier.createMany({
              data: adultTiers.map((tier: any) => {
                const { id: tierId, ...tierData } = tier;
                return {
                  ...tierData,
                  slotId: clonedSlot.id
                };
              })
            });
          }

          if (childTiers.length > 0) {
            await tx.slotChildTier.createMany({
              data: childTiers.map((tier: any) => {
                const { id: tierId, ...tierData } = tier;
                return {
                  ...tierData,
                  slotId: clonedSlot.id
                };
              })
            });
          }
        }
      }
      
      for (const day of (itineraries as any[])) {
        const { id: dayId, activities, ...dayData } = day as {
          id: string;
          activities?: any[];
          [k: string]: any;
        };

        const createdItinerary = await tx.itinerary.create({
          data: {
            ...dayData,
            productId: clonedProduct.id,
          }
        });

        if (activities && activities.length > 0) {
          await tx.itineraryActivity.createMany({
            data: activities.map((act: any) => {
              const { id: actId, ...actData } = act;
              return {
                ...actData,
                itineraryId: createdItinerary.id,
                stopDuration: actData.stopDuration === null ? undefined : actData.stopDuration,
                duration: actData.duration, 
                durationUnit: actData.durationUnit, 
                isAdmissionIncluded: actData.isAdmissionIncluded, 
                locationLat: actData.locationLat || undefined,
                locationLng: actData.locationLng || undefined,
                locationPlaceId: actData.locationPlaceId || undefined,
                description: actData.description || '',
              };
            })
          });
        }
      }

      return await tx.product.findUniqueOrThrow({
        where: { id: clonedProduct.id },
        include: {
          packages: {
            include: {
              slots: {
                include: {
                  adultTiers: true,
                  childTiers: true
                }
              }
            }
          },
          itineraries: {
            include: {
              activities: {
                include: { attraction: true }
              }
            }
          },
        }
      });
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error cloning product:', error);
    next(error);
  }
});

// Clear pickup and meeting data for a product (Admin/Editor only)
router.delete('/:id/pickup-meeting-data', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const productId = req.params.id;

    // Verify product exists
    const product = await ProductService.findProduct({ id: productId });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Clear all pickup and meeting related data
    const updatedProduct = await ProductService.updateProduct(productId, {
      meetingPoint: null,
      meetingPoints: [],
      pickupLocationDetails: [],
      allowTravelersPickupPoint: false,
      pickupStartTime: null,
      additionalPickupDetails: null,
      doesTourEndAtMeetingPoint: false,
      endPoints: [],
    });

    res.json({ 
      message: 'Pickup and meeting data cleared successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Error clearing pickup and meeting data:', error);
    next(error);
  }
});

export default router;