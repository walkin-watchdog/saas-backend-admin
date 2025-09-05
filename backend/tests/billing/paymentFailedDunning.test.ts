import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { SubscriptionDunningJob } from '../../src/jobs/subscriptionDunningJob';

describe('payment.failed sets past_due and dunning progresses', () => {
  let tenantId: string;

  beforeAll(async () => {
    const t = await prisma.tenant.create({ data: { name: 'DunningFromFail', status: 'active', dedicated: false } });
    tenantId = t.id;
    const plan = await prisma.plan.create({ data: { code: 'dun', billingFrequency: 'monthly', marketingName: 'D', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: 'active', platformSubscriptionId: 'sub_RZP_FAIL' } });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: 'dun' } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('flip to past_due then dunningAttempts increments', async () => {
    const event = {
      id: 'evt_fail',
      event: 'payment.failed',
      payload: { payment: { entity: { subscription_id: 'sub_RZP_FAIL', notes: { tenantId }, amount: 1000 } } },
    };
    await SubscriptionService.recordWebhook('razorpay', event.id, JSON.stringify(event));
    await SubscriptionService.processWebhook('razorpay', JSON.stringify(event));

    const sub1 = await prisma.subscription.findFirst({ where: { tenantId } });
    expect(sub1?.status).toBe('past_due');
    expect(sub1?.dunningAttempts).toBe(0);

    await SubscriptionDunningJob.process();
    const sub2 = await prisma.subscription.findFirst({ where: { tenantId } });
    expect(sub2?.status).toBe('past_due');
    expect((sub2?.dunningAttempts || 0)).toBeGreaterThanOrEqual(1);
    expect(sub2?.dunningLastAttemptAt).toBeTruthy();
  });
});