import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService'
import { SubscriptionDunningJob } from '../../src/jobs/subscriptionDunningJob';

describe('Dunning logic', () => {
  let tenantId: string;
  let subId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'DunningTenant', status: 'active', dedicated: false } });
    tenantId = tenant.id;
    const plan = await prisma.plan.create({ data: { code: 'plan', billingFrequency: 'monthly', marketingName: 'P', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    const sub = await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: 'trialing', trialEndsAt: new Date(Date.now() - 2 * 86400000) } });
    subId = sub.id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: 'plan' } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    
  });

  it('flips trialing to past_due', async () => {
    await SubscriptionDunningJob.process();
    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.status).toBe('past_due');
  });

  it('suspends after days past due', async () => {
    const past = new Date(Date.now() - 4 * 86400000);
    await prisma.subscription.update({ where: { id: subId }, data: { status: 'past_due', dunningAttempts: 3, dunningLastAttemptAt: past } });
    await prisma.$executeRaw`UPDATE "Subscription" SET "updatedAt" = ${past} WHERE "id" = ${subId}`;
    await SubscriptionDunningJob.process();
    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.status).toBe('suspended');
  });
  
  it('late successful payment before suspension avoids suspension (status reset to active)', async () => {
    // Put sub into past_due with high attempts
    const past = new Date(Date.now() - 2 * 86400000);
    await prisma.subscription.update({
      where: { id: subId },
      data: { status: 'past_due', dunningAttempts: 2, dunningLastAttemptAt: past, platformSubscriptionId: 'sub_RZP_OK' }
    });
    // Simulate provider success
    const event = {
      id: 'evt_success_after_pd',
      event: 'payment.captured',
      payload: { payment: { entity: { subscription_id: 'sub_RZP_OK', notes: { tenantId }, amount: 1000 } } },
    };
    await SubscriptionService.recordWebhook('razorpay', event.id, JSON.stringify(event));
    await SubscriptionService.processWebhook('razorpay', JSON.stringify(event));

    // Run dunning; should NOT suspend because status is now active
    await SubscriptionDunningJob.process();
    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.status).toBe('active');
  });

  it('backoff state does not trigger if status is no longer past_due after a success', async () => {
    // Ensure status active and high attempts remain from prior state
    await prisma.subscription.update({ where: { id: subId }, data: { status: 'active', dunningAttempts: 5 } });
    // Dunning should be a no-op on active
    await SubscriptionDunningJob.process();
    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    expect(sub?.status).toBe('active');
  });
});