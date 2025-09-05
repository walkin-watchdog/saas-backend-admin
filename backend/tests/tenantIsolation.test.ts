import { PrismaClient } from '@prisma/client';
import { TenantService } from '../src/services/tenantService';

describe('Tenant Isolation', () => {
  let prisma: PrismaClient;
  let tenant1: any;
  let tenant2: any;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } }
    });

    // Create test tenants
    tenant1 = await prisma.tenant.create({
      data: {
        name: 'Tenant One',
        status: 'active',
        dedicated: false
      }
    });

    tenant2 = await prisma.tenant.create({
      data: {
        name: 'Tenant Two',
        status: 'active',
        dedicated: false
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.tenant.deleteMany({
      where: {
        id: { in: [tenant1.id, tenant2.id] }
      }
    });
    await prisma.$disconnect();
  });

  it('should isolate product data between tenants', async () => {
    // Create products for each tenant
    const product1 = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'Tenant 1 Product',
          productCode: 'T1P1',
          description: 'Product for tenant 1',
          location: 'Location 1',
          isActive: true,
          tenantId: tenant1.id
        }
      });
    });

    const product2 = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'Tenant 2 Product',
          productCode: 'T2P1',
          description: 'Product for tenant 2',
          location: 'Location 2',
          isActive: true,
          tenantId: tenant2.id
        }
      });
    });

    // Verify tenant 1 can only see their products
    const tenant1Products = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.findMany();
    });

    // Verify tenant 2 can only see their products
    const tenant2Products = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.product.findMany();
    });

    expect(tenant1Products).toHaveLength(1);
    expect(tenant1Products[0].id).toBe(product1.id);
    expect(tenant1Products[0].tenantId).toBe(tenant1.id);

    expect(tenant2Products).toHaveLength(1);
    expect(tenant2Products[0].id).toBe(product2.id);
    expect(tenant2Products[0].tenantId).toBe(tenant2.id);

    // Cleanup
    await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      await tenantPrisma.product.delete({ where: { id: product1.id } });
    });
    await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      await tenantPrisma.product.delete({ where: { id: product2.id } });
    });
  });

  it('should isolate booking data between tenants', async () => {
    // Create products first
    const product1 = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'Test Product 1',
          productCode: 'TP1',
          isActive: true,
          tenantId: tenant1.id
        }
      });
    });

    const product2 = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'Test Product 2',
          productCode: 'TP2',
          isActive: true,
          tenantId: tenant2.id
        }
      });
    });

    // Create bookings for each tenant
    const booking1 = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.booking.create({
        data: {
          bookingCode: 'T1B1',
          productId: product1.id,
          customerName: 'John Doe',
          customerEmail: 'john@tenant1.com',
          customerPhone: '+1234567890',
          adults: 2,
          children: 0,
          totalAmount: 1000,
          bookingDate: new Date(),
          currency: 'USD',
          tenantId: tenant1.id
        }
      });
    });

    const booking2 = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.booking.create({
        data: {
          bookingCode: 'T2B1',
          productId: product2.id,
          customerName: 'Jane Smith',
          customerEmail: 'jane@tenant2.com',
          customerPhone: '+0987654321',
          adults: 3,
          children: 1,
          totalAmount: 1500,
          bookingDate: new Date(),
          currency: 'EUR',
          tenantId: tenant2.id
        }
      });
    });

    // Verify isolation
    const tenant1Bookings = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.booking.findMany();
    });

    const tenant2Bookings = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.booking.findMany();
    });

    expect(tenant1Bookings).toHaveLength(1);
    expect(tenant1Bookings[0].id).toBe(booking1.id);
    expect(tenant1Bookings[0].tenantId).toBe(tenant1.id);

    expect(tenant2Bookings).toHaveLength(1);
    expect(tenant2Bookings[0].id).toBe(booking2.id);
    expect(tenant2Bookings[0].tenantId).toBe(tenant2.id);

    // Cleanup
    await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      await tenantPrisma.booking.delete({ where: { id: booking1.id } });
      await tenantPrisma.product.delete({ where: { id: product1.id } });
    });
    await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      await tenantPrisma.booking.delete({ where: { id: booking2.id } });
      await tenantPrisma.product.delete({ where: { id: product2.id } });
    });
  });

  it('should prevent cross-tenant data access via RLS', async () => {
    // Test that RLS policies prevent cross-tenant access at the SQL level
    const product1 = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'RLS Test Product',
          productCode: 'RLSTP',
          isActive: true,
          tenantId: tenant1.id
        }
      });
    });

    // Try to access tenant1's product from tenant2's context
    const crossTenantAccess = await TenantService.withTenantContext(tenant2, async (tenantPrisma) => {
      return tenantPrisma.product.findUnique({
        where: { id: product1.id }
      });
    });

    // Should return null due to RLS
    expect(crossTenantAccess).toBeNull();

    // Cleanup
    await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      await tenantPrisma.product.delete({ where: { id: product1.id } });
    });
  });

  it('should allow same tenant access', async () => {
    // Create and access product within same tenant context
    const product = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.create({
        data: {
          title: 'Same Tenant Product',
          productCode: 'STP',
          isActive: true,
          tenantId: tenant1.id
        }
      });
    });

    const retrievedProduct = await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      return tenantPrisma.product.findUnique({
        where: { id: product.id }
      });
    });

    expect(retrievedProduct).not.toBeNull();
    expect(retrievedProduct!.id).toBe(product.id);
    expect(retrievedProduct!.tenantId).toBe(tenant1.id);

    // Cleanup
    await TenantService.withTenantContext(tenant1, async (tenantPrisma) => {
      await tenantPrisma.product.delete({ where: { id: product.id } });
    });
  });
});