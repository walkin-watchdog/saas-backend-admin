import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class BookingService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findBooking(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.booking.findUnique({ where, include });
  }

  static async findManyBookings(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.booking.findMany(args);
  }

  static async createBooking(data: any) {
    const prisma = this.getPrisma();
    return prisma.booking.create({ data });
  }

  static async updateBooking(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.booking.update({ where: { id }, data });
  }

  static async deleteBooking(id: string) {
    const prisma = this.getPrisma();
    return prisma.booking.delete({ where: { id } });
  }

  static async countBookings(where?: any) {
    const prisma = this.getPrisma();
    // Accept either a plain "where" object or full Count args
    if (!where) return prisma.booking.count();
    if (typeof where === 'object' && (
      'where' in where || 'orderBy' in where || 'cursor' in where ||
      'take' in where || 'skip' in where
    )) {
      // Already a Count args object
      return prisma.booking.count(where);
    }
    // Plain where filter
    return prisma.booking.count({ where });
  }

  static async groupByBookings(args: any) {
    const prisma = this.getPrisma();
    return prisma.booking.groupBy(args);
  }

  static async aggregateBookings(args: any) {
    const prisma = this.getPrisma();
    return prisma.booking.aggregate(args);
  }
}