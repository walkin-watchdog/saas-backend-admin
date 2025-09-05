import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { PriceSnapshot } from '../../src/types/billing';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../src/utils/platformEvents';

describe('Plan change proration', () => {
  let tenantId: string;
  let planHigh: any;
  let planLow: any;
  let sub: any;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'ProrationTenant', status: 'active', dedicated: false } });
    tenantId = tenant.id;
    await prisma.subscriber.create({
      data: {
        tenantId,
        displayName: 'ProrationTenant',
        ownerEmail: 'owner@example.com',
        kycStatus: 'verified',
        billingStatus: 'active',
      },
    });
    planHigh = await prisma.plan.create({ data: { code: 'high', billingFrequency: 'monthly', marketingName: 'High', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] } } });
    planLow = await prisma.plan.create({ data: { code: 'low', billingFrequency: 'monthly', marketingName: 'Low', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 500 }, { currency: 'USD', period: 'yearly', amountInt: 5000 } ] } } });
    sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: planHigh.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: { in: ['high', 'low'] } } });
    await prisma.subscriber.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('creates credit invoice with snapshots', async () => {
    await prisma.tenantConfig.create({
      data: { tenantId, key: 'tax', value: { percent: 18, jurisdiction: 'GSTIN-123' } as any }
    }).catch(() => {});
    const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
    const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});
    const result = await SubscriptionService.changePlan(tenantId, planLow.id);
    expect(result.invoice.status).toBe('credit');
    expect(result.invoice.amount).toBeLessThan(0);
    expect(result.invoice.taxAmount).toBeLessThanOrEqual(0);
    expect(result.invoice.planVersion).toBe(planLow.version);
    const snap = result.invoice.priceSnapshot as unknown as PriceSnapshot;
    expect(snap.currency).toBe('USD');
    expect(snap.monthly).toBe(500);
    expect(result.invoice.hostedInvoiceUrl).toBeNull();
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'invoice.issued',
        tenantId,
        resourceId: result.invoice.id,
        changes: expect.objectContaining({ currency: 'USD' }),
      })
    );
    expect(eventSpy).toHaveBeenCalledWith(
      PLATFORM_EVENTS.INVOICE_ISSUED,
      expect.objectContaining({ invoiceId: result.invoice.id, currency: 'USD' })
    );
    auditSpy.mockRestore();
    eventSpy.mockRestore();
  });
});