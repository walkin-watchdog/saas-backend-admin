// tests/authLogout.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signRefresh } from '../src/utils/jwt';
import * as blacklist from '../src/utils/blacklist';

describe('Auth logout', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'Logout-Tenant', status: 'active', dedicated: false },
    });

    // Password value is irrelevant for this test; we don't authenticate via /login.
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'logout@test',
        password: 'x',
        name: 'Logout User',
        role: 'EDITOR',
      },
    });
  });

  afterAll(async () => {
    // Best-effort cleanup
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  test('clears refresh cookie (rt) on logout', async () => {
    // Build a VALID refresh JWT so verifyRefresh() does not throw
    const rt = signRefresh({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      platformAdmin: !!user.platformAdmin,
    });

    // CSRF cookie must match x-csrf-token header
    const csrf = 'bye123';

    const res = await request(app)
      .post('/api/auth/logout')
      .set('x-api-key', tenant.apiKey) // ensure tenant resolution
      .set('Cookie', [`rt=${rt}`, `csrf=${csrf}`])
      .set('x-csrf-token', csrf);

    expect(res.status).toBe(204);

    const raw = res.headers['set-cookie'] as undefined | string | string[];
    const setCookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    // Refresh cookie is cleared
    const rtClear = setCookies.find((c) => /^rt=/.test(c));
    expect(rtClear).toBeTruthy();
    expect(String(rtClear)).toMatch(/(Max-Age=0|Expires=[^;]*1970)/i); // expired
    expect(String(rtClear)).toMatch(/Path=\//i);
    expect(String(rtClear)).toMatch(/HttpOnly/i); // rt is httpOnly in your code
    expect(String(rtClear)).toMatch(/SameSite=Strict/i);

    // CSRF cookie is also cleared (but NOT HttpOnly by design)
    const csrfClear = setCookies.find((c) => /^csrf=/.test(c));
    expect(csrfClear).toBeTruthy();
    expect(String(csrfClear)).toMatch(/(Max-Age=0|Expires=[^;]*1970)/i);
    expect(String(csrfClear)).toMatch(/Path=\//i);
    expect(String(csrfClear)).toMatch(/SameSite=Strict/i);
  });

  test('impersonation token logout skips blacklist insert', async () => {
    const addSpy = jest.spyOn(blacklist, 'addToBlacklist').mockResolvedValue(undefined as any);

    const rt = signRefresh({
      sub: `impersonation:${user.id}`,
      tenantId: tenant.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      platformAdmin: !!user.platformAdmin,
      impersonation: {
        platformUserId: 'PU',
        scope: 'full_tenant_admin',
        reason: 't',
        grantId: 'G',
        jti: 'IJTI',
      },
    });

    const csrf = 'bye456';
    const res = await request(app)
      .post('/api/auth/logout')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', [`rt=${rt}`, `csrf=${csrf}`])
      .set('x-csrf-token', csrf);

    expect(res.status).toBe(204);
    expect(addSpy).not.toHaveBeenCalled();
  });
});