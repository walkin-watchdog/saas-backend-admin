import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { PayPalService } from '../../src/services/paypalService';

describe('PayPal platform scope: webhook verification and sub ops', () => {
  beforeAll(async () => {
    // Seed a public plan for PayPal path
    const ppPlan = await prisma.plan.create({ data: { code: 'pp_plan', billingFrequency: 'monthly', marketingName: 'PP', marketingDescription: '', featureHighlights: [], public: true, version: 1, prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 12000 } ] } } });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({});
    await prisma.plan.deleteMany({ where: { code: 'pp_plan' } });
  });

  it('platform webhook rejects with tenant secret (verify=false)', async () => {
    jest.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(false);
    const body = { id: 'evt_pp_1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-PP', custom_id: 't123::TENANT' } };
    const res = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .send(JSON.stringify(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SIGNATURE_SCOPE_VIOLATION');
  });

  it('platform webhook NACKs when tenant cannot be resolved (verify=true)', async () => {
    jest.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(true);
    jest.spyOn(SubscriptionService, 'recordWebhook').mockResolvedValue({ alreadyProcessed: false } as any);
    jest.spyOn(SubscriptionService, 'processWebhook').mockResolvedValue({ tenantResolved: false } as any);

    const body = { id: 'evt_pp_ok', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-PP', custom_id: 't123::TENANT' } };
    const res = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .send(JSON.stringify(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TENANT_RESOLUTION_FAILED');
  });

  it('platform webhook accepts with platform secret when tenant is resolved', async () => {
    jest.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(true);
    jest.spyOn(SubscriptionService, 'recordWebhook').mockResolvedValue({ alreadyProcessed: false } as any);
    jest.spyOn(SubscriptionService, 'processWebhook').mockResolvedValue({ tenantResolved: true, processed: true } as any);

    const body = { id: 'evt_pp_ok2', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-PP2', custom_id: 't123::TENANT' } };
    const res = await request(app)
      .post('/api/webhooks/platform/paypal')
      .set('content-type', 'application/json')
      .send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant_resolved).toBe(true);
  });

  it('create/update/cancel use platform scope', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'PayPalPlat', status: 'active', dedicated: false } });
    await prisma.subscriber.create({
      data: {
        tenantId: tenant.id,
        displayName: 'PayPalPlat',
        ownerEmail: 'owner@example.com',
        kycStatus: 'verified',
        billingStatus: 'active',
      },
    });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'pp_plan' } });
    const createSpy = jest.spyOn(PayPalService, 'createSubscription').mockResolvedValue({ id: 'I-NEW' } as any);
    const updateSpy = jest.spyOn(PayPalService, 'updateSubscriptionPlan').mockResolvedValue({} as any);
    const cancelSpy = jest.spyOn(PayPalService, 'cancelSubscription').mockResolvedValue(true);

    const sub = await SubscriptionService.createSubscription(tenant.id, plan.id, { currency: 'USD', provider: 'paypal' });
    expect(createSpy).toHaveBeenCalledWith(plan.code, tenant.id, expect.any(String), { scope: 'platform' });

    // simulate an active sub with PayPal id to exercise update/cancel
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'active', platformSubscriptionId: 'I-NEW' } });
    await SubscriptionService.changePlan(tenant.id, plan.id);
    expect(updateSpy).toHaveBeenCalledWith('I-NEW', plan.code, { scope: 'platform' });

    await SubscriptionService.cancelSubscription(tenant.id, 'testing');
    expect(cancelSpy).toHaveBeenCalledWith('I-NEW', 'testing', { scope: 'platform' });

    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });
});