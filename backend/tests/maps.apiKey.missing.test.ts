import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Maps API key required', () => {
  let tenant: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'NoMaps', status: 'active', dedicated: false },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  test('missing maps API key returns 412', async () => {
    const res = await request(app)
      .get('/api/reviews/google')
      .query({ placeId: 'dummy' })
      .set('x-api-key', tenant.apiKey);
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ code: 'MAPS_API_KEY_MISSING' });
  });
});
