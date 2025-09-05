import request from 'supertest';
import { app } from '../src/app';
import { PayPalService } from '../src/services/paypalService';

describe('Platform webhooks (PayPal): replay hash mismatch → 409', () => {
  beforeAll(() => {
    // Treat signatures as valid so we exercise only the replay/hash path
    jest.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(true);
  });

  test('same event id, different payload → 409', async () => {
    const e1 = {
      id: 'WH-PP-1',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-PP-1', custom_id: 'T1' }
    };
    const e2 = {
      id: 'WH-PP-1', // same event id, different payload ⇒ different payload hash
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-PP-CHANGED', custom_id: 'T1' }
    };

    const r1 = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .send(JSON.stringify(e1));
    expect([200, 400]).toContain(r1.status); // ok to be processed or NACKed

    const r2 = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .send(JSON.stringify(e2));
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('WEBHOOK_REPLAY_HASH_MISMATCH');
  });
});