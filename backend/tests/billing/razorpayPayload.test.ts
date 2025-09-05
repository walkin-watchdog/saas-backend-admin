import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';

let captured: any;

jest.mock('../../src/services/gatewayCredentialResolver', () => ({
  GatewayCredentialResolver: jest.fn().mockResolvedValue({ keyId: 'k', keySecret: 's' }),
}));

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cust1' }) },
    subscriptions: { create: jest.fn().mockImplementation((opts: any) => { captured = opts; return { id: 'subr' }; }) },
  }));
});

describe('Razorpay subscription payload', () => {
  let tenantId: string;
  let planId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'PayloadTenant', status: 'active', dedicated: false } });
    tenantId = tenant.id;
    const plan = await prisma.plan.create({ data: { code: 'pl', billingFrequency: 'monthly', marketingName: 'P', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 }, { currency: 'INR', period: 'monthly', amountInt: 80000 }, { currency: 'INR', period: 'yearly', amountInt: 800000 } ] } } });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    
  });

  it('omits total_count for indefinite subscriptions', async () => {
    await SubscriptionService.createSubscription(tenantId, planId, { currency: 'INR' });
    expect(captured.total_count).toBeUndefined();
  });

  it('supports Razorpay provider with USD currency', async () => {
    captured = null;
    await SubscriptionService.createSubscription(tenantId, planId, { currency: 'USD', provider: 'razorpay' });
    expect(captured).toBeTruthy();
  });
});