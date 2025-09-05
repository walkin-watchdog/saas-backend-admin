import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { TenantConfigService } from '../services/tenantConfigService';
import { BrandingConfig, BrandingScope } from '../types/tenantConfig';
import { resolveBranding } from '../services/brandingResolver';
import { logger } from './logger';

export interface TemplateContext {
  tenantId: string;
  branding?: BrandingConfig;
  brandingScope?: BrandingScope; // 'platform' | 'tenant'
  [key: string]: any;
}

export class TemplateLoader {
  private static templateCache = new Map<string, HandlebarsTemplateDelegate>();

  static async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate | null> {
    try {
      // Check cache first
      if (this.templateCache.has(templateName)) {
        return this.templateCache.get(templateName)!;
      }

      const templatePath = path.resolve(
        process.cwd(),
        'src',
        'templates',
        `${templateName}.hbs`
      );

      if (!fs.existsSync(templatePath)) {
        logger.warn('Template file not found', { templateName, templatePath });
        return null;
      }

      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);
      
      // Cache the compiled template
      this.templateCache.set(templateName, template);
      
      return template;
    } catch (error) {
      logger.error('Failed to load template', { templateName, error });
      return null;
    }
  }

  static async renderTemplate(
    templateName: string,
    context: TemplateContext
  ): Promise<string | null> {
    try {
      const template = await this.loadTemplate(templateName);
      if (!template) {
        return null;
      }

      // Resolve branding:
      // 1) If caller provided branding, use it as-is.
      // 2) Else if brandingScope provided, resolve accordingly.
      // 3) Else default to TENANT branding (legacy behavior).
      let branding: BrandingConfig;
      if (context.branding) {
        branding = { ...context.branding };
      } else if (context.brandingScope === 'platform') {
        const resolved = await resolveBranding('platform');
        branding = resolved as BrandingConfig;
      } else {
        // Default tenant scope
        branding = await this.getTenantBranding(context.tenantId);
      }

      // Merge context with branding
      const templateContext = {
        ...context,
        ...branding,
        // Legacy compatibility
        companyName: branding.companyName,
        companyEmail: branding.companyEmail,
        companyPhone: branding.companyPhone,
        companyAddress: branding.companyAddress,
        logoUrl: branding.logoUrl,
        footerHtml: branding.footerHtml,
        WHATSAPP_NUMBER: branding.whatsappNumber,
        FACEBOOK_URL: branding.facebookUrl,
        LINKEDIN_URL: branding.linkedinUrl,
        X_URL: branding.xUrl,
        INSTAGRAM_URL: branding.instagramUrl
      };

      return template(templateContext);
    } catch (error) {
      logger.error('Failed to render template', { templateName, tenantId: context.tenantId, error });
      throw error;
    }
  }

  static clearTemplateCache(): void {
    this.templateCache.clear();
    logger.info('Template cache cleared');
  }

  static async getTenantBranding(tenantId: string): Promise<BrandingConfig & { defaultsUsed?: boolean }> {
    try {
      const branding = await TenantConfigService.getBrandingConfig(tenantId);
      return branding;
    } catch (error) {
      const err: any = new Error('Branding configuration missing');
      err.code = 'BRANDING_CONFIG_MISSING';
      throw err;
    }
  }
}