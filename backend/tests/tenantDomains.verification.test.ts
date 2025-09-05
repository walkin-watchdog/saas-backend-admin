// tests/tenantDomains.verification.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signAccess } from '../src/utils/jwt';

jest.mock('dns/promises', () => ({ resolveTxt: jest.fn() }));
const { resolveTxt } = require('dns/promises') as { resolveTxt: jest.Mock };

const asMock = (fn: any) => fn as jest.Mock;

describe('Tenant Domains: verification flow', () => {
  let tenant: any;
  let admin: any;
  let viewer: any;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'VerifyFlowCo', status: 'active', dedicated: false },
    });

    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@verify.co',
        password: 'hash',
        name: 'Admin',
        role: 'ADMIN',
        platformAdmin: true,
      },
    });

    viewer = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'viewer@verify.co',
        password: 'hash',
        name: 'Viewer',
        role: 'VIEWER',
        platformAdmin: false,
      },
    });

    adminToken = signAccess({ sub: admin.id, tenantId: tenant.id, role: 'ADMIN', platformAdmin: true, tokenVersion: 0 });
    viewerToken = signAccess({ sub: viewer.id, tenantId: tenant.id, role: 'VIEWER', platformAdmin: false, tokenVersion: 0 });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, viewer.id] } } }).catch(() => {});
    await prisma.tenantDomain.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  });

  test('happy path: start issues TXT token, verify succeeds when DNS contains token', async () => {
    // Create domain (platformAdmin required by create route) :contentReference[oaicite:9]{index=9}
    const dom = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'admin.verifyflow.test', isActive: true, isAdminHost: true });
    expect(dom.status).toBe(201);

    // Start verification
    const start = await request(app)
      .post(`/api/tenant/domains/${dom.body.id}/verify/start`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(start.status).toBe(201);
    expect(start.body.dnsRecord).toEqual({
      host: `_admin.admin.verifyflow.test`,
      type: 'TXT',
      value: `ww-admin-verification=${start.body.token}`,
    });

    // Mock DNS response to contain token
    asMock(resolveTxt).mockResolvedValueOnce([[`ww-admin-verification=${start.body.token}`]]);
    const verify = await request(app)
      .post(`/api/tenant/domains/${dom.body.id}/verify`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(true);

    // DB reflects verifiedAt
    const row = await prisma.tenantDomain.findUnique({ where: { domain: 'admin.verifyflow.test' } });
    expect(row?.verifiedAt).toBeTruthy();
  });

  test('sad path: verify returns {verified:false} when TXT does not match', async () => {
    const d = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'no-txt.verifyflow.test', isActive: true, isAdminHost: true });
    expect(d.status).toBe(201);

    const start = await request(app)
      .post(`/api/tenant/domains/${d.body.id}/verify/start`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(start.status).toBe(201);

    // DNS does NOT contain token
    asMock(resolveTxt).mockResolvedValueOnce([['something-else']]);
    const verify = await request(app)
      .post(`/api/tenant/domains/${d.body.id}/verify`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(false);
  });

  test('sad path: verify before start → 500', async () => {
    const d = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'premature.verifyflow.test', isActive: true, isAdminHost: true });
    expect(d.status).toBe(201);

    const verify = await request(app)
      .post(`/api/tenant/domains/${d.body.id}/verify`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verify.status).toBe(500); // router bubbles thrown error
  });

  test('authz: viewer cannot start/verify; missing auth rejected', async () => {
    const d = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'authz.verifyflow.test', isActive: true, isAdminHost: true });
    expect(d.status).toBe(201);

    const startViewer = await request(app)
      .post(`/api/tenant/domains/${d.body.id}/verify/start`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect([401,403]).toContain(startViewer.status);

    const startNoAuth = await request(app)
      .post(`/api/tenant/domains/${d.body.id}/verify/start`)
      .set('x-api-key', tenant.apiKey);
    expect([401,403]).toContain(startNoAuth.status);
  });
});