import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { recordUsage } from '../../src/services/usageService';

describe('Usage is included on invoice and PDF generated', () => {
  let tenantId: string;
  let subId: string;
  let plan: any;

  beforeAll(async () => {
    const t = await prisma.tenant.create({ data: { name: 'UsageT', status: 'active', dedicated: false } });
    tenantId = t.id;
    plan = await prisma.plan.create({ data: { code: 'usage_plan', billingFrequency: 'monthly', marketingName: 'U', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    const sub = await prisma.subscription.create({ data: { tenantId, planId: plan.id, status: 'active', platformSubscriptionId: 'sub_RZP' } });
    subId = sub.id;

    // record usage worth some money: unitPrice in paise * quantity
    await recordUsage(tenantId, { meter: 'api_calls', quantity: 25, unit: 'call', metadata: { unitPrice: 50 } }); // ₹12.50
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.usageRecord.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: 'usage_plan' } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('processWebhook(invoice.paid) generates invoice with usage and a PDF', async () => {
    const event = {
      id: 'evt_paid_usage',
      event: 'invoice.paid',
      payload: {
        invoice: { entity: { id: 'inv_ext', subscription_id: 'sub_RZP', amount: 5000, notes: { tenantId } } },
      },
    };
    await SubscriptionService.recordWebhook('razorpay', event.id, JSON.stringify(event));
    await SubscriptionService.processWebhook('razorpay', JSON.stringify(event));

    const inv = await prisma.invoice.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    expect(inv).toBeTruthy();
    expect(inv!.usageAmount).toBeGreaterThan(0);
    expect(inv!.hostedInvoiceUrl).toBeNull();
  });
});