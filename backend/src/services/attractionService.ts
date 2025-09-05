import { PrismaClient, Prisma, Attraction } from '@prisma/client';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';

// Type for attraction with count and proper relations
type AttractionWithCount = Attraction & {
  destination?: any;
  _count?: {
    itineraries: number;
  };
};

export class AttractionService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findAttraction(
    where: Prisma.AttractionWhereUniqueInput | string | { slug: string },
    options?: { include?: any }
  ): Promise<AttractionWithCount | null> {
    const prisma = this.getPrisma();
    
    // Handle different input types
    let whereClause: Prisma.AttractionWhereUniqueInput;
    
    if (typeof where === 'string') {
      whereClause = { id: where };
    } else if ('slug' in where && where.slug) {
      // For slug queries, we need the tenantId from context
      const tenantId = getTenantId();
      if (!tenantId) {
        throw new Error('Tenant context is required for slug-based queries');
      }
      whereClause = { tenantId_slug: { tenantId, slug: where.slug as string } };
    } else {
      whereClause = where as Prisma.AttractionWhereUniqueInput;
    }
    
    return prisma.attraction.findUnique({
      where: whereClause,
      ...options
    });
  }

  static async findManyAttractions(args: {
    select?: any;
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
  } = {}): Promise<AttractionWithCount[]> {
    const prisma = this.getPrisma();
    return prisma.attraction.findMany(args);
  }

  static async createAttraction(
    data: Omit<Prisma.AttractionCreateInput, 'tenant'> & { tenantId?: string }
  ): Promise<Attraction> {
    const prisma = this.getPrisma();
    const { tenantId, ...attractionData } = data;
    
    // Use the provided tenantId or get it from context
    const finalTenantId = tenantId || getTenantId();
    if (!finalTenantId) {
      throw new Error('Tenant ID is required for creating attractions');
    }
    
    return prisma.attraction.create({
      data: {
        ...attractionData,
        tenant: { connect: { id: finalTenantId } }
      }
    });
  }

  static async updateAttraction(
    id: string,
    data: Omit<Prisma.AttractionUpdateInput, 'tenant'>
  ): Promise<Attraction> {
    const prisma = this.getPrisma();
    return prisma.attraction.update({ where: { id }, data });
  }

  static async deleteAttraction(id: string): Promise<Attraction> {
    const prisma = this.getPrisma();
    return prisma.attraction.delete({ where: { id } });
  }
}