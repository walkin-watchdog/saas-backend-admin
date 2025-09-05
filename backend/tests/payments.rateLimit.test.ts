import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { app } from '../src/app';

describe('Payments rate limiting', () => {
  let tenant: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { name: 'PayRL', status: 'active', dedicated: false } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  });

  function expect429WithRateLimitHeaders(res: request.Response) {
    expect(res.status).toBe(429);
    // Standard headers added when standardHeaders: true
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
    // Retry-After is set by our handler or library; value varies, just assert presence and numeric
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number.isNaN(Number(res.headers['retry-after']))).toBe(false);
  }

  test('burst limiter (3 in 5s) triggers on /api/payments/paypal/create-order', async () => {
    const asClient = () =>
      request(app)
        .post('/api/payments/paypal/create-order')
        .set('x-real-ip', '203.0.113.77');

    const r1 = await asClient().send({});
    expect(r1.status).not.toBe(429);
    const r2 = await asClient().send({});
    expect(r2.status).not.toBe(429);
    const r3 = await asClient().send({});
    expect(r3.status).not.toBe(429);


    // 4th within 5 seconds should now 429 due to rateLimitPaymentBurst
    const r4 = await asClient().send({});
    expect429WithRateLimitHeaders(r4);
  });

  test('burst limiter (3 in 5s) triggers on /api/payments/paypal/capture', async () => {
    const asClient = () =>
      request(app)
        .post('/api/payments/paypal/capture')
        .set('x-real-ip', '203.0.113.78'); // unique per test

    const r1 = await asClient().send({});
    expect(r1.status).not.toBe(429);
    const r2 = await asClient().send({});
    expect(r2.status).not.toBe(429);
    const r3 = await asClient().send({});
    expect(r3.status).not.toBe(429);
    const r4 = await asClient().send({});
    expect429WithRateLimitHeaders(r4);
  });

  test('burst limiter (3 in 5s) triggers on /api/payments/create-order (Razorpay)', async () => {
    const asClient = () =>
      request(app)
        .post('/api/payments/create-order')
        .set('x-real-ip', '203.0.113.79'); // unique per test

    const r1 = await asClient().send({});
    expect(r1.status).not.toBe(429);
    const r2 = await asClient().send({});
    expect(r2.status).not.toBe(429);
    const r3 = await asClient().send({});
    expect(r3.status).not.toBe(429);
    const r4 = await asClient().send({});
    expect429WithRateLimitHeaders(r4);
  });

  test('burst limiter (3 in 5s) triggers on /api/payments/verify (Razorpay)', async () => {
    const asClient = () =>
      request(app)
        .post('/api/payments/verify')
        .set('x-real-ip', '203.0.113.80'); // unique per test

    const r1 = await asClient().send({});
    expect(r1.status).not.toBe(429);
    const r2 = await asClient().send({});
    expect(r2.status).not.toBe(429);
    const r3 = await asClient().send({});
    expect(r3.status).not.toBe(429);
    const r4 = await asClient().send({});
    expect429WithRateLimitHeaders(r4);
  });

  test('webhooks are not limited (no 429)', async () => {
    // These hit the separate webhook router that the payment limiters do not wrap
    for (let i = 0; i < 8; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app)
        .post('/api/payments/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ id: `evt_${i}`, event: 'payment.captured', payload: {} }));
      expect(r.status).not.toBe(429);
    }
  });

  test('burst limiter resets after 5s window', async () => {
    const client = () =>
      request(app)
        .post('/api/payments/create-order')
        .set('x-real-ip', '203.0.113.81'); // unique per test

    await client().send({});
    await client().send({});
    await client().send({});
    const r4 = await client().send({});
    expect429WithRateLimitHeaders(r4);

    // Wait > window (5s) then try again
    await new Promise((r) => setTimeout(r, 6000));
    const r5 = await client().send({});
    expect(r5.status).not.toBe(429);
  }, 15000);
});