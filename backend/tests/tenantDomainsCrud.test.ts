import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
// import jwt from 'jsonwebtoken';
import { signAccess } from '../src/utils/jwt';

describe('TenantDomain CRUD & normalization', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'CRUD Co', status: 'active', dedicated: false },
    });
    // Create platform ADMIN user under this tenant
    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@crud.co',
        // password not needed (we sign directly)
        password: 'hashed-or-placeholder',
        name: 'Admin',
        role: 'ADMIN',
        platformAdmin: true,
      },
    });
    // Sign a JWT matching what auth middleware expects
    token = signAccess({
      sub: admin.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      platformAdmin: true,
      tokenVersion: 0,
    });

    // const secret = process.env.JWT_SECRET || 'test-secret';
    // const issuer = process.env.JWT_ISSUER || 'saas';
    // const audience = process.env.JWT_AUDIENCE || 'user';

    // Add common claims some middleware enforces
    // token = jwt.sign(
    //   {
    //     id: admin.id,
    //     tenantId: tenant.id,
    //     role: 'ADMIN',
    //     platformAdmin: false,
    //     tokenVersion: 0,
    //   },
    //   secret,
    //   {
    //     expiresIn: '10m',
    //     issuer,
    //     audience,
    //     algorithm: 'HS256',
    //   }
    // );
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  test('create → 201; duplicate → 409; list is scoped; normalization works', async () => {
    // Create
    const res1 = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', 'https://admin.example.test')
      .send({ domain: 'HTTP://Example.com/anything', isActive: true });
    expect(res1.status).toBe(201);
    expect(res1.body.domain).toBe('example.com'); // normalized, no scheme/path
    expect(res1.body.isActive).toBe(true);

    // Duplicate (race-safe)
    const dup = await request(app)
      .post('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ domain: 'example.com' });
    expect(dup.status).toBe(409);

    // List (scoped)
    const list = await request(app)
      .get('/api/tenant/domains')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find((d: any) => d.domain === 'example.com')).toBeTruthy();
  });

  test('update scoped by tenant; conflict → 409; not-found → 404', async () => {
    const a = await prisma.tenantDomain.create({ data: { tenantId: tenant.id, domain: 'a.com' } });
    const b = await prisma.tenantDomain.create({ data: { tenantId: tenant.id, domain: 'b.com' } });

    // Conflict: change b → a.com
    const conflict = await request(app)
      .patch(`/api/tenant/domains/${b.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ domain: 'a.com' });
    expect(conflict.status).toBe(409);

    // Update OK
    const ok = await request(app)
      .patch(`/api/tenant/domains/${a.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ domain: 'a-updated.com', isActive: false });
    expect(ok.status).toBe(200);
    expect(ok.body.domain).toBe('a-updated.com');
    expect(ok.body.isActive).toBe(false);

    // Not found (wrong ID or cross-tenant)
    const notFound = await request(app)
      .patch(`/api/tenant/domains/${'non-existent-id'}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(notFound.status).toBe(404);
  });

  test('delete scoped by tenant → 204; non-owned/non-existent → 404', async () => {
    const d = await prisma.tenantDomain.create({ data: { tenantId: tenant.id, domain: 'del.com' } });

    const del = await request(app)
      .delete(`/api/tenant/domains/${d.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const delAgain = await request(app)
      .delete(`/api/tenant/domains/${d.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(delAgain.status).toBe(404);
  });
});
