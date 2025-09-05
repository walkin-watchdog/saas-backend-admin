// tests/authGuards.test.ts
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signAccess } from '../src/utils/jwt';

describe('Auth guards (negative paths)', () => {
  let t1: any, t2: any, d1: any;
  let member: any, adminOtherTenant: any, adminT1: any;
  let memberToken: string, adminTokenOtherTenant: string, adminTokenT1: string;

  beforeAll(async () => {
    // tenants
    t1 = await prisma.tenant.create({ data: { name: 'T1', status: 'active', dedicated: false } });
    t2 = await prisma.tenant.create({ data: { name: 'T2', status: 'active', dedicated: false } });

    // map a domain to T1 so Origin-based resolution picks T1
    d1 = await prisma.tenantDomain.create({
      data: { tenantId: t1.id, domain: 't1.example.com', isActive: true }
    });

    // users
    member = await prisma.user.create({
      data: { tenantId: t1.id, email: 'm@t1', password: 'x', name: 'm', role: 'EDITOR' }
    });
    adminOtherTenant = await prisma.user.create({
      data: { tenantId: t2.id, email: 'a@t2', password: 'x', name: 'a', role: 'ADMIN' }
    });
    adminT1 = await prisma.user.create({
      data: { tenantId: t1.id, email: 'admin@t1', password: 'x', name: 'a1', role: 'ADMIN' }
    });

    // tokens
    memberToken = signAccess({
      sub: member.id,
      tenantId: t1.id,
      role: 'EDITOR',
      tokenVersion: 0,
      platformAdmin: false
    });
    adminTokenOtherTenant = signAccess({
      sub: adminOtherTenant.id,
      tenantId: t2.id, // token says T2
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false
    });
    adminTokenT1 = signAccess({
      sub: adminT1.id,
      tenantId: t1.id,
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false
    });
  });

  afterAll(async () => {
    // best-effort cleanup
    await prisma.user.deleteMany({ where: { tenantId: { in: [t1.id, t2.id] } } });
    await prisma.tenantDomain.deleteMany({ where: { tenantId: { in: [t1.id, t2.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [t1.id, t2.id] } } });
  });

  it('cross-tenant token on tenant-scoped route (Origin → T1, token → T2) ⇒ 403', async () => {
    // Force tenant resolution to T1 deterministically via API key (resolver tries API key first)
    const res = await request(app)
      .get('/api/coupons') // admin-only, tenant-scoped route
      .set('Authorization', `Bearer ${adminTokenOtherTenant}`)
      .set('x-api-key', t1.apiKey)
      .set('Origin', 'https://t1.example.com'); // keep Origin for realism

    expect(res.status).toBe(403);
    expect(res.body?.error).toMatch(/Cross-tenant access forbidden/i);
  });

  it('insufficient role (EDITOR) on ADMIN route ⇒ 403', async () => {
    const res = await request(app)
      .get('/api/coupons') // requires ADMIN
      .set('Authorization', `Bearer ${memberToken}`)
      .set('Origin', 'https://t1.example.com');
    expect(res.status).toBe(403);
  });

  it('platform routes require platformAdmin ⇒ 403', async () => {
    const res = await request(app)
      .get('/api/tenant/domains') // guarded by authenticate + requirePlatformAdmin
      .set('Authorization', `Bearer ${memberToken}`)
      .set('Origin', 'https://t1.example.com');
    expect(res.status).toBe(403);
  });

  it('ADMIN can access ADMIN-only tenant route ⇒ 200', async () => {
    const res = await request(app)
      .get('/api/coupons') // admin-only, tenant-scoped
      .set('Authorization', `Bearer ${adminTokenT1}`)
      .set('x-api-key', t1.apiKey);

    expect(res.status).toBe(200);
  });
});