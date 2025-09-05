import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('Public plan selection', () => {
  let plan: any;
  beforeAll(async () => {
    plan = await prisma.plan.create({ data: { code: 'pub', billingFrequency: 'monthly', marketingName: 'Pub', marketingDescription: '', featureHighlights: [], public: true, active: true, version: 1,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 10 },
        { currency: 'USD', period: 'yearly', amountInt: 100 },
        { currency: 'INR', period: 'monthly', amountInt: 800 },
        { currency: 'INR', period: 'yearly', amountInt: 8000 },
      ] } } });
    await prisma.plan.create({ data: { code: 'hidden', billingFrequency: 'monthly', marketingName: 'Hidden', marketingDescription: '', featureHighlights: [], public: false, active: true, version: 1,
      prices: { create: [
        { currency: 'USD', period: 'monthly', amountInt: 20 },
        { currency: 'USD', period: 'yearly', amountInt: 200 },
        { currency: 'INR', period: 'monthly', amountInt: 1600 },
        { currency: 'INR', period: 'yearly', amountInt: 16000 },
      ] } } });
  });
  afterAll(async () => {
    await prisma.plan.deleteMany();
  });
  test('select active public plan', async () => {
    const res = await request(app).post('/public/plans/select').send({ planId: plan.id });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(plan.id);
  });
  test('reject non-public plan', async () => {
    const hidden = await prisma.plan.findFirst({ where: { code: 'hidden' } });
    const res = await request(app).post('/public/plans/select').send({ planId: hidden!.id });
    expect(res.status).toBe(404);
  });
});
