import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app';
import { PaymentService } from '../../src/services/paymentService';

jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's', webhookSecret: 'platformSecret' }),
}));

describe('Signature scope enforcement', () => {
  it('platform webhook with tenant secret fails', async () => {
    const event = { id: 'evt', event: 'subscription.activated', payload: { subscription: { entity: { notes: { tenantId: 't1' }, id: 'sub' } } } };
    const payload = JSON.stringify(event);
    const sig = crypto.createHmac('sha256', 'tenantSecret').update(payload).digest('hex');
    const res = await request(app)
      .post('/api/webhooks/platform/razorpay')
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SIGNATURE_SCOPE_VIOLATION');
  });

  it('tenant webhook with platform secret fails', async () => {
    jest.spyOn(PaymentService, 'verifyWebhookSignature').mockResolvedValue(false);
    const payload = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
    const res = await request(app)
      .post('/api/payments/webhooks/razorpay')
      .set('x-razorpay-signature', 'anything')
      .set('host', 'example.com')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(400);
  });
});