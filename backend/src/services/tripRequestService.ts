import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class TripRequestService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findTripRequest(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.findUnique({ where, include });
  }

  static async findManyTripRequests(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.findMany(args);
  }

  static async createTripRequest(data: any) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.create({ data });
  }

  static async updateTripRequest(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.update({ where: { id }, data });
  }

  static async deleteTripRequest(id: string) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.delete({ where: { id } });
  }

  static async countTripRequests(where?: any) {
    const prisma = this.getPrisma();
    if (!where) return prisma.tripRequest.count();
    if (typeof where === 'object' && (
      'where' in where || 'orderBy' in where || 'cursor' in where ||
      'take' in where || 'skip' in where
    )) {
      return prisma.tripRequest.count(where);
    }
    return prisma.tripRequest.count({ where });
  }

  static async groupByTripRequests(args: any) {
    const prisma = this.getPrisma();
    return prisma.tripRequest.groupBy(args);
  }
}