import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';
import { signAccess } from '../src/utils/jwt';
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('Tenant config routes: validation & masking', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'CfgRoutes', status: 'active', dedicated: false },
    });
    admin = await prisma.user.create({
      data: { tenantId: tenant.id, email: 'admin@cfg.co', password: 'p', name: 'Admin', role: 'ADMIN', platformAdmin: true },
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
    await prisma.tenantConfig.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  test('POST unknown key is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/tenant/config')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'not_a_real_key', value: 'x' });
    expect(res.status).toBe(400);
  });

  test('POST bad shape for structured key (captcha) → 400', async () => {
    // captcha expects object like {provider, secretKey}, not a string
    const res = await request(app)
      .post('/api/tenant/config')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'captcha', value: 'just-a-string' });
    expect([400, 422]).toContain(res.status);
  });

  test('GET list masks secrets for encrypted keys', async () => {
    // Seed an encrypted config (smtp) via service to avoid depending on POST shape here
    await TenantConfigService.createConfig(tenant.id, 'smtp', {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'svc@example.com',
      pass: 'supersecret',
      from: 'Brand <no-reply@example.com>',
    });

    const list = await request(app)
      .get('/api/tenant/config')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body?.configs)).toBe(true);
    const smtp = list.body.configs.find((r: any) => r.key === 'smtp');
    expect(smtp).toBeTruthy();
    expect(smtp.isEncrypted).toBe(true);
    // Ensure the route does not leak decrypted fields in the list response
    expect(smtp.value?.host).toBeUndefined();
    expect(smtp.value?.user).toBeUndefined();
    expect(smtp.value?.secretSet ?? true).toBe(true);
  });
});