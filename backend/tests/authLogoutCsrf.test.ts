import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';

describe('Logout CSRF protection', () => {
  let tenant: any;
  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'CSRF', status: 'active', dedicated: false } });
  });
  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  test('blocks logout without CSRF header', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('x-api-key', tenant.apiKey);
    expect(res.status).toBe(403);
  });

  test('allows logout with matching CSRF cookie/header', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('x-api-key', tenant.apiKey)
      .set('Cookie', 'csrf=abc123')
      .set('x-csrf-token', 'abc123');
    expect(res.status).toBe(204);
  });
});