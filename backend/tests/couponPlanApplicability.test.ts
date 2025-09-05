import { prisma } from '../src/utils/prisma';
import { PlatformCouponService } from '../src/services/platformCouponService';

describe('Coupon plan applicability', () => {
  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({});
    await prisma.platformCoupon.deleteMany({ where: { code: 'PLAN10' } });
    await prisma.platformUser.deleteMany({ where: { email: 'tester@example.com' } });
  });

  it('rejects redemption for incompatible plan', async () => {
    const admin = await prisma.platformUser.create({ data: { email: 'tester@example.com', name: 'Tester' } });
    await prisma.platformCoupon.create({
      data: {
        code: 'PLAN10',
        type: 'percent',
        amount: 10,
        duration: 'once',
        appliesToPlanIds: ['planA'],
        createdById: admin.id,
      },
    });

    const validation = await PlatformCouponService.validateCoupon('PLAN10', 'planB');
    expect(validation.valid).toBe(false);

    await expect(
      PlatformCouponService.redeemCoupon({
        couponCode: 'PLAN10',
        tenantId: 'tenant1',
        amountApplied: 5,
        planId: 'planB',
        currency: 'USD',
      })
    ).rejects.toThrow('Coupon not applicable to this plan');
  });
});