import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';

describe('Webhook idempotency', () => {
  let tenantId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'WebhookTenant', status: 'active', dedicated: false } });
    tenantId = tenant.id;
    const plan = await prisma.plan.create({ data: { code: 'plan_month', billingFrequency: 'monthly', marketingName: 'M', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    const sub = await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: 'active', platformSubscriptionId: 'sub_123' } });
    subscriptionId = sub.id;
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: 'plan_month' } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('prevents duplicate processing', async () => {
    const event = {
      id: 'evt_1',
      event: 'invoice.paid',
      payload: {
        invoice: {
          entity: {
            id: 'inv_1',
            subscription_id: 'sub_123',
            amount: 1000,
            notes: { tenantId },
          },
        },
      },
    };
    const payload = JSON.stringify(event);
    const rec1 = await SubscriptionService.recordWebhook('razorpay', event.id, payload);
    expect(rec1.alreadyProcessed).toBe(false);
    await SubscriptionService.processWebhook('razorpay', payload);
    const countAfterFirst = await prisma.invoice.count({ where: { tenantId } });
    expect(countAfterFirst).toBe(1);
    const rec2 = await SubscriptionService.recordWebhook('razorpay', event.id, payload);
    expect(rec2.alreadyProcessed).toBe(true);
    const countAfterSecond = await prisma.invoice.count({ where: { tenantId } });
    expect(countAfterSecond).toBe(1);
  });
});