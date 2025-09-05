import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';

describe('Proration & dunning edge cases', () => {
  let tenantId: string;

  let planLowM: any;   // monthly, lower price
  let planHighM: any;  // monthly, higher price
  let planYear: any;   // yearly plan

  beforeAll(async () => {
    const t = await prisma.tenant.create({ data: { name: 'ProrationEdges', status: 'active', dedicated: false } });
    tenantId = t.id;
    await prisma.subscriber.create({
      data: {
        tenantId,
        displayName: 'ProrationEdges',
        ownerEmail: 'owner@example.com',
        kycStatus: 'verified',
        billingStatus: 'active',
      },
    });

    planLowM = await prisma.plan.create({
      data: { code: 'low_m', billingFrequency: 'monthly', marketingName: 'LowM', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 500 }, { currency: 'USD', period: 'yearly', amountInt: 5000 } ] } },
    });
    planHighM = await prisma.plan.create({
      data: { code: 'high_m', billingFrequency: 'monthly', marketingName: 'HighM', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } },
    });
    planYear = await prisma.plan.create({
      data: { code: 'year_y', billingFrequency: 'yearly', marketingName: 'Year', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 12000 } ] } },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: { in: ['low_m','high_m','year_y'] } } });
    await prisma.subscriber.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  test('mid-cycle upgrade (low→high monthly) yields a positive (debit) proration', async () => {
    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: planLowM.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await SubscriptionService.changePlan(tenantId, planHighM.id);

    expect(typeof result.invoice.amount).toBe('number');
    expect(Number.isInteger(result.invoice.amount)).toBe(true);
    expect(result.invoice.amount).toBeGreaterThanOrEqual(0);

    // fetch the subscription by the invoice’s subscriptionId
    const subAfter = await prisma.subscription.findUnique({
      where: { id: result.invoice.subscriptionId },
    });
    expect(subAfter?.planId).toBe(planHighM.id);

    await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {});
  });

  test('monthly→yearly switch produces a non-negative proration charge', async () => {
    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: planLowM.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await SubscriptionService.changePlan(tenantId, planYear.id);

    expect(Number.isInteger(result.invoice.amount)).toBe(true);
    expect(result.invoice.amount).toBeGreaterThanOrEqual(0);
    expect(result.invoice.planVersion).toBe(planYear.version);

    const subAfter = await prisma.subscription.findUnique({
      where: { id: result.invoice.subscriptionId },
    });
    expect(subAfter?.planId).toBe(planYear.id);

    await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {});
  });

  test('yearly→monthly switch produces a non-positive (credit) proration', async () => {
    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: planYear.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await SubscriptionService.changePlan(tenantId, planLowM.id);

    expect(Number.isInteger(result.invoice.amount)).toBe(true);
    expect(result.invoice.amount).toBeLessThanOrEqual(0);

    const subAfter = await prisma.subscription.findUnique({
      where: { id: result.invoice.subscriptionId },
    });
    expect(subAfter?.planId).toBe(planLowM.id);

    await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {});
  });

  test('proration when remaining days = 0 results in zero adjustment', async () => {
    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: planLowM.id,
        status: 'active',
        currentPeriodEnd: new Date(), // boundary
      },
    });

    const result = await SubscriptionService.changePlan(tenantId, planHighM.id);

    expect(Number.isInteger(result.invoice.amount)).toBe(true);
    expect(result.invoice.amount).toBe(0);

    const subAfter = await prisma.subscription.findUnique({
      where: { id: result.invoice.subscriptionId },
    });
    expect(subAfter?.planId).toBe(planHighM.id);

    await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {});
  });

  test('tax-rounding boundary: fractional proration still rounds to integer paise', async () => {
    const specialLow = await prisma.plan.create({
      data: { code: 'low_fr', billingFrequency: 'monthly', marketingName: 'LowFR', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 0 }, { currency: 'USD', period: 'yearly', amountInt: 0 } ] } },
    });
    const specialHigh = await prisma.plan.create({
      data: { code: 'high_fr', billingFrequency: 'monthly', marketingName: 'HighFR', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 999 }, { currency: 'USD', period: 'yearly', amountInt: 9990 } ] } },
    });

    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: specialLow.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await SubscriptionService.changePlan(tenantId, specialHigh.id);

    expect(Number.isInteger(result.invoice.amount)).toBe(true);
    expect(result.invoice.amount).toBeGreaterThanOrEqual(0);

    const subAfter = await prisma.subscription.findUnique({
      where: { id: result.invoice.subscriptionId },
    });
    expect(subAfter?.planId).toBe(specialHigh.id);

    await prisma.subscription.delete({ where: { id: sub.id } }).catch(() => {});
    await prisma.plan.deleteMany({ where: { code: { in: ['low_fr', 'high_fr'] } } });
  });

  test('multiple plan changes within the same cycle emit multiple invoices and end on the last plan', async () => {
    // Use an isolated tenant for this scenario to avoid cross-test invoice counts
    const localTenant = await prisma.tenant.create({ data: { name: `ProrationMulti-${Date.now()}`, status: 'active', dedicated: false } });
    await prisma.subscriber.create({
      data: {
        tenantId: localTenant.id,
        displayName: 'Local',
        ownerEmail: 'local@example.com',
        kycStatus: 'verified',
        billingStatus: 'active',
      },
    });
    try {
      // Start on low monthly
      const sub = await prisma.subscription.create({
        data: {
          tenantId: localTenant.id,
          planId: planLowM.id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        },
      });

      const beforeCount = await prisma.invoice.count({ where: { tenantId: localTenant.id } });

      // Change low → high, then high → low again
      const first = await SubscriptionService.changePlan(localTenant.id, planHighM.id);
      const second = await SubscriptionService.changePlan(localTenant.id, planLowM.id);

      // Two new invoices created for the two changes
      const afterCount = await prisma.invoice.count({ where: { tenantId: localTenant.id } });
      expect(afterCount - beforeCount).toBe(2);

      // Final plan should be low (the second target)
      const subAfter = await prisma.subscription.findUnique({ where: { id: second.invoice.subscriptionId } });
      expect(subAfter?.planId).toBe(planLowM.id);

      // Amounts should be integers (paise), signs may differ (upgrade then downgrade)
      expect(Number.isInteger(first.invoice.amount)).toBe(true);
      expect(Number.isInteger(second.invoice.amount)).toBe(true);

      // Cleanup for this tenant
      await prisma.invoice.deleteMany({ where: { tenantId: localTenant.id } });
      await prisma.subscription.deleteMany({ where: { tenantId: localTenant.id } });
    } finally {
      // Remove the isolated tenant
      await prisma.tenant.delete({ where: { id: localTenant.id } }).catch(() => {});
    }
  });
});