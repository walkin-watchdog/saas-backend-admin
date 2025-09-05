import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Currency API key required', () => {
  let tenant: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'NoCurrency', status: 'active', dedicated: false },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  test('missing tenant currency API key yields 412', async () => {
    const res = await request(app)
      .get('/api/currency/currencies')
      .set('x-api-key', tenant.apiKey);
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ code: 'CURRENCY_API_KEY_MISSING' });
  });
});
