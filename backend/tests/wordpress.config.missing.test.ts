import { prisma } from '../src/utils/prisma';
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('WordPress config required', () => {
  let tenant: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'NoWP', status: 'active', dedicated: false } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  test('missing wordpress config throws', async () => {
    await expect(TenantConfigService.getWordpressConfig(tenant.id)).rejects.toMatchObject({ code: 'WORDPRESS_CONFIG_MISSING' });
  });
});
