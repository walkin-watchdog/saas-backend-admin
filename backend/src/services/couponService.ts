import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class CouponService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findCoupon(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.coupon.findUnique({ where, include });
  }

  static async findCouponByCode(code: string) {
    const prisma = this.getPrisma();
    return prisma.coupon.findFirst({
      where: { code: code.toUpperCase() }
    });
  }

  static async findManyCoupons(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.coupon.findMany(args);
  }

  static async createCoupon(data: any) {
    const prisma = this.getPrisma();
    return prisma.coupon.create({ data });
  }

  static async updateCoupon(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.coupon.update({ where: { id }, data });
  }

  static async deleteCoupon(id: string) {
    const prisma = this.getPrisma();
    return prisma.coupon.delete({ where: { id } });
  }

  static async createCouponUsage(data: any) {
    const prisma = this.getPrisma();
    return prisma.couponUsage.create({ data });
  }

  static async findManyCouponUsage(where: any) {
    const prisma = this.getPrisma();
    return prisma.couponUsage.findMany({ where, orderBy: { createdAt: 'desc' } });
  }
}