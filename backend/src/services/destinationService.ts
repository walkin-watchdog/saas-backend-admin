import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class DestinationService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findDestination(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.destination.findUnique({ where, include });
  }

  static async findManyDestinations(args: {
    select?: any
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.destination.findMany(args);
  }

  static async createDestination(data: any) {
    const prisma = this.getPrisma();
    return prisma.destination.create({ data });
  }

  static async updateDestination(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.destination.update({ where: { id }, data });
  }

  static async deleteDestination(id: string) {
    const prisma = this.getPrisma();
    return prisma.destination.delete({ where: { id } });
  }
}