import { PrismaClient } from '@prisma/client';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';

export class PaymentDbService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async updatePaymentByRazorpayOrderId(razorpayOrderId: string, data: any) {
    const prisma = this.getPrisma();
    const tenantId = getTenantId();
    return prisma.payment.update({
      where: { tenantId_razorpayOrderId: { tenantId, razorpayOrderId } },
      data
    });
  }

  static async findPayment(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.payment.findUnique({ where, include });
  }

  static async findFirstPayment(args: any) {
    const prisma = this.getPrisma();
    return prisma.payment.findFirst(args);
  }

  static async findManyPayments(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.payment.findMany(args);
  }

  static async createPayment(data: any) {
    const prisma = this.getPrisma();
    return prisma.payment.create({ data });
  }

  static async updatePayment(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.payment.update({ where: { id }, data });
  }

  static async deletePayment(id: string) {
    const prisma = this.getPrisma();
    return prisma.payment.delete({ where: { id } });
  }

  static async upsertPayment(where: any, create: any, update: any) {
    const prisma = this.getPrisma();
    return prisma.payment.upsert({ where, create, update });
  }

  static async findIdempotencyKey(key: string) {
    const prisma = this.getPrisma();
    const tenantId = getTenantId();
    return prisma.idempotencyKey.findFirst({
      where: { tenantId, key }
    });
  }

  static async createIdempotencyKey(data: any) {
    const prisma = this.getPrisma();
    return prisma.idempotencyKey.create({ data });
  }
}