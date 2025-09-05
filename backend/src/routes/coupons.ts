import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { fetchExchangeRates } from './currency';
import { CouponService } from '../services/couponService';
import { ProductService } from '../services/productService';
import { BookingService } from '../services/bookingService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();


const couponSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().min(0),
  currency: z.string(),
  minAmount: z.number().min(0).nullable().optional(),
  maxDiscount: z.number().min(0).nullable().optional(),
  usageLimit: z.number().nullable().optional(),
  products: z.array(z.string()).optional(),
  validFrom: z.string().transform(str => new Date(str)),
  validUntil: z.string().transform(str => new Date(str))
});

// Get coupon usage details (Admin only)
router.get('/:id/usage', authenticate, authorize(['ADMIN', 'EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const { id } = req.params;

    const coupon = await CouponService.findCoupon({ id });
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    const usageRows = await CouponService.findManyCouponUsage({ couponId: id });

    const bookingIds = usageRows
      .map(u => u.bookingId)
      .filter((b): b is string => !!b);

    const bookings = bookingIds.length
      ? await BookingService.findManyBookings({
          where: { id: { in: bookingIds } },
          select: { id: true, currency: true }
        })
      : [];

    const bookingCurrencyMap = Object.fromEntries(
      bookings.map(b => [b.id, b.currency])
    );

    const usageWithCurrency = usageRows.map(u => ({
      ...u,
      currency: bookingCurrencyMap[u.bookingId!] || coupon.currency
    }));

    res.json(usageWithCurrency);
  } catch (error) {
    next(error);
  }
});

// Validate coupon (public)
router.post('/validate', async (req: TenantRequest, res, next) => {
  try {
    const { code, amount, productId, currency } = z.object({
      code: z.string(),
      amount: z.number().min(0),
      currency: z.string().regex(/^[A-Za-z]{3}$/).transform(s => s.toUpperCase()).default('INR'),
      productId: z.string().optional()
    }).parse(req.body);

    const coupon = await CouponService.findCouponByCode(code);

    if (!coupon || !coupon.isActive) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return res.status(400).json({ error: 'Coupon has expired' });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ error: 'Coupon usage limit exceeded' });
    }

    // Check product restrictions
    if (coupon.products && coupon.products.length > 0) {
      // If coupon is restricted to certain products
      if (!productId) {
        return res.status(400).json({ error: 'Product ID is required for this coupon' });
      } else if (!coupon.products.includes(productId)) {
        return res.status(400).json({ error: 'Coupon is not valid for this product' });
      }
    }

    const orderCur  = currency;
    const couponCur = (coupon.currency || 'INR').toUpperCase();
  
    let orderAmtInCouponCur = amount;
    if (orderCur !== couponCur) {
      const rates = await fetchExchangeRates(orderCur);
      const rate  = rates[couponCur];
      if (!rate) return res.status(400).json({ error:`Unsupported currency ${couponCur}` });
      orderAmtInCouponCur = amount * rate;
    }
  
    if (coupon.minAmount && orderAmtInCouponCur < coupon.minAmount) {
      return res.status(400).json({
        error: `Minimum amount of ${couponCur} ${coupon.minAmount} required`
      });
    }

    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (amount * coupon.value) / 100;

      if (coupon.maxDiscount) {
        let maxDiscOrderCur = coupon.maxDiscount;
        if (couponCur !== orderCur) {
          const rates = await fetchExchangeRates(couponCur);
          const rate  = rates[orderCur];
          if (!rate) {
            return res.status(400).json({ error:`Unsupported currency ${orderCur}` });
          }
          maxDiscOrderCur = coupon.maxDiscount * rate;
        }
        if (discount > maxDiscOrderCur) {
            discount = maxDiscOrderCur;
        }
      }
    } else {
      let valueInOrderCur: number;
      if (couponCur === orderCur) {
        valueInOrderCur = coupon.value;
      } else {
        const rates = await fetchExchangeRates(couponCur);
        const rate  = rates[orderCur];
        if (!rate) {
          return res.status(400).json({ error: `Unsupported currency ${orderCur}` });
        }
        valueInOrderCur = coupon.value * rate;
      }

      discount = valueInOrderCur;

      if (coupon.maxDiscount) {
          let maxDiscOrderCur: number;
        if (couponCur === orderCur) {
          maxDiscOrderCur = coupon.maxDiscount;
        } else {
          const rates = await fetchExchangeRates(couponCur);
          const rate  = rates[orderCur];
          maxDiscOrderCur = coupon.maxDiscount * rate;
        }
        if (discount > maxDiscOrderCur) {
          discount = maxDiscOrderCur;
        }
      }
    }
    const round  = (n:number) => Math.round(n*100)/100;
    discount     = round(discount);

    res.json({
      valid: true,
      discount,
      finalAmount: round(Math.max(0, amount - discount)),
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        currency: coupon.currency
      }
    });
  } catch (error) {
    next(error);
  }
});

