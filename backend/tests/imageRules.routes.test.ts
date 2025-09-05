import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { signAccess } from '../src/utils/jwt';

describe('image rules routes', () => {
  let tenant: any;
  let admin: any;
  let user: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'ImageRuleTenant', status: 'active', dedicated: false },
    });

    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@img.co',
        password: 'pw',
        name: 'Admin',
        role: 'ADMIN',
        platformAdmin: true,
      },
    });

    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'user@img.co',
        password: 'pw',
        name: 'User',
        role: 'ADMIN',
        platformAdmin: false,
      },
    });

    adminToken = signAccess({
      sub: admin.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      platformAdmin: true,
      tokenVersion: 0,
    });

    userToken = signAccess({
      sub: user.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      platformAdmin: false,
      tokenVersion: 0,
    });
  });

  afterAll(async () => {
    await prisma.tenantConfig.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  test('platform admin can update image rule (shape & persistence)', async () => {
    const res = await request(app)
      .put(`/api/config/image-rules/${tenant.id}/products`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ width: 500, height: 400 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      imageType: 'products',
      width: 500,
      height: 400,
    });

    // Make platform rules "effective": set Cloudinary so the service returns the
    // tenant's saved rules (instead of falling back to defaults).
    await prisma.tenantConfig.create({
      data: {
        tenantId: tenant.id,
        key: 'cloudinary',
        value: { cloudName: 'demo', apiKey: 'k', apiSecret: 's' },
      },
    });

    // Verify via GET (effective config now reflects the saved tenant rule)
    const getRes = await request(app)
      .get(`/api/config/image-rules/${tenant.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.rules?.products?.width).toBe(500);

    // Idempotency
    const res2 = await request(app)
      .put(`/api/config/image-rules/${tenant.id}/products`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ width: 500, height: 400 });

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ imageType: 'products', width: 500, height: 400 });
  });

  test('non platform admin cannot update rule (403)', async () => {
    const res = await request(app)
      .put(`/api/config/image-rules/${tenant.id}/products`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ width: 300, height: 200 });

    expect(res.status).toBe(403);
  });

  test('invalid payload returns 400', async () => {
    const res = await request(app)
      .put(`/api/config/image-rules/${tenant.id}/products`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ width: -1, height: 200 });

    expect(res.status).toBe(400);
  });

  test('GET full image config returns ETag and supports 304', async () => {
    const first = await request(app)
      .get(`/api/config/image-rules/${tenant.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(first.status).toBe(200);
    expect(first.headers['etag']).toBeTruthy();
    expect(first.headers['cache-control']).toMatch(/max-age=300/);

    const etag = first.headers['etag'];

    const second = await request(app)
      .get(`/api/config/image-rules/${tenant.id}`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-None-Match', etag);

    expect(second.status).toBe(304);
  });

  test('GET single rule by type works', async () => {
    const res = await request(app)
      .get(`/api/config/image-rules/${tenant.id}/products`)
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.imageType).toBe('products');
    expect(typeof res.body.width).toBe('number');
    expect(typeof res.body.height).toBe('number');
  });

  test('cross-tenant access forbidden', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { name: 'OtherTenant', status: 'active', dedicated: false },
    });

    const res = await request(app)
      .get(`/api/config/image-rules/${otherTenant.id}`)
      .set('x-api-key', tenant.apiKey) // sending Tenant A's key
      .set('Authorization', `Bearer ${adminToken}`); // token is for Tenant A

    expect(res.status).toBe(403);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});