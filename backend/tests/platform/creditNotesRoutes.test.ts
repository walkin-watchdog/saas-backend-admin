import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import crypto from 'crypto';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../src/utils/platformEvents';

describe('Platform Credit Notes routes', () => {
  let token: string;
  let tenant: any;
  let plan: any;
  let sub: any;
  let invoice: any;
  beforeAll(async () => {
    await prisma.platformPermission.createMany({ data: [
      { code: 'credit_notes.read', description: '' },
      { code: 'credit_notes.issue', description: '' }
    ]});
    const role = await prisma.platformRole.create({ data: { code: 'credit_admin', name: 'Credit Admin', description: '' } });
    const perms = await prisma.platformPermission.findMany({ where: { code: { in: ['credit_notes.read','credit_notes.issue'] } } });
    await prisma.platformRolePermission.createMany({ data: perms.map(p => ({ platformRoleId: role.id, permissionId: p.id })) });
    const user = await prisma.platformUser.create({ data: { email: 'credit@p.test', name: 'Credit', passwordHash: 'h', status: 'active', mfaEnabled: true } });
    await prisma.platformUserRole.create({ data: { platformUserId: user.id, platformRoleId: role.id } });
    const jti = crypto.randomUUID();
    token = signPlatformAccess({ sub: user.id, email: user.email, roles: ['credit_admin'], permissions: ['credit_notes.read','credit_notes.issue'] }, jti);
    await PlatformSessionService.create(user.id, jti);
    tenant = await prisma.tenant.create({ data: { name: 'Credit Tenant', status: 'active' } });
    plan = await prisma.plan.create({
      data: {
        code: 'credit_plan',
        marketingName: 'Credit Plan',
        marketingDescription: 'Plan for credit notes test',
        billingFrequency: 'monthly',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: 1000 },
            { currency: 'USD', period: 'yearly', amountInt: 10000 }
          ]
        }
      },
      include: { prices: true }
    });
    sub = await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'active', platformSubscriptionId: 'sub_credit' }
    });
    invoice = await prisma.invoice.create({ data: { tenantId: tenant.id, subscriptionId: sub.id, number: 'INV1', amount: 500, status: 'due', priceSnapshot:{ currency:'USD', monthly:0, yearly:0 }, taxSnapshot:{}, taxPercent:0, taxAmount:0, planVersion:1 } });
  });
  afterAll(async () => {
    await prisma.creditNote.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  test('create/apply/cancel credit note and export', async () => {
    const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

    const create = await request(app)
      .post('/api/platform/credit-notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ tenantId: tenant.id, amount: 100, currency: 'USD', reason: 'adj', invoiceId: invoice.id });
    expect(create.status).toBe(201);
    const noteId = create.body.id;
    expect(eventSpy).toHaveBeenCalledWith(
      PLATFORM_EVENTS.CREDIT_NOTE_CREATED,
      expect.objectContaining({ creditNoteId: noteId, amount: 100, currency: 'USD', tenantId: tenant.id })
    );

    const apply = await request(app)
      .post(`/api/platform/credit-notes/${noteId}/apply`)
      .set('Authorization', `Bearer ${token}`);
    expect(apply.status).toBe(200);
    expect(apply.body.status).toBe('applied');
    expect(eventSpy).toHaveBeenCalledWith(
      PLATFORM_EVENTS.CREDIT_NOTE_APPLIED,
      expect.objectContaining({ creditNoteId: noteId, amount: 100, currency: 'USD', tenantId: tenant.id })
    );

    const cancel = await request(app)
      .post(`/api/platform/credit-notes/${noteId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    expect(eventSpy).toHaveBeenCalledWith(
      PLATFORM_EVENTS.CREDIT_NOTE_CANCELLED,
      expect.objectContaining({ creditNoteId: noteId, amount: 100, currency: 'USD', tenantId: tenant.id })
    );

    const list = await request(app)
      .get(`/api/platform/credit-notes/tenant/${tenant.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.creditNotes.length).toBeGreaterThan(0);

    const csv = await request(app)
      .get('/api/platform/credit-notes/export/csv')
      .set('Authorization', `Bearer ${token}`);
    expect(csv.status).toBe(200);
    expect(csv.text.includes('credit_notes')).toBe(false);

    eventSpy.mockRestore();
  });

  test('apply unknown credit note returns 404', async () => {
    const res = await request(app)
      .post('/api/platform/credit-notes/unknown/apply')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
