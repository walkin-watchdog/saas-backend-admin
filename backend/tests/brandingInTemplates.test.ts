// tests/brandingInTemplates.test.ts
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/utils/prisma';
import { TemplateLoader } from '../src/utils/templateLoader';
import { TenantConfigService } from '../src/services/tenantConfigService';
import { TenantService } from '../src/services/tenantService';

describe('Branding injected in templates', () => {
  let tenant: { id: string };
  let tenantNoBrand: { id: string };
  const tplDir = path.resolve(process.cwd(), 'src', 'templates', 'email');
  const tplPath = path.join(tplDir, 'welcome.hbs');

  beforeAll(async () => {
    // ensure template exists where TemplateLoader expects it
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(
      tplPath,
      `
<!doctype html>
<html>
  <body>
    <img src="{{logoUrl}}" alt="logo" />
    <h1>Welcome, {{name}}!</h1>
    <p>From {{companyName}} — contact us at {{companyEmail}}.</p>
    {{{footerHtml}}}
  </body>
</html>
`.trim()
    );

    // create a tenant
    tenant = await prisma.tenant.create({
      data: { name: 'MailBrand', status: 'active' },
      select: { id: true },
    });

    tenantNoBrand = await prisma.tenant.create({
      data: { name: 'NoBrand', status: 'active' },
      select: { id: true },
    });

    // set branding configs INSIDE tenant context (RLS-friendly)
    await TenantService.withTenantContext(tenant as any, async () => {
      await TenantConfigService.createConfig(tenant.id, 'companyName', 'ACME Inc.' as any);
      await TenantConfigService.createConfig(tenant.id, 'companyEmail', 'hello@acme.co' as any);
      await TenantConfigService.createConfig(tenant.id, 'logoUrl', 'https://cdn/logo.png' as any);
      await TenantConfigService.createConfig(tenant.id, 'footerHtml', '<i>Thanks!</i>' as any);
    });
  });

  afterAll(async () => {
    // cleanup template file
    try { fs.unlinkSync(tplPath); } catch {}
    // optional: remove the (now empty) dir
    try { fs.rmdirSync(tplDir); } catch {}

    // cleanup tenant (FKs cascade)
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantNoBrand.id } }).catch(() => {});
  });

  it('invoice/email HTML contains branding fields', async () => {
    // render inside tenant context so TemplateLoader reads with the right app.tenantId
    const html = await TenantService.withTenantContext(tenant as any, async () => {
      return await TemplateLoader.renderTemplate('email/welcome', {
        tenantId: tenant.id,
        name: 'User',
      });
    });

    expect(html).toBeTruthy();
    expect(html!).toMatch(/ACME Inc\./);
    expect(html!).toMatch(/hello@acme\.co/);
    expect(html!).toMatch(/logo\.png/);
    expect(html!).toMatch(/Thanks!/);
  });

  it('fails to render when tenant branding missing', async () => {
    await expect(
      TenantService.withTenantContext(tenantNoBrand as any, async () => {
        return await TemplateLoader.renderTemplate('email/welcome', {
          tenantId: tenantNoBrand.id,
          name: 'User',
        });
      })
    ).rejects.toHaveProperty('code', 'BRANDING_CONFIG_MISSING');
  });
});