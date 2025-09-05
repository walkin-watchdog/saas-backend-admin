import express from 'express';
import { computeStatus } from '../utils/availability';
import { ProductService } from '../services/productService';
import { z } from 'zod';
import { fetchExchangeRates } from './currency';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();


const searchSchema = z.object({
  query: z.string().optional(),
  type: z.enum(['TOUR','EXPERIENCE']).optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  attractionId: z.string().optional(),
  minPrice: z.string().transform(v=>parseFloat(v)).optional(),
  maxPrice: z.string().transform(v=>parseFloat(v)).optional(),
  adults: z.string().transform(v=>parseInt(v,10)).optional(),
  children: z.string().transform(v=>parseInt(v,10)).optional(),
  durations:z.string().optional(),
  date: z.string().optional(),
  tags: z.string().optional(),
  sort: z.string().optional(),
  page:  z.string().default('1').transform(v => parseInt(v, 10)),
  limit: z.string().default('12').transform(v => parseInt(v, 10)),
  currency: z.string().optional().default('INR'),
});

// Advanced search endpoint
router.get('/', async (req: TenantRequest, res, next) => {
  try {
    const {
      query, type, category, location, attractionId,
      minPrice, maxPrice,
      adults, children, durations,
      date, tags,
      sort: sortRaw,
      page, limit, currency
    } = searchSchema.parse(req.query);

    let sortBy = 'price_desc';
    switch ((sortRaw||'featured').toLowerCase()) {
      case 'price-asc':     sortBy = 'price_asc';     break;
      case 'price-desc':    sortBy = 'price_desc';    break;
      case 'duration-asc':  sortBy = 'duration_asc';  break;
      case 'duration-desc': sortBy = 'duration_desc'; break;
    }


    const where: any = {
      isActive: true,
    };

    if (attractionId) {
      where.attractionId = attractionId;
    }

    // Text search
    if (query) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          category: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          tags: {
            hasSome: [query],
          },
        },
      ];
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Location filter
    if (location) {
      where.location = {
        contains: location,
        mode: 'insensitive',
      };
    }

    if (adults != null || children != null) {
      const totalGuests = (adults||0) + (children||0);
      where.capacity = { gte: totalGuests };
    }

    // Tags filter
    if (tags) {
      const tagList = tags.split(',').map(tag => tag.trim());
      where.tags = {
        hasSome: tagList,
      };
    }

    // Sorting
    let orderBy: any = {};
    switch (sortBy) {
      case 'duration_asc':
        orderBy = { duration: 'asc' };
        break;
      case 'duration_desc':
        orderBy = { duration: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const rawProducts = await ProductService.findManyProducts({
      where,
      include: {
        packages: {
          where: { isActive: true },
        },
        reviews: {
          where: { isApproved: true },
          select: {
            id: true,
            rating: true,
          },
        },
        _count: {
          select: {
            bookings: {
              where: { status: 'CONFIRMED' },
            },
          },
        },
        availabilitySubranges: { orderBy: { startDate: 'asc' } },
        blockedDates: true,
      },
      orderBy,
    });

    const parseDurationToMinutes = (duration: string): number => {
      const lower = duration.toLowerCase();                                     
      if (lower === 'full day') return 1440;                                     
      const nums = duration.match(/\d+/g);                                      
      if (!nums) return 0;                                                        
      const n = parseInt(nums[0], 10);                                           
      if (lower.includes('day'))     return n * 1440;                            
      if (lower.includes('hour'))    return n * 60;                              
      if (lower.includes('minute'))  return n;                                   
      return n * 60;                                                              
    };

    let jsFiltered = rawProducts;
    if (date) {
      const target = new Date(date);
      jsFiltered = jsFiltered.filter(prod => {
        // Type assertion for computeStatus function
        const productData = prod as any;
        const { status } = computeStatus(productData, target);
        return status === 'AVAILABLE';
      });
    }

    if (category) {
      const mths = (p: any) => parseDurationToMinutes(p.duration);
      switch (category) {
        case '':
          break;
        case 'private':
          jsFiltered = jsFiltered.filter(p =>
            /private/i.test(p.tourType ?? '') ||
            /private/i.test(p.title ?? '') ||
            /private/i.test(p.description ?? '')
          );
          break;
        case 'short':
          jsFiltered = jsFiltered.filter(p => mths(p) <= 240);
          break;
        case 'half-day':
          jsFiltered = jsFiltered.filter(p => {
            const m = mths(p);
            return m >= 240 && m <= 480;
          });
          break;
        case 'full-day':
          jsFiltered = jsFiltered.filter(p => {
            const m = mths(p);
            return m >= 480 && m <= 1440;
          });
          break;
        case 'multi-day':
          jsFiltered = jsFiltered.filter(p => mths(p) > 1440);
          break;
      }
    }

    if (durations) {
      const buckets = durations.split(',').map(b => b.trim());
      jsFiltered = jsFiltered.filter(p => {
        const m = parseDurationToMinutes(p.duration ?? '');
        return buckets.some(b => {
          switch (b) {
            case 'up-1-hour':     return m <= 60;
            case '1-4-hours':     return m > 60   && m <= 240;
            case '4-hours-1-day': return m > 240  && m <= 1440;
            case '1-3-days':      return m > 1440 && m <= 4320;
            case '3-plus-days':   return m > 4320;
            default:              return false;
          }
        });
      });
    }

    // Helper function to convert price to target currency
    const convertPriceToTargetCurrency = async (price: number, fromCurrency: string, targetCurrency: string): Promise<number> => {
      if (fromCurrency === targetCurrency) {
        return price;
      }
      
      try {
        const rates = await fetchExchangeRates(fromCurrency);
        const rate = rates[targetCurrency];
        if (!rate) {
          console.warn(`Exchange rate not available for ${fromCurrency} to ${targetCurrency}, using original price`);
          return price;
        }
        return price * rate;
      } catch (error) {
        console.warn(`Failed to get exchange rate for ${fromCurrency} to ${targetCurrency}:`, error);
        return price;
      }
    };

    const getEffectivePrice = (pkg: any) => {
      // Type assertion and validation for package properties
      if (typeof pkg.basePrice !== 'number') return 0;
      
      if (pkg.discountType === 'percentage')
        return pkg.basePrice * (1 - (pkg.discountValue ?? 0) / 100);
      if (pkg.discountType === 'fixed')
        return pkg.basePrice - (pkg.discountValue ?? 0);
      return pkg.basePrice;
    };

    // Convert package prices to target currency for filtering and sorting
    let productsWithConvertedPrices: any[] = jsFiltered;
    if (currency && (minPrice != null || maxPrice != null || sortBy === 'price_asc' || sortBy === 'price_desc')) {
      // Process each product to add converted prices
      productsWithConvertedPrices = await Promise.all(
        jsFiltered.map(async (prod: any) => {
          const packagesWithConvertedPrices = await Promise.all(
            prod.packages.map(async (pkg: any) => {
              const effectivePrice = getEffectivePrice(pkg);
              const convertedPrice = await convertPriceToTargetCurrency(effectivePrice, pkg.currency, currency);
              return {
                ...pkg,
                convertedEffectivePrice: convertedPrice,
                originalEffectivePrice: effectivePrice
              };
            })
          );
          
          return {
            ...prod,
            packages: packagesWithConvertedPrices
          };
        })
      );
    } else {
      // If no currency conversion needed, just add the effective prices
      productsWithConvertedPrices = jsFiltered.map((prod: any) => ({
        ...prod,
        packages: prod.packages.map((pkg: any) => ({
          ...pkg,
          convertedEffectivePrice: getEffectivePrice(pkg),
          originalEffectivePrice: getEffectivePrice(pkg)
        }))
      }));
    }

    const priceFiltered = (minPrice != null || maxPrice != null)
      ? productsWithConvertedPrices.filter((prod: any) =>
          prod.packages.some((pkg: any) => {
            const price = pkg.convertedEffectivePrice;
            return (minPrice == null || price >= minPrice)
                && (maxPrice == null || price <= maxPrice);
          })
        )
      : productsWithConvertedPrices;

    let sorted = priceFiltered;
    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
      const direction = sortBy === 'price_asc' ? 1 : -1;
      sorted = [...priceFiltered].sort((a: any, b: any) =>
        direction *
        (Math.min(...a.packages.map((pkg: any) => pkg.convertedEffectivePrice))
         - Math.min(...b.packages.map((pkg: any) => pkg.convertedEffectivePrice)))
      );
    }

    const totalMatching = sorted.length;
    const start = (page - 1) * limit;
    const sliced = sorted.slice(start, start + limit);


    // Add average rating to each product
    const productsWithMeta = await Promise.all(sliced.map(async (prod: any) => {

      const avg = prod.reviews.length
        ? prod.reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / prod.reviews.length
        : 0;
      let lowBase = Infinity,
      lowEff  = Infinity;
      
      for (const pkg of prod.packages) {
        // Type assertion for package properties
        const packageData = pkg as any;
        if (typeof packageData.basePrice !== 'number') continue;
        
        // Use converted prices for the final response
        const base = currency && packageData.currency !== currency
          ? await convertPriceToTargetCurrency(packageData.basePrice, packageData.currency, currency)
          : packageData.basePrice;
        const eff = packageData.convertedEffectivePrice || getEffectivePrice(packageData);
        lowBase = Math.min(lowBase, base);
        lowEff  = Math.min(lowEff,  eff);
      }
      
      return {
        ...prod,
        averageRating: avg,
        totalBookings: prod._count.bookings,
        lowestPackagePrice:  lowBase === Infinity ? 0 : lowBase,
        lowestDiscountedPackagePrice: lowEff  < lowBase ? lowEff : null,
        lowestPackageCurrency: currency, // Add the target currency for frontend reference
      };
    }));

    res.json({
      products: productsWithMeta,
      pagination: {
        page,
        limit,
        total: totalMatching,
        pages:  Math.ceil(totalMatching / limit),
      },
      filters: {
        query, type, category, location, attractionId,
        minPrice, maxPrice, durations, date, tags,
        sort: sortRaw || 'featured',
        adults, children, currency,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get search suggestions
router.get('/suggestions', async (req: TenantRequest, res, next) => {
  try {
    const { q } = z.object({
      q: z.string().min(2),
    }).parse(req.query);

    const [destinations, categories, products] = await Promise.all([
      // Get unique locations
      ProductService.findManyProducts({
        where: {
          isActive: true,
          location: {
            contains: q,
            mode: 'insensitive',
          },
        },
        select: { location: true },
        distinct: ['location'],
        take: 5,
      }),
      // Get unique categories
      ProductService.findManyProducts({
        where: {
          isActive: true,
          category: {
            contains: q,
            mode: 'insensitive',
          },
        },
        select: { category: true },
        distinct: ['category'],
        take: 5,
      }),
      // Get product titles
      ProductService.findManyProducts({
        where: {
          isActive: true,
          title: {
            contains: q,
            mode: 'insensitive',
          },
        },
        select: { id: true, title: true, type: true },
        take: 5,
      }),
    ]);

    const suggestions = {
      destinations: destinations.map(d => ({
        type: 'destination',
        value: d.location,
        label: d.location,
      })),
      categories: categories.map(c => ({
        type: 'category',
        value: c.category,
        label: c.category,
      })),
      products: products.map(p => ({
        type: 'product',
        value: p.id,
        label: p.title,
        productType: p.type,
      })),
    };

    res.json(suggestions);
  } catch (error) {
    next(error);
  }
});

// Get popular searches
router.get('/popular', async (req: TenantRequest, res, next) => {
  try {
    const [popularDestinations, popularCategories] = await Promise.all([
      ProductService.groupByProducts({
        by: ['location'],
        where: { isActive: true },
        _count: { location: true },
        orderBy: { _count: { location: 'desc' } },
        take: 10,
      }),
      ProductService.groupByProducts({
        by: ['category'],
        where: { isActive: true },
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      destinations: popularDestinations.map((d: any) => ({
        name: d.location,
        count: d._count?.location,
      })),
      categories: popularCategories.map((c: any) => ({
        name: c.category,
        count: c._count?.category,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;