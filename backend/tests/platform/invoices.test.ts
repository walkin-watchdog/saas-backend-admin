import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { InvoiceAccessService } from '../../src/services/invoiceAccessService';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import { hashToken } from '../../src/utils/tokenHash';

// Mocks
let pdfSpy: jest.SpyInstance;
let emailSpy: jest.SpyInstance;
beforeAll(async () => {
  // Stable PDF buffer for streaming tests
  const generator = await import('../../src/services/invoiceGenerator');
  pdfSpy = jest.spyOn(generator, 'generateInvoicePdf').mockResolvedValue(Buffer.from('%PDF-FAKE%'));
  const email = await import('../../src/services/emailService');
  emailSpy = jest.spyOn(email.EmailService, 'sendInvoiceEmail').mockResolvedValue(undefined as any);
});
afterAll(() => {
  pdfSpy?.mockRestore();
  emailSpy?.mockRestore();
});

describe('Platform Invoices: artifacts, exports, and secure access', () => {
  let adminToken: string;
  let adminUser: any;
  let tenant: any;
  let plan: any;
  let sub: any;
  let subscriber: any;
  let invoice: any;

  beforeAll(async () => {
    // permissions/role/user
    await prisma.platformPermission.createMany({
      data: [
        { code: 'invoices.read', description: 'Read invoices' },
        { code: 'invoices.write', description: 'Write invoices' },
        { code: 'invoices.export', description: 'Export invoices' },
      ]
    });
    const role = await prisma.platformRole.create({
      data: { code: 'billing_ops', name: 'Billing Ops', description: 'Billing ops' }
    });
    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['invoices.read','invoices.write','invoices.export'] } }
    });
    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({ platformRoleId: role.id, permissionId: p.id }))
    });
    adminUser = await prisma.platformUser.create({
      data: {
        email: 'invoices@platform.test',
        name: 'Invoice Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active',
        mfaEnabled: true
      }
    });
    await prisma.platformUserRole.create({ data: { platformUserId: adminUser.id, platformRoleId: role.id } });
    const jti = crypto.randomUUID();
    adminToken = signPlatformAccess({
      sub: adminUser.id,
      email: adminUser.email,
      roles: ['billing_ops'],
      permissions: ['invoices.read','invoices.write','invoices.export']
    }, jti);
    await PlatformSessionService.create(adminUser.id, jti);

    // tenant, plan, sub, subscriber and invoice
    tenant = await prisma.tenant.create({ data: { name: 'Inv Tenant', status: 'active' } });
    plan = await prisma.plan.create({
      data: {
        code: 'basic_plan',
        marketingName: 'Basic',
        marketingDescription: 'Basic plan',
        billingFrequency: 'monthly',
        featureHighlights: [],
        public: true,
        version: 1,
        prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] }
      }
    });
    sub = await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'active', platformSubscriptionId: 'sub_ext' }
    });
    subscriber = await prisma.subscriber.create({
      data: {
        tenantId: tenant.id,
        ownerEmail: 'owner@invtenant.test',
        displayName: 'Invoice Test Subscriber'
      }
    });
    invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: sub.id,
        number: 'INV-1001',
        amount: 11800,
        taxAmount: 1800,
        taxPercent: 0.18,
        status: 'paid',
        jurisdiction: 'GSTIN-XX',
        priceSnapshot: { currency: 'USD', monthly: 1000, yearly: 10000 },
        taxSnapshot: {},
        planVersion: 1
      }
    });
  });

  afterAll(async () => {
    // cleanup
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

  test('POST /api/platform/invoices/:id/pdf-url → returns signed URL, then GET streams PDF (one-time)', async () => {
    const gen = await request(app)
      .post(`/api/platform/invoices/${invoice.id}/pdf-url`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(gen.status).toBe(200);
    expect(gen.body.secureUrl).toMatch(/\/api\/platform\/invoices\/secure\//);
    expect(new Date(gen.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const secureUrl: string = gen.body.secureUrl;
    const token = secureUrl.split('/').pop()!;

    // 1st access works
    const first = await request(app).get(`/api/platform/invoices/secure/${token}`);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toMatch(/application\/pdf/);
    expect(first.body.length).toBeGreaterThan(0);

    // one-time access: second access should be 404
    const second = await request(app).get(`/api/platform/invoices/secure/${token}`);
    expect(second.status).toBe(404);
    expect(second.body.error).toMatch(/Invalid|expired|Token/);
  });

  test('Signed URL TTL enforcement → 404 after expiry', async () => {
    const gen = await request(app)
      .post(`/api/platform/invoices/${invoice.id}/pdf-url`)
      .set('Authorization', `Bearer ${adminToken}`);
    const token = gen.body.secureUrl.split('/').pop()!;
    const key = `invoice_access_${hashToken(token)}`;
    // Force-expire the token
    await PlatformConfigService.setConfig(key, { invoiceId: invoice.id, issuedBy: adminUser.id }, undefined, {
      scope: 'global',
      encrypt: true,
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).get(`/api/platform/invoices/secure/${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/expired/i);
  });

  test('Missing/invalid platform signed URL → 404', async () => {
    const res = await request(app).get('/api/platform/invoices/secure/not_a_real_token');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Invalid|expired/i);
  });

  test('Tenant-authenticated secure download: happy path (streams PDF)', async () => {
    // create a tenant user that will be embedded in the access token and verified by the route
    const tenantUser = await prisma.user.create({
      data: { email: 'admin@invtenant.test', name: 'T Admin', role: 'ADMIN', tenantId: tenant.id, password: '' }
    });

    const grant = await InvoiceAccessService.grantPdfAccess({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      user: { id: tenantUser.id, email: tenantUser.email, role: 'ADMIN', platformAdmin: false } as any,
      baseUrl: 'http://localhost'
    });
    const accessKey = grant.secureUrl.split('/').pop()!;

    const res = await request(app).get(`/api/billing/invoices/secure/${accessKey}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('Tenant-authenticated secure download: wrong-tenant claims → 403', async () => {
    // legit grant first
    const tenantUser = await prisma.user.create({
      data: { email: 'wrong@invtenant.test', name: 'Wrong', role: 'ADMIN', tenantId: tenant.id, password: '' }
    });
    const grant = await InvoiceAccessService.grantPdfAccess({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      user: { id: tenantUser.id, email: tenantUser.email, role: 'ADMIN', platformAdmin: false } as any,
      baseUrl: 'http://localhost'
    });
    const accessKey = grant.secureUrl.split('/').pop()!;
    // overwrite stored access data to simulate mismatch
    await PlatformConfigService.setConfig(
      accessKey,
      { invoiceId: invoice.id, tenantId: 'bogus-tenant', userId: tenantUser.id, token: (await PlatformConfigService.getConfig<any>(accessKey, 'global')).token },
      undefined,
      { scope: 'global', encrypt: true, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    );
    const res = await request(app).get(`/api/billing/invoices/secure/${accessKey}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid PDF token claims/);
  });

  test('Resend invoice email', async () => {
    const res = await request(app)
      .post(`/api/platform/invoices/${invoice.id}/resend`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy).toHaveBeenCalledWith(expect.objectContaining({ id: invoice.id }), subscriber.ownerEmail);
  });

  test('CSV export shape (headers and at least one row)', async () => {
    // add another invoice to ensure multiple rows work
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: sub.id,
        number: 'INV-1002',
        amount: 5000,
        status: 'paid',
        jurisdiction: 'GSTIN-XX',
        priceSnapshot: { currency: 'USD', monthly: 1000, yearly: 10000 },
        taxSnapshot: {},
        planVersion: 1
      }
    });
    const res = await request(app)
      .get('/api/platform/invoices/export/csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    // header must match service headers
    expect(lines[0]).toBe([
      'Invoice ID',
      'Invoice Number',
      'Tenant ID',
      'Tenant Name',
      'Subscription ID',
      'Amount',
      'Currency',
      'Tax Amount',
      'Tax Percent',
      'Status',
      'Jurisdiction',
      'Created At',
    ].join(','));
    // at least one of the rows contains our invoice id, number, and currency quoted
    expect(
      lines
        .slice(1)
        .some(
          l =>
            l.includes(`"${invoice.id}"`) &&
            l.includes(`"${invoice.number}"`) &&
            l.includes('"USD"'),
        ),
    ).toBe(true);
  });

  test('PDF render failure on secure streaming → 500/502', async () => {
    // temporarily make generator fail
    pdfSpy.mockRejectedValueOnce(new Error('render_fail'));
    const gen = await request(app)
      .post(`/api/platform/invoices/${invoice.id}/pdf-url`)
      .set('Authorization', `Bearer ${adminToken}`);
    const token = gen.body.secureUrl.split('/').pop()!;
    const res = await request(app).get(`/api/platform/invoices/secure/${token}`);
    // global error handler maps to 500; some stacks map to 502 — accept either
    expect([500, 502]).toContain(res.status);
  });
});
