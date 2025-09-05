import request from 'supertest';
import crypto from 'crypto';
// Make the platform secret deterministic for HMACs in this test
jest.mock('../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({
    keyId: 'k', keySecret: 's', webhookSecret: 'platformSecret',
  }),
}));
import { app } from '../src/app';

describe('Platform webhooks: replay hash mismatch → 409', () => {
  test('razorpay: same eventId with different payload returns 409', async () => {
    const e1 = { id: 'evt_same', event: 'subscription.activated', payload: { subscription: { entity: { notes: { tenantId: 'T1' }, id: 'sub_1' } } } };
    const e2 = { id: 'evt_same', event: 'subscription.activated', payload: { subscription: { entity: { notes: { tenantId: 'T1' }, id: 'sub_CHANGED' } } } };

    const p1 = JSON.stringify(e1);
    const s1 = crypto.createHmac('sha256', 'platformSecret').update(p1).digest('hex');
    const r1 = await request(app)

      .post('/api/webhooks/platform/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', s1)
      .send(p1);
    expect([200, 400]).toContain(r1.status);

    const p2 = JSON.stringify(e2);
    const s2 = crypto.createHmac('sha256', 'platformSecret').update(p2).digest('hex');
    const r2 = await request(app)
      .post('/api/webhooks/platform/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', s2)
      .send(p2);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('WEBHOOK_REPLAY_HASH_MISMATCH');
  });
});