// Apply coupon to booking
router.post('/apply', async (req: TenantRequest, res, next) => {
  try {
    const { code, bookingId, bookingCode, customerId, customerName, customerEmail, discountAmount } = z.object({
      code: z.string(),
      bookingId: z.string().optional(),
      bookingCode: z.string().optional(),
      customerId: z.string().optional(),
      customerName: z.string(),
      customerEmail: z.string().email(),
      discountAmount: z.number().min(0)
    }).parse(req.body);

    const coupon = await CouponService.findCouponByCode(code);

    if (!coupon || !coupon.isActive) {
      return res.status(404).json({ error: 'Invalid coupon code' });
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return res.status(400).json({ error: 'Coupon has expired' });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ error: 'Coupon usage limit exceeded' });
    }

    // Record coupon usage
    const couponUsage = await CouponService.createCouponUsage({
      data: {
        couponId: coupon.id,
        bookingId,
        bookingCode,
        customerId,
        customerName,
        customerEmail,
        discountAmount
      }
    });

    // Increment used count
    await CouponService.updateCoupon(coupon.id, { usedCount: { increment: 1 } });

    res.status(201).json({
      success: true,
      message: 'Coupon applied successfully',
      couponUsage
    });
  } catch (error) {
    next(error);
  }
});

// Get product-level discounts for special offers page
router.get('/product-discounts', async (req: TenantRequest, res, next) => {
  try {
    const packages = await ProductService.findManyPackages({
      where: {
        isActive: true,
        OR: [
          { discountType: { not: 'none' } },
          { discountValue: { gt: 0 } }
        ]
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            productCode: true,
            type: true,
            location: true,
            images: true,
            capacity: true,
            duration: true,
            description: true,
            isActive: true
          }
        }
      }
    });
    
    // Group by product and find the highest discount for each
    const productMap = new Map();
    
    packages.forEach(pkg => {
      // Type assertion for package with included product relation
      const packageData = pkg as any;
      if (!packageData.product?.isActive || typeof packageData.basePrice !== 'number') return;
      
      if (!productMap.has(packageData.product.id)) {
        productMap.set(packageData.product.id, {
          ...packageData.product,
          package: packageData,
          discountValue: packageData.discountType === 'percentage' ? (packageData.discountValue ?? 0) : ((packageData.discountValue ?? 0) / packageData.basePrice) * 100
        });
      } else {
        const currentProduct = productMap.get(packageData.product.id);
        const newDiscount = packageData.discountType === 'percentage' ? (packageData.discountValue ?? 0) : ((packageData.discountValue ?? 0) / packageData.basePrice) * 100;
        
        if (newDiscount && newDiscount > currentProduct.discountValue) {
          productMap.set(packageData.product.id, {
            ...currentProduct,
            package: packageData,
            discountValue: newDiscount
          });
        }
      }
    });
    
    res.json(Array.from(productMap.values()));
  } catch (error) {
    next(error);
  }
});

// Get all coupons (Admin only)
router.get('/', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const coupons = await CouponService.findManyCoupons({
      orderBy: { createdAt: 'desc' }
    });

    res.json(coupons);
  } catch (error) {
    next(error);
  }
});

// Create coupon (Admin only)
router.post('/', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const data = couponSchema.parse(req.body);
    
    // Format the code to uppercase
    const codeUpperCase = data.code.toUpperCase();
    
    // Check if the code already exists
    const existingCoupon = await CouponService.findCouponByCode(codeUpperCase);
    
    if (existingCoupon) {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }
    
    // Create the coupon
    const coupon = await CouponService.createCoupon({
      code: codeUpperCase,
      description: data.description,
      type: data.type,
      value: data.value,
      minAmount: data.minAmount,
      maxDiscount: data.maxDiscount,
      currency: data.currency.toUpperCase(),
      usageLimit: data.usageLimit,
      products: data.products || [],
      validFrom: data.validFrom,
      validUntil: data.validUntil
    });

    res.status(201).json(coupon);
  } catch (error) {
    next(error);
  }
});

// Update coupon (Admin only)
router.put('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    const data = couponSchema.partial().parse(req.body);
   
    // If code is being updated, check for uniqueness
    if (data.code) {
      const codeUpperCase = data.code.toUpperCase();
      const existingCoupon = await CouponService.findManyCoupons({
        where: { 
          code: codeUpperCase,
          id: { not: req.params.id }
        },
        take: 1
      });
      
      if (existingCoupon.length > 0) {
        return res.status(400).json({ error: 'Coupon code already exists' });
      }
      
      data.code = codeUpperCase;
    }
    
    const coupon = await CouponService.updateCoupon(req.params.id, data);

    res.json(coupon);
  } catch (error) {
    next(error);
  }
});

// Delete coupon (Admin only)
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: TenantRequest, res, next) => {
  try {
    await CouponService.deleteCoupon(req.params.id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;