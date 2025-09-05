import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';

describe('Webhook idempotency — races, scope, and replays', () => {
  let tenantId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'WebhookTenantRaces', status: 'active', dedicated: false },
    });
    tenantId = tenant.id;

    const plan = await prisma.plan.create({
      data: {
        code: 'plan_month_race',
        billingFrequency: 'monthly',
        marketingName: 'M',
        marketingDescription: '',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] },
      },
    });

    const sub = await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'active',
        platformSubscriptionId: 'sub_123_race',
      },
    });
    subscriptionId = sub.id;
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { code: 'plan_month_race' } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  afterEach(async () => {
    // Keep tests independent
    await prisma.invoice.deleteMany({ where: { tenantId } });
  });

  function makeRzpInvoicePaid(eventId: string, extInvoiceId: string, amount = 1000) {
    const event = {
      id: eventId,
      event: 'invoice.paid',
      payload: {
        invoice: {
          entity: {
            id: extInvoiceId,
            subscription_id: 'sub_123_race',
            amount,
            notes: { tenantId },
          },
        },
      },
    };
    return JSON.stringify(event);
  }

  it('is idempotent under concurrent recordWebhook calls', async () => {
    const payload = makeRzpInvoicePaid('evt_record_race', 'inv_record_race');

    const before = await prisma.invoice.count({ where: { tenantId } });

    // Race the *recordWebhook* calls for the same (provider,eventId)
    const [r1, r2] = await Promise.all([
      SubscriptionService.recordWebhook('razorpay', 'evt_record_race', payload),
      SubscriptionService.recordWebhook('razorpay', 'evt_record_race', payload),
    ]);

    // Exactly one of them should see it as "new"
    const flags = [r1.alreadyProcessed, r2.alreadyProcessed].sort();
    expect(flags).toEqual([false, true]);

    // Now process normally
    await SubscriptionService.processWebhook('razorpay', payload);

    const after = await prisma.invoice.count({ where: { tenantId } });
    expect(after - before).toBe(1);
  });

  it('is idempotent under concurrent processWebhook calls', async () => {
    const payload = makeRzpInvoicePaid('evt_process_race', 'inv_process_race');

    const before = await prisma.invoice.count({ where: { tenantId } });

    // Pre-record once
    await SubscriptionService.recordWebhook('razorpay', 'evt_process_race', payload);

    // Race two concurrent processors on the same payload
    await Promise.all([
      SubscriptionService.processWebhook('razorpay', payload),
      SubscriptionService.processWebhook('razorpay', payload),
    ]);

    const after = await prisma.invoice.count({ where: { tenantId } });
    expect(after - before).toBe(1);
  });

  it('rejects same event id with different payload (hash mismatch) at the service layer', async () => {
    const id = 'evt_hash_mismatch_service';

    const p1 = makeRzpInvoicePaid(id, 'inv_hash_A');
    const p2 = makeRzpInvoicePaid(id, 'inv_hash_B'); // different external invoice id ⇒ different payload/hash

    await SubscriptionService.recordWebhook('razorpay', id, p1);

    await expect(SubscriptionService.recordWebhook('razorpay', id, p2))
      .rejects.toThrow(/WEBHOOK_REPLAY_HASH_MISMATCH/i);
  });

  it('does not dedupe across providers (provider is part of the idempotency key)', async () => {
    const id = 'evt_same_id_cross_provider';
    const payload = makeRzpInvoicePaid(id, 'inv_cross_provider');

    // Record under razorpay
    const r1 = await SubscriptionService.recordWebhook('razorpay', id, payload);
    expect(r1.alreadyProcessed).toBe(false);

    // Same id under a different provider should be treated as new
    const r2 = await SubscriptionService.recordWebhook('paypal', id, payload);
    expect(r2.alreadyProcessed).toBe(false);
  });

  it('processWebhook is repeatable (replay after success does not create extra invoices)', async () => {
    const payload = makeRzpInvoicePaid('evt_replay_after_success', 'inv_replay_after_success');

    const before = await prisma.invoice.count({ where: { tenantId } });

    await SubscriptionService.recordWebhook('razorpay', 'evt_replay_after_success', payload);
    await SubscriptionService.processWebhook('razorpay', payload);
    // Replay (e.g., provider retry) — should be a no-op
    await SubscriptionService.processWebhook('razorpay', payload);

    const after = await prisma.invoice.count({ where: { tenantId } });
    expect(after - before).toBe(1);
  });
});