import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class ProductService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findProduct(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.product.findUnique({ where, include });
  }

  static async findManyProducts(args: {
    select?: any
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
    distinct?: any;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.product.findMany(args);
  }

  static async createProduct(data: any) {
    const prisma = this.getPrisma();
    return prisma.product.create({ data });
  }

  static async updateProduct(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.product.update({ where: { id }, data });
  }

  static async deleteProduct(id: string) {
    const prisma = this.getPrisma();
    return prisma.product.delete({ where: { id } });
  }

  static async countProducts(where?: any) {
    const prisma = this.getPrisma();
    if (!where) return prisma.product.count();
    if (typeof where === 'object' && (
      'where' in where || 'orderBy' in where || 'cursor' in where ||
      'take' in where || 'skip' in where
    )) {
      return prisma.product.count(where);
    }
    return prisma.product.count({ where });
  }

  static async groupByProducts(args: any) {
    const prisma = this.getPrisma();
    return prisma.product.groupBy(args);
  }

  // Expose Prisma client for complex operations
  static getClient(): PrismaClient {
    return this.getPrisma();
  }

  // Package methods
  static async createPackage(productId: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.package.create({
      data: {
        ...data,
        product: { connect: { id: productId } }
      }
    });
  }

  static async updatePackage(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.package.update({ where: { id }, data });
  }

  static async deletePackage(id: string) {
    const prisma = this.getPrisma();
    return prisma.package.delete({ where: { id } });
  }

  // Itinerary methods
  static async createItinerary(productId: string, data: any) {
    const prisma = this.getPrisma();
    const { activities, ...itineraryData } = data;
    
    return prisma.itinerary.create({
      data: {
        ...itineraryData,
        product: { connect: { id: productId } },
        activities: activities ? {
          create: activities.map((activity: any, index: number) => ({
            ...activity,
            order: activity.order ?? index
          }))
        } : undefined
      },
      include: {
        activities: {
          orderBy: { order: 'asc' },
          include: {
            attraction: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });
  }

  static async updateItinerary(id: string, data: any) {
    const prisma = this.getPrisma();
    const { activities, ...itineraryData } = data;
    
    return prisma.itinerary.update({
      where: { id },
      data: {
        ...itineraryData,
        activities: activities ? {
          deleteMany: {},
          create: activities.map((activity: any, index: number) => ({
            ...activity,
            order: activity.order ?? index
          }))
        } : undefined
      },
      include: {
        activities: {
          orderBy: { order: 'asc' },
          include: {
            attraction: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });
  }

  static async deleteItinerary(id: string) {
    const prisma = this.getPrisma();
    return prisma.itinerary.delete({ where: { id } });
  }

  // Package query methods
  static async findManyPackages(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.package.findMany(args);
  }

   /**
   * Returns the next productCode for a given prefix by finding the
   * lexicographically last existing code and incrementing its numeric suffix.
   * This avoids collisions when there are gaps/deletes.
   *
   * Example: prefix "XYZDEL" -> "XYZDEL0004"
   */
  static async nextProductCode(
    prefix: string,
    width: number = 4,
    opts: { excludeCopies?: boolean } = {}
  ): Promise<string> {
    const prisma = this.getPrisma();
    const where: any = { productCode: { startsWith: prefix } };
    if (opts.excludeCopies !== false) {
      where.NOT = { productCode: { contains: '-COPY' } };
    }
    const last = await prisma.product.findFirst({
      where,
      orderBy: { productCode: 'desc' },
      select: { productCode: true },
    });
    const nextNum = last?.productCode ? (parseInt(last.productCode.slice(prefix.length), 10) + 1) : 1;
    return `${prefix}${String(nextNum).padStart(width, '0')}`;
  }  

  // Add transaction support for complex operations
  static async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T> {
    const prisma = this.getPrisma();
    return prisma.$transaction<T>(fn, options);
  }

}