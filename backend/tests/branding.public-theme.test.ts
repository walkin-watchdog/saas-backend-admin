// tests/branding.public-theme.test.ts
// Set predictable platform defaults for fallback assertions
process.env.PRIMARY_COLOR = '#AA11AA';
process.env.SECONDARY_COLOR = '#0B0B0B';
process.env.TERTIARY_COLOR  = '#444444';
process.env.LOGO_URL        = 'https://cdn.example/platform-logo.png';

import request from 'supertest';
// require AFTER env so app picks up env-based defaults (pattern used in public tests)
const { app } = require('../src/app'); // :contentReference[oaicite:4]{index=4}
import { prisma } from '../src/utils/prisma';
import { signAccess } from '../src/utils/jwt'; // :contentReference[oaicite:5]{index=5}
import { TenantConfigService } from '../src/services/tenantConfigService';

jest.mock('dns/promises', () => ({
  resolveTxt: jest.fn(),
}));
const { resolveTxt } = require('dns/promises') as { resolveTxt: jest.Mock };

const asMock = (fn: any) => fn as jest.Mock;

describe('Public branding resolver (/public/branding)', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'BrandingPubCo', status: 'active', dedicated: true },
    });

    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@branding.co',
        password: 'hash',
        name: 'Admin',
        role: 'ADMIN',
        platformAdmin: true, // needed to create domains via route (matches your CRUD test) :contentReference[oaicite:6]{index=6}
      },
    });

    token = signAccess({
      sub: admin.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      platformAdmin: true,
      tokenVersion: 0,
    });
  });

  afterAll(async () => {
    await prisma.logo.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
    await prisma.tenantDomain.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    asMock(resolveTxt).mockReset();
  });

  async function createAdminHost(domain: string, opts?: { verify?: boolean }) {
    // Create via route the way your tests do (x-api-key + auth), keeping RLS happy. :contentReference[oaicite:7]{index=7}
    const created = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ domain, isActive: true, isAdminHost: true });
    expect([201, 409]).toContain(created.status);
    const row = created.body.id
      ? created.body
      : await prisma.tenantDomain.findUniqueOrThrow({ where: { domain } });

    if (opts?.verify) {
      // Start verification
      const start = await request(app)
        .post(`/api/tenant/domains/${row.id}/verify/start`)
        .set('x-api-key', tenant.apiKey)
        .set('Authorization', `Bearer ${token}`);
      expect(start.status).toBe(201);
      const tokenValue = start.body.token as string;
      // Make DNS contain the token
      asMock(resolveTxt).mockResolvedValueOnce([[`ww-admin-verification=${tokenValue}`]]);
      // Verify now
      const verify = await request(app)
        .post(`/api/tenant/domains/${row.id}/verify`)
        .set('x-api-key', tenant.apiKey)
        .set('Authorization', `Bearer ${token}`);
      expect(verify.status).toBe(200);
      expect(verify.body.verified).toBe(true);
    }
    return row;
  }

  test('returns tenant theme for verified admin host with whiteLabelBranding=true', async () => {
    const host = 'admin.brandco.test';
    await createAdminHost(host, { verify: true });

    // Configure branding (new keys)
    await TenantConfigService.createConfig(tenant.id, 'whiteLabelBranding', true as any);
    await TenantConfigService.createConfig(tenant.id, 'primaryColor',   '#112233' as any);
    await TenantConfigService.createConfig(tenant.id, 'secondaryColor', '#445566' as any);
    await TenantConfigService.createConfig(tenant.id, 'tertiaryColor',  '#778899' as any);
    // No logoUrl set in config: fallback should pick latest logo
    await prisma.logo.create({ data: { tenantId: tenant.id, imageUrl: 'https://cdn.example/tenant-logo-1.png' } });
    await new Promise(r => setTimeout(r, 10));
    await prisma.logo.create({ data: { tenantId: tenant.id, imageUrl: 'https://cdn.example/tenant-logo-2.png' } });

    const res = await request(app)
      .get('/public/branding')
      .set('x-forwarded-host', `${host}, something-else.example`);

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('tenant');
    expect(typeof res.body.defaultsUsed).toBe('boolean');
    expect(res.body.logoUrl).toContain('tenant-logo-2.png'); // latest by createdAt
    expect(res.body.colors).toEqual({
      primary:   '#112233',
      secondary: '#445566',
      tertiary:  '#778899',
    });
    // Caching headers present
    expect(res.headers['cache-control']).toContain('max-age=60');
    expect(res.headers['vary']).toContain('Host');
    expect(res.headers.etag).toBeTruthy();

    // ETag 304 on repeat
    const res304 = await request(app)
      .get('/public/branding')
      .set('x-forwarded-host', host)
      .set('if-none-match', res.headers.etag as string);
    expect(res304.status).toBe(304);
  });

  test('falls back to platform defaults when host is NOT verified', async () => {
    const host = 'admin2.brandco.test';
    await createAdminHost(host, { verify: false });

    const res = await request(app)
      .get('/public/branding')
      .set('x-forwarded-host', host);

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(res.body.logoUrl).toBe(process.env.LOGO_URL);
    expect(res.body.colors.primary).toBe(process.env.PRIMARY_COLOR);
  });

  test('falls back to platform defaults when whiteLabelBranding=false on verified host', async () => {
    const host = 'admin3.brandco.test';
    await createAdminHost(host, { verify: true });

    await TenantConfigService.createConfig(tenant.id, 'whiteLabelBranding', false as any);
    await TenantConfigService.createConfig(tenant.id, 'primaryColor', '#101010' as any);

    const res = await request(app)
      .get('/public/branding')
      .set('x-forwarded-host', host);

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(res.body.colors.primary).toBe('#AA11AA'); // platform env default from top
  });
});