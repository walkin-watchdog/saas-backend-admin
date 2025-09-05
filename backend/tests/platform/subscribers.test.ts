import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { AuditService } from '../../src/services/auditService';
import crypto from 'crypto';

describe('Platform Subscribers Management', () => {
  let adminToken: string;
  let tenant: any;
  let plan: any;
  let subscription: any;
  let newPlan: any;
  let dueInvoice: any;

  beforeAll(async () => {
    // Create permissions and roles
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'subscribers.read', description: 'Read subscribers' },
        { code: 'subscribers.write', description: 'Write subscribers' },
        { code: 'subscribers.billing', description: 'Manage subscriber billing' },
        { code: 'subscribers.suspend', description: 'Suspend/resume subscribers' },
        { code: 'credit_notes.issue', description: 'Issue credit notes' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'billing_admin',
        name: 'Billing Admin',
        description: 'Billing management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['subscribers.read', 'subscribers.write', 'subscribers.billing', 'subscribers.suspend', 'credit_notes.issue'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    // Create platform user
    const adminUser = await prisma.platformUser.create({
      data: {
        email: 'billing@platform.test',
        name: 'Billing Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active'
      }
    });

    await prisma.platformUserRole.create({
      data: {
        platformUserId: adminUser.id,
        platformRoleId: adminRole.id
      }
    });

    const jti = crypto.randomUUID();
    adminToken = signPlatformAccess({
      sub: adminUser.id,
      email: 'billing@platform.test',
      roles: ['billing_admin'],
      permissions: ['subscribers.read', 'subscribers.write', 'subscribers.billing', 'subscribers.suspend', 'credit_notes.issue']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test tenant and subscription
    tenant = await prisma.tenant.create({
      data: {
        name: 'Test Subscriber',
        status: 'active'
      }
    });

    plan = await prisma.plan.create({
      data: {
        code: 'test_plan',
        billingFrequency: 'monthly',
        marketingName: 'Test Plan',
        marketingDescription: 'Test plan description',
        featureHighlights: ['Feature 1', 'Feature 2'],
        public: true,
        active: true,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: 2000 },
            { currency: 'USD', period: 'yearly', amountInt: 20000 }
          ]
        }
      },
      include: { prices: true }
    });

    subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.subscriber.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Test Subscriber',
        ownerEmail: 'owner@subscriber.test',
        billingStatus: 'active',
        kycStatus: 'verified',
        mrrBand: 'mid',
        churnRisk: 'low'
      }
    });
    // Additional plan for plan-change tests
    newPlan = await prisma.plan.create({
      data: {
        code: 'test_plan_2',
        billingFrequency: 'monthly',
        marketingName: 'Test Plan 2',
        marketingDescription: 'Second plan',
        featureHighlights: ['F3', 'F4'],
        public: true,
        active: true,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: 4000 },
            { currency: 'USD', period: 'yearly', amountInt: 40000 }
          ]
        }
      },
      include: { prices: true }
    });

    // Create a due invoice for credit-note tests
    dueInvoice = await prisma.invoice.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        subscription: { connect: { id: subscription.id } },
        amount: 1000,
        status: 'due',
        number: 'INV-TEST-0001',
        // Required fields in schema
        priceSnapshot: {
          currency: 'USD',
          monthly: plan.prices.find(p => p.currency === 'USD' && p.period === 'monthly')?.amountInt ?? 0,
          yearly: plan.prices.find(p => p.currency === 'USD' && p.period === 'yearly')?.amountInt ?? 0,
        },
        taxSnapshot: { percent: 0, amount: 0 },
        taxPercent: 0,
        taxAmount: 0,
        planVersion: plan.version,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.creditNote.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.subscriber.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/subscribers filters by status and pagination', async () => {
      const res = await request(app)
        .get('/api/platform/subscribers?billingStatus=active&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('subscribers');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.subscribers)).toBe(true);
    });

    test('GET /api/platform/subscribers filters: planId, mrrBand, churnRisk', async () => {
      const res = await request(app)
        .get(`/api/platform/subscribers?planId=${plan.id}&mrrBand=mid&churnRisk=low`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.subscribers.length).toBeGreaterThan(0);
      for (const s of res.body.subscribers) {
        const returnedPlanId = s.subscription?.planId ?? s.tenant?.subscriptions?.[0]?.planId;
        expect(returnedPlanId).toBe(plan.id);
        expect(s.mrrBand).toBe('mid');
        expect(s.churnRisk).toBe('low');
      }
    });

    test('GET /api/platform/subscribers returns correct prices for multiple currencies', async () => {
      const inrPrice = 150000;
      await prisma.planPrice.create({
        data: { planId: plan.id, currency: 'INR', period: 'monthly', amountInt: inrPrice }
      });
      const inrTenant = await prisma.tenant.create({
        data: { name: 'INR Tenant', status: 'active' }
      });
      await prisma.subscription.create({
        data: {
          tenantId: inrTenant.id,
          planId: plan.id,
          status: 'active',
          currency: 'INR',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      await prisma.subscriber.create({
        data: {
          tenantId: inrTenant.id,
          displayName: 'INR Subscriber',
          ownerEmail: 'inr@subscriber.test',
          billingStatus: 'active',
          kycStatus: 'verified'
        }
      });

      const res = await request(app)
        .get('/api/platform/subscribers?limit=100')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const usdSub = res.body.subscribers.find((s: any) => s.tenantId === tenant.id);
      const inrSub = res.body.subscribers.find((s: any) => s.tenantId === inrTenant.id);
      expect(usdSub.subscription.price).toBe(2000);
      expect(usdSub.subscription.currency).toBe('USD');
      expect(inrSub.subscription.price).toBe(inrPrice);
      expect(inrSub.subscription.currency).toBe('INR');
    });

    test('POST /api/platform/subscribers/:tenantId/plan applies immediately (proration path)', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ planId: newPlan.id, scheduleAtPeriodEnd: false });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('invoice');
      const sub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
      expect(sub?.planId).toBe(newPlan.id);
      auditSpy.mockRestore();
    });

    test('GET /api/platform/subscribers/:tenantId returns detailed profile', async () => {
      const res = await request(app)
        .get(`/api/platform/subscribers/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenant.id);
      expect(res.body.displayName).toBe('Test Subscriber');
      expect(res.body).toHaveProperty('tenant');
      expect(res.body).toHaveProperty('subscription');
    });

    test('GET /api/platform/subscribers/:tenantId profile includes invoices, usage, KYC, and notes', async () => {
      // Seed a note so we can assert it comes back in the profile payload
      await prisma.subscriber.update({
        where: { tenantId: tenant.id },
        data: { notes: 'Seeded profile note' }
      });

      const res = await request(app)
        .get(`/api/platform/subscribers/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // KYC status
      expect(res.body.kycStatus).toBe('verified');

      // Notes
      expect(res.body.notes).toBe('Seeded profile note');

      // Invoices are nested under tenant
      expect(res.body).toHaveProperty('tenant.invoices');
      expect(Array.isArray(res.body.tenant.invoices)).toBe(true);
      const inv = res.body.tenant.invoices.find((i: any) => i.number === 'INV-TEST-0001');
      expect(inv).toBeTruthy();
      expect(inv.amount).toBe(1000);
      expect(inv.status).toBe('due');

      // Usage records are returned as `usageRecords`
      expect(res.body).toHaveProperty('usageRecords');
    });

    test('GET /api/platform/subscribers/:tenantId/usage-history returns usage records', async () => {
      await prisma.usageRecord.create({ data: { tenantId: tenant.id, meter: 'api_calls', quantity: 1, unit: 'call' } });
      const res = await request(app)
        .get(`/api/platform/subscribers/${tenant.id}/usage-history`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.usage)).toBe(true);
      expect(res.body.usage.length).toBeGreaterThan(0);
    });

    test('GET /api/platform/subscribers/:tenantId/invoices returns invoices', async () => {
      const res = await request(app)
        .get(`/api/platform/subscribers/${tenant.id}/invoices`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invoices)).toBe(true);
    });

    test('usage-history for unknown tenant returns empty', async () => {
      const res = await request(app)
        .get('/api/platform/subscribers/unknown/usage-history')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.usage)).toBe(true);
      expect(res.body.usage.length).toBe(0);
    });

    test('GET /api/platform/subscribers/:tenantId includes dunning when past due', async () => {
      // Put subscription into past_due
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due', pastDueSince: new Date() }
      });
      const res = await request(app)
        .get(`/api/platform/subscribers/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('dunning');
      expect(res.body.dunning.active).toBe(true);
      // restore
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'active', pastDueSince: null }
      });
    });

    test('POST /api/platform/subscribers/:tenantId/plan/preview and schedule at period end', async () => {
      const preview = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/plan/preview`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ planId: newPlan.id });
      expect(preview.status).toBe(200);
      expect(preview.body).toHaveProperty('amount');

      const scheduled = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ planId: newPlan.id, scheduleAtPeriodEnd: true });
      expect(scheduled.status).toBe(200);
      expect(scheduled.body).toHaveProperty('effectiveAt');
      const sub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
      expect(sub?.scheduledPlanId).toBe(newPlan.id);
    });

    test('POST /api/platform/subscribers/:tenantId/credit-notes issues credit note', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const creditData = {
        amount: 500,
        reason: 'Service credit for downtime',
        note: 'Compensation for service interruption'
      };

      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'credit-123')
        .send(creditData);

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(creditData.amount);
      expect(res.body.reason).toBe(creditData.reason);
      expect(res.body.currency).toBe('USD');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'credit_note.created',
          tenantId: tenant.id
        })
      );

      auditSpy.mockRestore();
    });

    test('POST /api/platform/subscribers/:tenantId/credit-notes rejects mismatched currency', async () => {
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 100, currency: 'INR', reason: 'bad currency' });
      expect(res.status).toBe(400);
    });

    test('POST /api/platform/subscribers/:tenantId/credit-notes applies to invoice totals', async () => {
      // start with 1000 due
      const res1 = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'credit-apply-1')
        .send({ amount: 500, currency: 'USD', reason: 'Partial refund', invoiceId: dueInvoice.id });
      expect(res1.status).toBe(201);
      const inv1 = await prisma.invoice.findUnique({ where: { id: dueInvoice.id } });
      expect(inv1?.amount).toBe(500);
      expect(inv1?.status).toBe('due');

      const res2 = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'credit-apply-2')
        .send({ amount: 500, currency: 'USD', reason: 'Make whole', invoiceId: dueInvoice.id });
      expect(res2.status).toBe(201);
      const inv2 = await prisma.invoice.findUnique({ where: { id: dueInvoice.id } });
      expect(inv2?.amount).toBe(0);
      expect(inv2?.status).toBe('paid');
    });

    test('POST /api/platform/subscribers/:tenantId/trial/extend extends trial period', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      // Create trial subscription
      const trialSub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'trialing',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/trial/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          extensionDays: 14,
          reason: 'Customer requested extension'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('newTrialEnd');

      // Audit entry created
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trial.extended',
          tenantId: tenant.id
        })
      );
      auditSpy.mockRestore();

      // Cleanup
      await prisma.subscription.delete({ where: { id: trialSub.id } });
    });

    test('POST /api/platform/subscribers/:tenantId/suspend suspends subscriber', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Payment fraud detected'
        });

      expect(res.status).toBe(200);

      // Verify subscriber status
      const subscriber = await prisma.subscriber.findUnique({
        where: { tenantId: tenant.id }
      });

      expect(subscriber?.billingStatus).toBe('suspended');

      // Verify tenant status
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenant.id }
      });

      expect(tenantRecord?.status).toBe('suspended');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'subscriber.suspended',
          reason: 'Payment fraud detected'
        })
      );

      auditSpy.mockRestore();
    });

    test('POST /api/platform/subscribers/:tenantId/assign-csm sets assignedCsmId and logs audit', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/assign-csm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ csmId: 'csm_123' });
      expect(res.status).toBe(200);
      const sub = await prisma.subscriber.findUnique({ where: { tenantId: tenant.id } });
      expect(sub?.assignedCsmId).toBe('csm_123');
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'subscriber.updated',
        resourceId: tenant.id
      }));
      auditSpy.mockRestore();
    });

    test('POST /api/platform/subscribers/:tenantId/resume restores subscriber', async () => {
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Issue resolved'
        });

      expect(res.status).toBe(200);

      // Verify status restored
      const subscriber = await prisma.subscriber.findUnique({
        where: { tenantId: tenant.id }
      });

      expect(subscriber?.billingStatus).toBe('active');
      // Verify tenant access flags restored
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenant.id }
      });
      expect(tenantRecord?.status).toBe('active');
    });

    test('updating tags and notes logs audit entries', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const tagsRes = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/tags`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tags: ['high-value', 'enterprise']
        });

      expect(tagsRes.status).toBe(200);

      const notesRes = await request(app)
        .put(`/api/platform/subscribers/${tenant.id}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          notes: 'Important customer - handle with care'
        });

      expect(notesRes.status).toBe(200);

      // Verify updates
      const subscriber = await prisma.subscriber.findUnique({
        where: { tenantId: tenant.id }
      });

      expect(subscriber?.tags).toEqual(['high-value', 'enterprise']);
      expect(subscriber?.notes).toBe('Important customer - handle with care');
      // two audits: tags + notes updates
      expect(auditSpy).toHaveBeenCalledTimes(2);
      auditSpy.mockRestore();
    });
  });

  describe('Sad Paths', () => {
    test('plan change to non-existent plan returns 404', async () => {
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planId: 'non-existent-plan-id'
        });

      expect(res.status).toBe(404);
    });

    test('plan change to forbidden (inactive/private) plan returns 422', async () => {
      const forbiddenPlan = await prisma.plan.create({
        data: {
          code: 'forbidden_plan',
          billingFrequency: 'monthly',
          marketingName: 'Forbidden Plan',
          marketingDescription: 'Not assignable',
          featureHighlights: ['X'],
          public: false,
          active: false,
          prices: {
            create: [
              { currency: 'USD', period: 'monthly', amountInt: 3000 },
              { currency: 'USD', period: 'yearly', amountInt: 30000 }
            ]
          }
        },
        include: { prices: true }
      });

      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ planId: forbiddenPlan.id });

      expect(res.status).toBe(422);
    });

    test('credit exceeding outstanding or invalid currency -> 400', async () => {
      // Create a small due invoice
      const inv = await prisma.invoice.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          subscription: { connect: { id: subscription.id } },
          amount: 100,
          status: 'due',
          number: 'INV-TEST-0002',
          // Required fields in schema
          priceSnapshot: {
            currency: 'USD',
            monthly: plan.prices.find(p => p.currency === 'USD' && p.period === 'monthly')?.amountInt ?? 0,
            yearly: plan.prices.find(p => p.currency === 'USD' && p.period === 'yearly')?.amountInt ?? 0,
          },
          taxSnapshot: { percent: 0, amount: 0 },
          taxPercent: 0,
          taxAmount: 0,
          planVersion: plan.version,
        }
      });
      const tooMuch = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'credit-too-much')
        .send({ amount: 200, currency: 'USD', reason: 'Too much', invoiceId: inv.id });
      expect(tooMuch.status).toBe(400);

      const badCurrency = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/credit-notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'credit-bad-currency')
        .send({ amount: 10, currency: 'EUR', reason: 'Wrong currency', invoiceId: inv.id });
      expect(badCurrency.status).toBe(400);
    });

    test('trial extend for non-trial subscription returns 409', async () => {
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/trial/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          extensionDays: 7,
          reason: 'Test extension'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('No active trial subscription found');
    });

    test('suspend when already suspended is idempotent 200 with noop flag', async () => {
      // First suspend
      await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Double check' });
      // Second suspend -> noop
      const res = await request(app)
        .post(`/api/platform/subscribers/${tenant.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Again' });
      expect(res.status).toBe(200);
      expect(res.body.noop).toBe(true);
    });

    test('operations without KYC verification are blocked', async () => {
      // Create unverified tenant
      const unverifiedTenant = await prisma.tenant.create({
        data: {
          name: 'Unverified Tenant',
          status: 'active'
        }
      });

      await prisma.subscriber.create({
        data: {
          tenantId: unverifiedTenant.id,
          displayName: 'Unverified',
          ownerEmail: 'unverified@test.com',
          billingStatus: 'active',
          kycStatus: 'pending'
        }
      });

      const res = await request(app)
        .post(`/api/platform/subscribers/${unverifiedTenant.id}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planId: plan.id
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('KYC_REQUIRED');

      // Cleanup
      await prisma.subscriber.delete({ where: { tenantId: unverifiedTenant.id } });
      await prisma.tenant.delete({ where: { id: unverifiedTenant.id } });
    });
  });
});