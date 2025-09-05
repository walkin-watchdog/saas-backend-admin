import request from 'supertest';
import crypto from 'crypto';
import { PayPalService } from '../src/services/paypalService';

// Make the platform secret deterministic for HMACs in this test
jest.mock('../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({
    keyId: 'k', keySecret: 's', webhookSecret: 'platformSecret',
  }),
}));

import { app } from '../src/app';

describe('Platform webhook timestamp tolerance', () => {
  test('razorpay: stale created_at is rejected with 400', async () => {
    const event = {
      id: 'evt_old',
      created_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour old (default tolerance = 300s)
      event: 'subscription.activated',
      payload: { subscription: { entity: { notes: { tenantId: 'T1' }, id: 'sub_1' } } },
    };
    const body = JSON.stringify(event);
    const sig = crypto.createHmac('sha256', 'platformSecret').update(body).digest('hex');
    const res = await request(app)
      .post('/api/webhooks/platform/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('stale_webhook');
  });

  test('paypal: stale PayPal-Transmission-Time is rejected with 400', async () => {
    jest.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(true);
    const event = {
      id: 'WH-PP-stale',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-PP', custom_id: 'T1' },
    };
    const res = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .set('PayPal-Transmission-Time', new Date(Date.now() - 3600_000).toISOString()) // 1 hour ago
      .send(JSON.stringify(event));
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('stale_webhook');
  });
});