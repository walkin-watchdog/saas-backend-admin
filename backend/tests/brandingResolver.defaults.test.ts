jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: {
    getBrandingConfig: jest.fn().mockRejectedValue(
      Object.assign(new Error('Branding configuration missing'), { code: 'BRANDING_CONFIG_MISSING' })
    )
  }
}));

jest.mock('../src/utils/prisma', () => ({
  prisma: {
    tenant: { findUnique: jest.fn().mockResolvedValue({ dedicated: true }) },
    logo: { findFirst: jest.fn() }
  }
}));

import { BrandingResolver } from '../src/services/brandingResolver';

describe('BrandingResolver resolveTheme', () => {
  it('returns platform defaults when branding config is missing', async () => {
    process.env.LOGO_URL = 'https://example.com/logo.png';
    process.env.PRIMARY_COLOR = '#123456';
    process.env.SECONDARY_COLOR = '#654321';
    process.env.TERTIARY_COLOR = '#abcdef';

    const theme = await BrandingResolver.resolveTheme({ tenantId: 't1' });

    expect(theme).toEqual({
      logoUrl: 'https://example.com/logo.png',
      colors: {
        primary: '#123456',
        secondary: '#654321',
        tertiary: '#abcdef'
      },
      scope: 'platform',
      defaultsUsed: true
    });
  });
});