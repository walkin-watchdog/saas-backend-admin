import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { withTenantContext } from './middleware/tenantMiddleware';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = await bcrypt.hash('password', 10);
  let tenant = await prisma.tenant.findFirst({ where: { name: 'default' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'default', status: 'active', dedicated: false },
    });
  }

  // Seed an admin user scoped to that tenant
  await withTenantContext({ id: tenant.id } as any, async (tenantPrisma) => {
    return (tenantPrisma as typeof prisma).user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'test@example.com' } },
      update: {},
      create: {
        email: 'test@example.com',
        password,
        name: 'Test User',
        role: UserRole.ADMIN,
        tenantId: tenant.id,
      },
    });
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
