// tests/tenantConfig.brandingKeys.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('Branding keys + masking', () => {
  let tenant: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'BrandCo', status: 'active' } });

    // Seed branding configs for this tenant
    await TenantConfigService.createConfig(tenant.id, 'companyName', 'BrandCo LLC' as any);
    await TenantConfigService.createConfig(tenant.id, 'companyEmail', 'hello@brand.co' as any);
    await TenantConfigService.createConfig(tenant.id, 'logoUrl', 'https://cdn/logo.png' as any);
    await TenantConfigService.createConfig(tenant.id, 'footerHtml', '<b>© BrandCo</b>' as any);
    await TenantConfigService.createConfig(tenant.id, 'facebookUrl', 'https://fb/brand' as any);
    await TenantConfigService.createConfig(tenant.id, 'linkedinUrl', 'https://li/brand' as any);
    await TenantConfigService.createConfig(tenant.id, 'xUrl', 'https://x.com/brand' as any);
    await TenantConfigService.createConfig(tenant.id, 'instagramUrl', 'https://ig/brand' as any);
    await TenantConfigService.createConfig(tenant.id, 'whatsappNumber', '+1234567' as any);
  });

  it('GET branding/public returns non-encrypted branding JSON', async () => {
    const res = await request(app)
      .get('/api/tenant/config/branding/public')
      // IMPORTANT: use tenant.apiKey, not tenant.id
      .set('x-api-key', tenant.apiKey);

    expect(res.status).toBe(200);

    const b = res.body;
    expect(b.companyName).toBe('BrandCo LLC');
    expect(b.companyEmail).toBe('hello@brand.co');
    expect(b.logoUrl).toContain('logo.png');
    expect(b.footerHtml).toContain('BrandCo');

    ['facebookUrl', 'linkedinUrl', 'xUrl', 'instagramUrl', 'whatsappNumber'].forEach((k) =>
      expect(b[k]).toBeTruthy()
    );
  });
});