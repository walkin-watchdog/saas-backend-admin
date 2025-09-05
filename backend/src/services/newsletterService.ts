import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class NewsletterService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findNewsletter(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.newsletter.findUnique({ where, include });
  }

  static async findManyNewsletters(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.newsletter.findMany(args);
  }

  static async createNewsletter(data: any) {
    const prisma = this.getPrisma();
    return prisma.newsletter.create({ data });
  }

  static async updateNewsletter(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.newsletter.update({ where: { id }, data });
  }

  static async deleteNewsletter(id: string) {
    const prisma = this.getPrisma();
    return prisma.newsletter.delete({ where: { id } });
  }

  static async countNewsletters(where?: any) {
    const prisma = this.getPrisma();
    if (!where) return prisma.newsletter.count();
    if (typeof where === 'object' && (
      'where' in where || 'orderBy' in where || 'cursor' in where ||
      'take' in where || 'skip' in where
    )) {
      return prisma.newsletter.count(where);
    }
    return prisma.newsletter.count({ where });
  }

  static async upsertNewsletter(where: any, create: any, update: any) {
    const prisma = this.getPrisma();
    return prisma.newsletter.upsert({ where, create, update });
  }

  static async updateManyNewsletters(where: any, data: any) {
    const prisma = this.getPrisma();
    return prisma.newsletter.updateMany({ where, data });
  }
}