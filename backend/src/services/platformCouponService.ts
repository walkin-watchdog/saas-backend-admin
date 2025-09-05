import { prisma } from '../utils/prisma';
import { PlatformCouponData } from '../types/platform';
import { AuditService } from './auditService';
import crypto from 'crypto';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class PlatformCouponService {
  static async createCoupon(data: PlatformCouponData, createdById: string) {
    // Validate required fields based on coupon type
    if (data.type === 'percent' && data.amount === undefined) {
      throw new Error('Amount is required for percent type coupons');
    }
    if (data.type === 'fixed' && (data.amountUsd === undefined || data.amountInr === undefined)) {
      throw new Error('Amount in USD and INR is required for fixed type coupons');
    }

    const coupon = await prisma.platformCoupon.create({
      data: {
        ...data,
        amount: data.type === 'fixed' ? 0 : data.amount!,
        createdById
      }
    });

    await AuditService.log({
      platformUserId: createdById,
      action: 'coupon.created',
      resource: 'coupon',
      resourceId: coupon.id,
      changes: data
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.COUPON_CREATED, { couponId: coupon.id });

    return coupon;
  }

  static async findCoupons(filters: {
    active?: boolean;
    type?: string;
    planId?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.type) where.type = filters.type;
    if (filters.planId) where.appliesToPlanIds = { has: filters.planId };

    return prisma.platformCoupon.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            redemptions: true
          }
        }
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async findCouponByCode(code: string) {
    return prisma.platformCoupon.findUnique({
      where: { code },
      include: {
        redemptions: true
      }
    });
  }

  static async updateCoupon(id: string, data: Partial<PlatformCouponData>, updatedById: string) {
    const coupon = await prisma.platformCoupon.update({
      where: { id },
      data
    });

    await AuditService.log({
      platformUserId: updatedById,
      action: 'coupon.updated',
      resource: 'coupon',
      resourceId: id,
      changes: data
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.COUPON_UPDATED, { couponId: id });

    return coupon;
  }

  static async deactivateCoupon(id: string, platformUserId: string) {
    const coupon = await prisma.platformCoupon.update({
      where: { id },
      data: { active: false }
    });

    await AuditService.log({
      platformUserId,
      action: 'coupon.deactivated',
      resource: 'coupon',
      resourceId: id
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.COUPON_DEACTIVATED, { couponId: id });

    return coupon;
  }

  static async toggleCouponActive(id: string, platformUserId: string) {
    const existing = await prisma.platformCoupon.findUnique({ where: { id } });
    if (!existing) {
      const err: any = new Error('COUPON_NOT_FOUND');
      err.status = 404;
      throw err;
    }
    const coupon = await prisma.platformCoupon.update({
      where: { id },
      data: { active: !existing.active }
    });

    await AuditService.log({
      platformUserId,
      action: coupon.active ? 'coupon.activated' : 'coupon.deactivated',
      resource: 'coupon',
      resourceId: id
    });
    PlatformEventBus.publish(
      coupon.active ? PLATFORM_EVENTS.COUPON_ACTIVATED : PLATFORM_EVENTS.COUPON_DEACTIVATED,
      { couponId: id }
    );

    return coupon;
  }

  static async validateCoupon(
    code: string,
    planId?: string,
    subscriptionId?: string,
    currency?: string,
  ): Promise<{
    valid: boolean;
    coupon?: any;
    error?: string;
    currency?: string;
  }> {
    const coupon = await this.findCouponByCode(code);
    
    if (!coupon) {
      return { valid: false, error: 'Coupon not found' };
    }

    if (!coupon.active) {
      return { valid: false, error: 'Coupon is inactive' };
    }

    if (coupon.redeemBy && new Date() > coupon.redeemBy) {
      return { valid: false, error: 'Coupon has expired' };
    }

    if (coupon.maxRedemptions && coupon.redemptions.length >= coupon.maxRedemptions) {
      return { valid: false, error: 'Maximum redemptions reached' };
    }

    if (coupon.appliesToPlanIds.length > 0 && !planId) {
      return { valid: false, error: 'Plan ID required to validate this coupon' };
    }

    if (planId && coupon.appliesToPlanIds.length > 0 && !coupon.appliesToPlanIds.includes(planId)) {
      return { valid: false, error: 'Coupon not applicable to this plan' };
    }

    let effectiveCurrency = currency;
    if (subscriptionId) {
      const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
      const subCurrency = sub?.currency || 'USD';
      // If a currency is provided and doesn't match the subscription, override it
      if (effectiveCurrency && effectiveCurrency !== subCurrency) {
        effectiveCurrency = subCurrency;
      } else {
        effectiveCurrency = effectiveCurrency || subCurrency;
      }
    }
    if (!effectiveCurrency) effectiveCurrency = 'USD';

    if (coupon.type === 'fixed') {
      if (coupon.amountUsd == null || coupon.amountInr == null) {
        return { valid: false, error: 'Coupon missing currency amounts' };
      }
      const fixed = effectiveCurrency === 'INR' ? coupon.amountInr : coupon.amountUsd;
      if (!fixed) {
        return { valid: false, error: 'Coupon not applicable to this currency' };
      }
    }

    if (subscriptionId) {
      const entitlement = await prisma.couponEntitlement.findUnique({
        where: {
          subscriptionId_couponId: { subscriptionId, couponId: coupon.id },
        },
      });
      if (entitlement) {
        if (coupon.duration === 'once' && (entitlement.remainingPeriods ?? 0) !== 0) {
          return { valid: false, error: 'Coupon already applied to this subscription' };
        }
        if (coupon.duration === 'repeating' && (entitlement.remainingPeriods ?? 0) > 0) {
          return { valid: false, error: 'Coupon already applied to this subscription' };
        }
        if (coupon.duration === 'forever') {
          return { valid: false, error: 'Coupon already applied to this subscription' };
        }
      }
    } else if (coupon.duration !== 'once') {
      return { valid: false, error: 'Subscription ID required to validate this coupon' };
    }

    return { valid: true, coupon, currency: effectiveCurrency };
  }

  static async redeemCoupon(data: {
    couponCode: string;
    tenantId: string;
    subscriptionId?: string;
    invoiceId?: string;
    amountApplied: number;
    planId?: string;
    redeemedByPlatformUserId?: string;
    redemptionKey?: string;
    currency: string;
  }) {
    const redemptionKey = data.redemptionKey || crypto.randomUUID();

    try {
      const coupon = await prisma.platformCoupon.findUnique({ where: { code: data.couponCode } });
      if (!coupon) throw new Error('Coupon not found');

      // Re-validate coupon constraints for safety
      const existingRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
      if (!coupon.active) throw new Error('Coupon is inactive');
      if (coupon.redeemBy && new Date() > coupon.redeemBy) throw new Error('Coupon has expired');
      if (coupon.maxRedemptions && existingRedemptions >= coupon.maxRedemptions) {
        throw new Error('Maximum redemptions reached');
      }
      if (coupon.appliesToPlanIds.length > 0) {
        if (!data.planId) {
          throw new Error('Coupon not applicable to this plan');
        }
        if (!coupon.appliesToPlanIds.includes(data.planId)) {
          throw new Error('Coupon not applicable to this plan');
        }
      }

      if (coupon.type === 'fixed') {
        const fixed = data.currency === 'INR' ? coupon.amountInr : coupon.amountUsd;
        if (!fixed) {
          throw new Error('Coupon not applicable to this currency');
        }
      }
      
      if (data.subscriptionId) {
        const existingEntitlement = await prisma.couponEntitlement.findUnique({
          where: {
            subscriptionId_couponId: {
              subscriptionId: data.subscriptionId,
              couponId: coupon.id,
            },
          },
        });
        if (existingEntitlement) {
          throw new Error('Coupon already applied to this subscription');
        }
        await prisma.couponEntitlement.create({
          data: {
            tenantId: data.tenantId,
            subscriptionId: data.subscriptionId,
            couponId: coupon.id,
            remainingPeriods:
              coupon.duration === 'once'
                ? 1
                : coupon.duration === 'repeating'
                ? coupon.durationInMonths || 0
                : null,
            unlimited: coupon.duration === 'forever',
          },
        });
      }

      const redemption = await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          tenantId: data.tenantId,
          subscriptionId: data.subscriptionId,
          invoiceId: data.invoiceId,
          amountApplied: data.amountApplied,
          currency: data.currency,
          redeemedByPlatformUserId: data.redeemedByPlatformUserId,
          redemptionKey,
        },
      });

      if (data.redeemedByPlatformUserId) {
        await AuditService.log({
          platformUserId: data.redeemedByPlatformUserId,
          tenantId: data.tenantId,
          action: 'coupon.redeemed',
          resource: 'coupon',
          resourceId: coupon.id,
          changes: { amountApplied: data.amountApplied, currency: data.currency }
        });
      }

      PlatformEventBus.publish(PLATFORM_EVENTS.COUPON_REDEEMED, {
        tenantId: data.tenantId,
        couponId: coupon.id,
        currency: data.currency,
      });

      return redemption;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Redemption already exists (idempotent)
        return prisma.couponRedemption.findUnique({
          where: { redemptionKey }
        });
      }
      throw error;
    }
  }

  static async getCouponUsage(couponId: string) {
    return prisma.couponRedemption.findMany({
      where: { couponId },
      include: {
        redeemedBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { redeemedAt: 'desc' }
    });
  }

  static previewDiscount(coupon: any, amount: number, currency: string): number {
    if (coupon.type === 'percent') {
      return Math.round((amount * coupon.amount) / 100);
    }
    const fixed = currency === 'INR' ? coupon.amountInr : coupon.amountUsd;
    return Math.min(Math.round(fixed || 0), amount);
  }

  static async previewCoupon(
    code: string,
    planId: string,
    amount: number,
    currency?: string,
    subscriptionId?: string,
  ) {
    const validation = await this.validateCoupon(code, planId, subscriptionId, currency);
    if (!validation.valid || !validation.coupon) {
      return { valid: false, error: validation.error };
    }
    const effectiveCurrency = validation.currency || currency || 'USD';
    const discount = this.previewDiscount(validation.coupon, amount, effectiveCurrency);
    return { valid: true, discount, finalAmount: amount - discount };
  }
}