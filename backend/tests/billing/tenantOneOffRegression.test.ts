import { PaymentService } from '../../src/services/paymentService';

jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'TENANT_KEY', keySecret: 'TENANT_SECRET' }),
}));

const ordersCreate = jest.fn().mockResolvedValue({ id: 'order_1', amount: 10000 });
const paymentsFetch = jest.fn().mockResolvedValue({ id: 'pay_1', status: 'captured' });
const paymentsCapture = jest.fn().mockResolvedValue({ id: 'pay_1', status: 'captured' });
const paymentsRefund = jest.fn().mockResolvedValue({ id: 'rf_1', status: 'processed' });

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: { create: ordersCreate },
    payments: { fetch: paymentsFetch, capture: paymentsCapture, refund: paymentsRefund },
  }));
});

describe('Tenant one-off flows still work via PaymentService', () => {
  it('createOrder/getPaymentDetails/capture/refund succeed with tenant creds', async () => {
    const tenantId = 't-tenant';
    const order = await PaymentService.createOrder(tenantId, { amount: 100 });
    expect(order.id).toBe('order_1');

    const p = await PaymentService.getPaymentDetails(tenantId, 'pay_1');
    expect(p.id).toBe('pay_1');

    const c = await PaymentService.capturePayment(tenantId, 'pay_1', 100);
    expect(c.status).toBe('captured');

    const r = await PaymentService.refundPayment(tenantId, 'pay_1', 50);
    expect(r.status).toBe('processed');
  });
});