import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class AvailabilityService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  // Subrange methods
  static async findSubrange(id: string) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.findUnique({ where: { id } });
  }

  static async findFirstSubrange(where: any) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.findFirst({ where });
  }

  static async findManySubranges(args: {
    select?: any;
    include?: any;
    where?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.findMany(args);
  }

  static async createSubrange(data: any) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.create({ data });
  }

  static async updateSubrange(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.update({ where: { id }, data });
  }

  static async deleteSubrange(id: string) {
    const prisma = this.getPrisma();
    return prisma.productAvailabilitySubrange.delete({ where: { id } });
  }

  // Package slot methods
  static async findManyPackageSlots(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.packageSlot.findMany(args);
  }

  // Blocked dates methods
  static async findFirstBlockedDate(where: any) {
    const prisma = this.getPrisma();
    return prisma.blockedDate.findFirst({ where });
  }

  static async findManyBlockedDates(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.blockedDate.findMany(args);
  }

  static async createBlockedDate(data: any) {
    const prisma = this.getPrisma();
    return prisma.blockedDate.create({ data });
  }

  static async updateBlockedDate(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.blockedDate.update({ where: { id }, data });
  }

  static async deleteBlockedDate(id: string) {
    const prisma = this.getPrisma();
    return prisma.blockedDate.delete({ where: { id } });
  }
}