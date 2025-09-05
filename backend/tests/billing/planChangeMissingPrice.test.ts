import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';

describe('plan change when new plan lacks price', () => {
  let tenantId: string;
  let planWithPrice: any;
  let planWithoutPrice: any;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'NoPrice', status: 'active', dedicated: false },
    });
    tenantId = tenant.id;
    await prisma.subscriber.create({
      data: {
        tenantId,
        displayName: 'NoPrice',
        ownerEmail: 'owner@example.com',
        kycStatus: 'verified',
        billingStatus: 'active',
      },
    });

    planWithPrice = await prisma.plan.create({
      data: {
        code: 'with_usd',
        billingFrequency: 'monthly',
        marketingName: 'WithUSD',
        marketingDescription: '',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: 1000 },
            { currency: 'USD', period: 'yearly', amountInt: 10000 },
          ],
        },
      },
    });

    planWithoutPrice = await prisma.plan.create({
      data: {
        code: 'without_usd',
        billingFrequency: 'monthly',
        marketingName: 'WithoutUSD',
        marketingDescription: '',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: {
          create: [
            { currency: 'INR', period: 'monthly', amountInt: 1000 },
            { currency: 'INR', period: 'yearly', amountInt: 10000 },
          ],
        },
      },
    });

    await prisma.subscription.create({
      data: {
        tenantId,
        planId: planWithPrice.id,
        status: 'active',
        currency: 'USD',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: { in: ['with_usd', 'without_usd'] } } });
    await prisma.subscriber.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('changePlan rejects', async () => {
    await expect(
      SubscriptionService.changePlan(tenantId, planWithoutPrice.id),
    ).rejects.toThrow('PLAN_PRICE_NOT_AVAILABLE');
  });

  it('previewPlanChange rejects', async () => {
    await expect(
      SubscriptionService.previewPlanChange(tenantId, planWithoutPrice.id),
    ).rejects.toThrow('PLAN_PRICE_NOT_AVAILABLE');
  });
});