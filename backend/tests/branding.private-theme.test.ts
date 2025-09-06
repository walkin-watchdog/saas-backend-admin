// tests/branding.private-theme.test.ts
process.env.PRIMARY_COLOR = '#00AACC';
process.env.SECONDARY_COLOR = '#222222';
process.env.TERTIARY_COLOR  = '#999999';
process.env.LOGO_URL        = 'https://cdn.example/platform-logo.png';

import request from 'supertest';
const { app } = require('../src/app');
import { prisma } from '../src/utils/prisma';
import { signAccess } from '../src/utils/jwt';
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('Private branding resolver (/api/tenant/branding)', () => {
  let dedicatedTenant: any;
  let sharedTenant: any;
  let admin1: any, admin2: any;
  let t1: string, t2: string;

  beforeAll(async () => {
    dedicatedTenant = await prisma.tenant.create({ data: { name: 'BrandingPrivCo', status: 'active', dedicated: true } });
    sharedTenant    = await prisma.tenant.create({ data: { name: 'BrandingShared', status: 'active', dedicated: false } });

    admin1 = await prisma.user.create({
      data: { tenantId: dedicatedTenant.id, email: 'a1@co', password: 'hash', name: 'A1', role: 'ADMIN', platformAdmin: false },
    });
    admin2 = await prisma.user.create({
      data: { tenantId: sharedTenant.id, email: 'a2@co', password: 'hash', name: 'A2', role: 'ADMIN', platformAdmin: false },
    });

    t1 = signAccess({ sub: admin1.id, tenantId: dedicatedTenant.id, role: 'ADMIN', platformAdmin: false, tokenVersion: 0 });
    t2 = signAccess({ sub: admin2.id, tenantId: sharedTenant.id,    role: 'ADMIN', platformAdmin: false, tokenVersion: 0 });
  });

  afterAll(async () => {
    await prisma.logo.deleteMany({ where: { tenantId: { in: [dedicatedTenant.id, sharedTenant.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [admin1.id, admin2.id] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [dedicatedTenant.id, sharedTenant.id] } } }).catch(() => {});
  });

  test('dedicated tenant + whiteLabelBranding=true returns tenant theme irrespective of host', async () => {
    await TenantConfigService.createConfig(dedicatedTenant.id, 'whiteLabelBranding', true as any);
    await TenantConfigService.createConfig(dedicatedTenant.id, 'primaryColor',   '#135' as any);
    await TenantConfigService.createConfig(dedicatedTenant.id, 'secondaryColor', '#246' as any);
    await TenantConfigService.createConfig(dedicatedTenant.id, 'tertiaryColor',  '#357' as any);
    // No logoUrl in config -> fallback to latest logo record
    await prisma.logo.create({ data: { tenantId: dedicatedTenant.id, imageUrl: 'https://cdn.example/dedicated-logo.png' } });

    const res = await request(app)
      .get('/api/tenant/branding')
      .set('x-api-key', dedicatedTenant.apiKey)
      .set('Authorization', `Bearer ${t1}`);

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('tenant');
    expect(res.body.logoUrl).toContain('dedicated-logo.png');
    expect(res.body.colors).toEqual({
      primary: '#135', secondary: '#246', tertiary: '#357',
    });
  });

  test('non-dedicated tenant OR whiteLabelBranding=false -> platform defaults', async () => {
    await TenantConfigService.createConfig(sharedTenant.id, 'whiteLabelBranding', true as any);
    await TenantConfigService.createConfig(sharedTenant.id, 'primaryColor', '#abcdef' as any);

    // Because tenant is not "dedicated", resolver should fallback to platform theme
    const res = await request(app)
      .get('/api/tenant/branding')
      .set('x-api-key', sharedTenant.apiKey)
      .set('Authorization', `Bearer ${t2}`);

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(res.body.colors.primary).toBe('#00AACC');

    // Also cover explicit false flag on a dedicated tenant
    await TenantConfigService.createConfig(dedicatedTenant.id, 'whiteLabelBranding', false as any);
    const res2 = await request(app)
      .get('/api/tenant/branding')
      .set('x-api-key', dedicatedTenant.apiKey)
      .set('Authorization', `Bearer ${t1}`);
    expect(res2.body.scope).toBe('platform');
  });

  test('accessible without auth when using api key', async () => {
    const res = await request(app)
      .get('/api/tenant/branding')
      .set('x-api-key', dedicatedTenant.apiKey);
    expect(res.status).toBe(200);
  });
});