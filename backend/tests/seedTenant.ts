import { PrismaClient, UserRole } from '@prisma/client';
import { withAdminRls } from '../src/utils/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function seedTenant(tenantName: string) {
  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      status: 'active',
      dedicated: false
    }
  });

  // Create admin user for this tenant
  const hashedPassword = await bcrypt.hash('testpassword', 10);
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `admin@${tenantName.toLowerCase()}.test`,
      password: hashedPassword,
      name: `${tenantName} Admin`,
      role: UserRole.ADMIN
    }
  });

  // Create sample destination
  const destination = await prisma.destination.create({
    data: {
      tenantId: tenant.id,
      name: `${tenantName} Destination`,
      slug: `${tenantName.toLowerCase()}-destination`,
      tagline: `Explore ${tenantName}`,
      description: `Beautiful destination in ${tenantName}`,
      image: 'https://example.com/image.jpg',
      bannerImage: 'https://example.com/banner.jpg',
      highlights: ['Beautiful scenery', 'Rich culture']
    }
  });

  // Create sample product
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      title: `${tenantName} Tour`,
      productCode: `${tenantName.toUpperCase()}001`,
      slug: `${tenantName.toLowerCase()}-tour`,
      description: `Amazing tour in ${tenantName}`,
      type: 'TOUR',
      location: `${tenantName} City`,
      duration: '8 hours',
      capacity: 20,
      isActive: true,
      destinationId: destination.id,
      availabilityStartDate: new Date(),
      availabilityEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    }
  });

  // Create sample package
  const pkg = await prisma.package.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      name: 'Standard Package',
      description: 'Standard tour package',
      basePrice: 100,
      currency: 'USD',
      maxPeople: 10,
      inclusions: ['Guide', 'Transport'],
      isActive: true
    }
  });

  return {
    tenant,
    adminUser,
    destination,
    product,
    package: pkg
  };
}

export async function cleanupTenant(tenantId: string) {
  // Ensure cascade deletes are not blocked by RLS on child tables
  return withAdminRls(async (tx) => {
    await tx.tenant.delete({ where: { id: tenantId } });
  });
}

export async function cleanupTenantByName(name: string) {
  const t = await prisma.tenant.findFirst({ where: { name } });
  if (t) {
    await cleanupTenant(t.id);
  }
}