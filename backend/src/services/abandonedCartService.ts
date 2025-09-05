import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class AbandonedCartService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findAbandonedCart(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.findUnique({ where, include });
  }

  static async findFirstAbandonedCart(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.findFirst({ where, include });
  }

  static async findManyAbandonedCarts(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.findMany(args);
  }

  static async createAbandonedCart(data: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.create({ data });
  }

  static async updateAbandonedCart(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.update({ where: { id }, data });
  }

  static async deleteAbandonedCart(id: string) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.delete({ where: { id } });
  }

  static async deleteManyAbandonedCarts(where: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.deleteMany({ where });
  }

  static async countAbandonedCarts(where?: any) {
    const prisma = this.getPrisma();
    if (!where) return prisma.abandonedCart.count();
    if (typeof where === 'object' && (
      'where' in where || 'orderBy' in where || 'cursor' in where ||
      'take' in where || 'skip' in where
    )) {
      return prisma.abandonedCart.count(where);
    }
    return prisma.abandonedCart.count({ where });
  }

  static async upsertAbandonedCart(where: any, create: any, update: any) {
    const prisma = this.getPrisma();
    return prisma.abandonedCart.upsert({ where, create, update });
  }
}