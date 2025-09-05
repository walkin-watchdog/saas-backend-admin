// tests/billing/trialDuration.test.ts
import { prisma } from '../../src/utils/prisma';
import { SubscriptionDunningJob } from '../../src/jobs/subscriptionDunningJob';

describe('Trial duration exactness', () => {
  let tenantId: string;
  let planId: string;
  let subId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'BillCo', status: 'active', dedicated: false },
    });
    tenantId = tenant.id;

    const plan = await prisma.plan.create({
      data: {
        code: 'plan_trial_duration',
        billingFrequency: 'monthly',
        marketingName: 'P',
        marketingDescription: '',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] },
      },
    });
    planId = plan.id;

    const now = Date.now();
    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'trialing',
        // Simulate a 7-day trial that just ended
        trialStartedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
        trialEndsAt:    new Date(now - 1000), // expired 1s ago
      },
    });
    subId = sub.id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { id: subId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('moves trialing → past_due when the trial end has passed', async () => {
    await SubscriptionDunningJob.process();
    const updated = await prisma.subscription.findUnique({ where: { id: subId } });
    expect(updated?.status).toBe('past_due');
  });
});