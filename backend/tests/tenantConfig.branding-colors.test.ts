// tests/tenantConfig.branding-colors.test.ts
process.env.PRIMARY_COLOR  = '#FF00FF';
process.env.SECONDARY_COLOR = '#121212';
process.env.TERTIARY_COLOR  = '#343434';
import { prisma } from '../src/utils/prisma';
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('TenantConfigService: new color keys + flag', () => {
  let tenant: any;
  const old = {
    PRIMARY_COLOR: process.env.PRIMARY_COLOR,
    SECONDARY_COLOR: process.env.SECONDARY_COLOR,
    TERTIARY_COLOR: process.env.TERTIARY_COLOR,
  };

  beforeAll(async () => {
    process.env.PRIMARY_COLOR = '#FF00FF';
    process.env.SECONDARY_COLOR = '#121212';
    process.env.TERTIARY_COLOR  = '#343434';

    tenant = await prisma.tenant.create({ data: { name: 'BrandingKeysCo', status: 'active' } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    // restore env
    process.env.PRIMARY_COLOR = old.PRIMARY_COLOR;
    process.env.SECONDARY_COLOR = old.SECONDARY_COLOR;
    process.env.TERTIARY_COLOR  = old.TERTIARY_COLOR;
  });

  it('fails without tenant branding set', async () => {
    expect(TenantConfigService.isBrandingKey('primaryColor')).toBe(true);
    expect(TenantConfigService.isBrandingKey('secondaryColor')).toBe(true);
    expect(TenantConfigService.isBrandingKey('tertiaryColor')).toBe(true);
    expect(TenantConfigService.isBrandingKey('whiteLabelBranding')).toBe(true);

    await expect(TenantConfigService.getBrandingConfig(tenant.id)).rejects.toHaveProperty(
      'code',
      'BRANDING_CONFIG_MISSING'
    );
  });

  it('tenant overrides win when set', async () => {
    await TenantConfigService.createConfig(tenant.id, 'primaryColor', '#010203' as any);
    await TenantConfigService.createConfig(tenant.id, 'secondaryColor', '#040506' as any);
    await TenantConfigService.createConfig(tenant.id, 'tertiaryColor', '#070809' as any);
    await TenantConfigService.createConfig(tenant.id, 'whiteLabelBranding', true as any);

    const branding = await TenantConfigService.getBrandingConfig(tenant.id);
    expect(branding.primaryColor).toBe('#010203');
    expect(branding.whiteLabelBranding).toBe(true);
  });
});