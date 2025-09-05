import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class ReviewService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findReview(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.review.findUnique({ where, include });
  }

  static async findManyReviews(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.review.findMany(args);
  }

  static async createReview(data: any) {
    const prisma = this.getPrisma();
    return prisma.review.create({ data });
  }

  static async updateReview(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.review.update({ where: { id }, data });
  }

  static async deleteReview(id: string) {
    const prisma = this.getPrisma();
    return prisma.review.delete({ where: { id } });
  }

  static async countReviews(where?: any) {
    const prisma = this.getPrisma();
    return prisma.review.count({ where });
  }

  static async updateManyReviews(where: any, data: any) {
    const prisma = this.getPrisma();
    return prisma.review.updateMany({ where, data });
  }
}