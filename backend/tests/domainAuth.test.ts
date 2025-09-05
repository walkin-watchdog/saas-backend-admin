import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signAccess } from '../src/utils/jwt';

describe('Domain resolution & API-key overrides', () => {
  let tenant: any;
  let suspended: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'Domains Co', status: 'active', dedicated: false },
    });
  });

  afterAll(async () => {
    if (suspended) await prisma.tenant.delete({ where: { id: suspended.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('401 for unknown domain (no API key)', async () => {
    const res = await request(app)
      .get('/api/auth/login')            // any tenant-scoped route works
      .set('Origin', 'https://no-such-tenant.example.com');

    expect(res.status).toBe(401);
    expect(['Unrecognized domain', 'Tenant not found or inactive']).toContain(res.body?.error);
  });

  it('401 for inactive domain (no API key)', async () => {
    const d = await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: 'inactive.example.com', isActive: false },
    });

    const res = await request(app)
      .get('/api/auth/login')
      .set('Origin', 'https://inactive.example.com');

    expect(res.status).toBe(401);
    expect(['Unrecognized domain', 'Tenant not found or inactive']).toContain(res.body?.error);
  });

  // it('known active domain (no API key) succeeds on tenant-scoped route', async () => {
  //   await prisma.tenantDomain.create({
  //     data: { tenantId: tenant.id, domain: 'active.example.com', isActive: true },
  //   });

  //   const res = await request(app)
  //     .get('/api/auth/check-admin')
  //     .set('Origin', 'https://active.example.com'); // no x-api-key on purpose

  //   expect(res.status).toBe(200);
  // });

  it('API key overrides domain lookup (works even if domain unknown)', async () => {
    const res = await request(app)
      .get('/api/auth/login')
      .set('Origin', 'https://totally-unknown.example.com')
      .set('x-api-key', tenant.apiKey); // API-key path is tried first

    // crossing tenant resolution is the goal here.
    expect(res.status).not.toBe(401);
  });

  it('401 for suspended tenant (active domain)', async () => {
    suspended = await prisma.tenant.create({
      data: { name: 'Suspended Co', status: 'suspended', dedicated: false },
    });
    await prisma.tenantDomain.create({
      data: { tenantId: suspended.id, domain: 'suspended.example.com', isActive: true },
    });
    // Create ADMIN and use a token bound to the suspended tenant (avoids mismatch message)
    const admin = await prisma.user.create({
      data: {
        tenantId: suspended.id,
        email: 'admin@suspended.co',
        password: 'placeholder',
        name: 'Admin',
        role: 'ADMIN',
      },
    });
    const token = signAccess({
      sub: admin.id,
      tenantId: suspended.id,
      role: 'ADMIN',
      tokenVersion: 0,
      platformAdmin: false,
    });
 
    const res = await request(app)
      .get('/api/auth/login')
      .set('Origin', 'https://suspended.example.com')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(['Tenant account is suspended', 'Tenant not found or inactive']).toContain(res.body?.error);
  });
});