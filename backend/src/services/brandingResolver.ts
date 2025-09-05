import { BrandingConfig, BrandingScope, TaxConfig } from '../types/tenantConfig';
import { TenantConfigService } from './tenantConfigService';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { DomainService } from './domainService';

// Environment fallback keys for platform-wide branding (no DB requirement).
const PLATFORM_DEFAULTS: Partial<BrandingConfig> = {
  companyName: process.env.PLATFORM_COMPANY_NAME ?? process.env.COMPANY_NAME ?? 'Your Platform',
  companyEmail: process.env.PLATFORM_COMPANY_EMAIL ?? process.env.COMPANY_EMAIL ?? 'support@example.com',
  companyPhone: process.env.PLATFORM_COMPANY_PHONE ?? process.env.COMPANY_PHONE ?? '',
  companyAddress: process.env.PLATFORM_COMPANY_ADDRESS ?? process.env.COMPANY_ADDRESS ?? '',
  logoUrl: process.env.PLATFORM_LOGO_URL ?? process.env.LOGO_URL ?? '',
  footerHtml: process.env.PLATFORM_FOOTER_HTML ?? process.env.FOOTER_HTML ?? '',
};

export async function resolveBranding(
  scope: BrandingScope,
  tenantId?: string
): Promise<Partial<BrandingConfig>> {
  if (scope === 'platform') {
    // Prefer explicit platform config if available later; fall back to env now.
    return PLATFORM_DEFAULTS;
  }
  // tenant scope must not fall back to env
  if (!tenantId) {
    const err: any = new Error('Branding configuration missing');
    err.code = 'BRANDING_CONFIG_MISSING';
    throw err;
  }
  const brand = await TenantConfigService.getBrandingConfig(tenantId);
  // Validate required fields
  if (!brand.companyName) {
    const err: any = new Error('Branding configuration missing required fields');
    err.code = 'BRANDING_CONFIG_MISSING';
    throw err;
  }
  return brand;
}

export class BrandingResolver {
/**
 * Resolve theme (logo + colors) for:
 *  - a verified admin host (login screen, no auth), or
 *  - an authenticated tenant session (inside admin)
 */
  static async resolveTheme(opts: { host?: string; tenantId?: string }) {
    // Platform defaults
    const platformDefaults = {
      logoUrl: process.env.LOGO_URL || '',
      colors: {
        primary: process.env.PRIMARY_COLOR || '#0F62FE',
        secondary: process.env.SECONDARY_COLOR || '#111827',
        tertiary: process.env.TERTIARY_COLOR || '#6B7280'
      },
      scope: 'platform' as const,
      defaultsUsed: true
    };

    const preferTenantLogo = async (tenantId: string, brand: BrandingConfig) => {
      // If logoUrl is missing OR equals the platform default, try the latest tenant logo.
      const platformLogo = process.env.LOGO_URL || '';
      let logoUrl = brand.logoUrl;
      if (!logoUrl || logoUrl === platformLogo) {
        const latestLogo = await prisma.logo.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' }
        });
        if (latestLogo?.imageUrl) {
          logoUrl = latestLogo.imageUrl;
        }
      }
      return logoUrl || platformLogo;
    };

    // Prefer host if provided AND verified admin host
    if (opts.host && await DomainService.isVerifiedAdminHost(opts.host)) {
      const tenantId = await DomainService.getTenantIdByAdminHost(opts.host);
      if (tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (tenant?.dedicated) { // enterprise
          const brand = await TenantConfigService.getBrandingConfig(tenantId);
          // Prefer tenant's uploaded logo when platform default is in place
          brand.logoUrl = await preferTenantLogo(tenantId, brand);
          if (brand.whiteLabelBranding) {
            return {
              logoUrl: brand.logoUrl,
              colors: {
                primary: brand.primaryColor || platformDefaults.colors.primary,
                secondary: brand.secondaryColor || platformDefaults.colors.secondary,
                tertiary: brand.tertiaryColor || platformDefaults.colors.tertiary
              },
              scope: 'tenant' as const,
              defaultsUsed: Boolean(brand.defaultsUsed)
            };
          }
        }
      }
    }

    // If a tenant session is present (inside admin), allow enterprise branding irrespective of host
    if (opts.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: opts.tenantId } });
      if (tenant?.dedicated) {
        const brand = await TenantConfigService.getBrandingConfig(opts.tenantId);
        // Prefer tenant's uploaded logo when platform default is in place
        brand.logoUrl = await preferTenantLogo(opts.tenantId, brand);
        if (brand.whiteLabelBranding) {
          return {
            logoUrl: brand.logoUrl,
            colors: {
              primary: brand.primaryColor || platformDefaults.colors.primary,
              secondary: brand.secondaryColor || platformDefaults.colors.secondary,
              tertiary: brand.tertiaryColor || platformDefaults.colors.tertiary
            },
            scope: 'tenant' as const,
            defaultsUsed: Boolean(brand.defaultsUsed)
          };
        }
      }
    }

    // Fallback to platform theme
    return platformDefaults;
  }
}

export async function resolveTax(
  scope: BrandingScope,
  tenantId?: string
): Promise<Partial<TaxConfig> | null> {
  if (scope === 'platform') {
    const percent = process.env.PLATFORM_TAX_PERCENT ? Number(process.env.PLATFORM_TAX_PERCENT) : undefined;
    const jurisdiction = process.env.PLATFORM_TAX_JURISDICTION || undefined;
    return (percent || jurisdiction) ? { percent, jurisdiction } : null;
  }
  if (!tenantId) return null;
  try {
    return await TenantConfigService.getConfig<Partial<TaxConfig>>(tenantId, 'tax');
  } catch {
    return null;
  }
}