import { prisma } from '../../src/utils/prisma';
import { PlatformCouponService } from '../../src/services/platformCouponService';

// Tests for coupon limits, expiry, deactivation and idempotent redemption

describe('PlatformCoupon constraints', () => {
  let admin: any;

  beforeAll(async () => {
    admin = await prisma.platformUser.create({
      data: { email: 'couponadmin@example.com', name: 'Coupon Admin' }
    });
  });

  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({
      where: { coupon: { code: { in: ['LIMIT1', 'EXPIRED', 'INACTIVE', 'IDEMP'] } } }
    });
    await prisma.platformCoupon.deleteMany({
      where: { code: { in: ['LIMIT1', 'EXPIRED', 'INACTIVE', 'IDEMP'] } }
    });
    await prisma.platformUser.deleteMany({ where: { email: 'couponadmin@example.com' } });
  });

  it('enforces max redemptions limit', async () => {
    await prisma.platformCoupon.create({
      data: {
        code: 'LIMIT1',
        type: 'percent',
        amount: 10,
        duration: 'once',
        maxRedemptions: 1,
        createdById: admin.id
      }
    });

    await PlatformCouponService.redeemCoupon({
      couponCode: 'LIMIT1',
      tenantId: 'tenant1',
      amountApplied: 5,
      currency: 'USD'
    });

    await expect(
      PlatformCouponService.redeemCoupon({
        couponCode: 'LIMIT1',
        tenantId: 'tenant2',
        amountApplied: 5,
        currency: 'USD'
      })
    ).rejects.toThrow('Maximum redemptions reached');

    const validation = await PlatformCouponService.validateCoupon('LIMIT1');
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Maximum redemptions reached');
  });

  it('rejects expired coupons', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.platformCoupon.create({
      data: {
        code: 'EXPIRED',
        type: 'percent',
        amount: 10,
        duration: 'once',
        redeemBy: past,
        createdById: admin.id
      }
    });

    const validation = await PlatformCouponService.validateCoupon('EXPIRED');
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Coupon has expired');

    await expect(
      PlatformCouponService.redeemCoupon({
        couponCode: 'EXPIRED',
        tenantId: 'tenant1',
        amountApplied: 5,
        currency: 'USD'
      })
    ).rejects.toThrow('Coupon has expired');
  });

  it('rejects inactive coupons', async () => {
    const coupon = await prisma.platformCoupon.create({
      data: {
        code: 'INACTIVE',
        type: 'percent',
        amount: 10,
        duration: 'once',
        createdById: admin.id
      }
    });

    await PlatformCouponService.deactivateCoupon(coupon.id, admin.id);

    const validation = await PlatformCouponService.validateCoupon('INACTIVE');
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Coupon is inactive');

    await expect(
      PlatformCouponService.redeemCoupon({
        couponCode: 'INACTIVE',
        tenantId: 'tenant1',
        amountApplied: 5,
        currency: 'USD'
      })
    ).rejects.toThrow('Coupon is inactive');
  });

  it('supports idempotent redemption via redemptionKey', async () => {
    await prisma.platformCoupon.create({
      data: {
        code: 'IDEMP',
        type: 'percent',
        amount: 10,
        duration: 'once',
        createdById: admin.id
      }
    });

    const redemptionKey = 'key-123';

    const first = await PlatformCouponService.redeemCoupon({
      couponCode: 'IDEMP',
      tenantId: 'tenant1',
      amountApplied: 5,
      redemptionKey,
      currency: 'USD'
    });

    const second = await PlatformCouponService.redeemCoupon({
      couponCode: 'IDEMP',
      tenantId: 'tenant1',
      amountApplied: 5,
      redemptionKey,
      currency: 'USD'
    });

    expect(second?.id).toBe(first?.id);

    const redemptionCount = await prisma.couponRedemption.count({
      where: { coupon: { code: 'IDEMP' } },
    });
    expect(redemptionCount).toBe(1);
  });
});