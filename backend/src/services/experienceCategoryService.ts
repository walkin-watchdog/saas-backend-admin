import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class ExperienceCategoryService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findExperienceCategory(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.experienceCategory.findUnique({ where, include });
  }

  static async findManyExperienceCategories(args: {
    select?: any
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.experienceCategory.findMany(args);
  }

  static async createExperienceCategory(data: any) {
    const prisma = this.getPrisma();
    return prisma.experienceCategory.create({ data });
  }

  static async updateExperienceCategory(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.experienceCategory.update({ where: { id }, data });
  }

  static async deleteExperienceCategory(id: string) {
    const prisma = this.getPrisma();
    return prisma.experienceCategory.delete({ where: { id } });
  }
}