import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { SubscriptionService } from '../../src/services/subscriptionService';
import crypto from 'crypto';

describe('Platform Audit Log & Metrics', () => {
  let adminToken: string;
  let viewerToken: string;
  let adminUser: any;
  let viewerUser: any;
  let auditEntry: any;

  beforeAll(async () => {
    // Create permissions and roles
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'audit.read', description: 'Read audit logs' },
        { code: 'audit.export', description: 'Export audit logs' },
        { code: 'metrics.read', description: 'Read metrics' },
        { code: 'webhooks.replay', description: 'Replay webhook deliveries' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'audit_admin',
        name: 'Audit Admin',
        description: 'Audit management'
      }
    });

    const viewerRole = await prisma.platformRole.create({
      data: {
        code: 'audit_viewer',
        name: 'Audit Viewer',
        description: 'Audit read only'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['audit.read', 'audit.export', 'metrics.read', 'webhooks.replay'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: [
        ...perms.map(p => ({
          platformRoleId: adminRole.id,
          permissionId: p.id
        })),
        {
          platformRoleId: viewerRole.id,
          permissionId: perms.find(p => p.code === 'audit.read')!.id
        },
        {
          platformRoleId: viewerRole.id,
          permissionId: perms.find(p => p.code === 'metrics.read')!.id
        }
      ]
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'audit@platform.test',
        name: 'Audit Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active'
      }
    });

    viewerUser = await prisma.platformUser.create({
      data: {
        email: 'viewer@platform.test',
        name: 'Audit Viewer',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active'
      }
    });

    await prisma.platformUserRole.createMany({
      data: [
        { platformUserId: adminUser.id, platformRoleId: adminRole.id },
        { platformUserId: viewerUser.id, platformRoleId: viewerRole.id }
      ]
    });

    // Create tokens
    const adminJti = crypto.randomUUID();
    adminToken = signPlatformAccess({
      sub: adminUser.id,
      email: 'audit@platform.test',
      roles: ['audit_admin'],
      permissions: ['audit.read', 'audit.export', 'metrics.read', 'webhooks.replay']
    }, adminJti);

    const viewerJti = crypto.randomUUID();
    viewerToken = signPlatformAccess({
      sub: viewerUser.id,
      email: 'viewer@platform.test',
      roles: ['audit_viewer'],
      permissions: ['audit.read', 'metrics.read']
    }, viewerJti);

    await PlatformSessionService.create(adminUser.id, adminJti);
    await PlatformSessionService.create(viewerUser.id, viewerJti);

    // Create test audit entry with sensitive data
    auditEntry = await prisma.auditLog.create({
      data: {
        platformUserId: adminUser.id,
        action: 'test.action',
        resource: 'test_resource',
        resourceId: 'test_123',
        changes: {
          email: 'sensitive@example.com',
          password: 'secret123',
          token: 'bearer_token_123',
          normalField: 'normal_value'
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.auditLog.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/audit-log filters by actor/action/date with secrets redacted', async () => {
      // Create additional audit entries for filtering
      const tenant = await prisma.tenant.create({
        data: { name: 'Audit Test Tenant', status: 'active' }
      });

      await prisma.auditLog.createMany({
        data: [
          {
            platformUserId: viewerUser.id,
            tenantId: tenant.id,
            action: 'user.created',
            resource: 'user',
            changes: { email: 'redacted@example.com' }
          },
          {
            platformUserId: adminUser.id,
            action: 'config.updated',
            resource: 'config'
          }
        ]
      });

      // Filter by platformUserId
      const userRes = await request(app)
        .get(`/api/platform/audit-log?platformUserId=${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(userRes.status).toBe(200);
      expect(userRes.body.logs.every((l: any) => l.platformUserId === adminUser.id)).toBe(true);

      // Filter by action
      const actionRes = await request(app)
        .get('/api/platform/audit-log?action=user.created')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(actionRes.status).toBe(200);
      expect(actionRes.body.logs.every((l: any) => l.action.includes('user.created'))).toBe(true);

      // Filter by tenantId
      const tenantRes = await request(app)
        .get(`/api/platform/audit-log?tenantId=${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(tenantRes.status).toBe(200);
      expect(tenantRes.body.logs.every((l: any) => l.tenantId === tenant.id)).toBe(true);

      // Verify secrets are redacted
      const entryWithChanges = userRes.body.logs.find((l: any) => l.changes?.email);
      if (entryWithChanges) {
        expect(entryWithChanges.changes.email).toBe('[REDACTED]');
      }

      // Cleanup
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('GET /api/platform/audit-log/:id returns specific entry', async () => {
      const res = await request(app)
        .get(`/api/platform/audit-log/${auditEntry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(auditEntry.id);
      expect(res.body.action).toBe('test.action');
      expect(res.body.changes.normalField).toBe('normal_value');
      // Verify redaction happened
      expect(res.body.changes.email).toBe('[REDACTED]');
      expect(res.body.changes.password).toBe('[REDACTED]');
      expect(res.body.changes.token).toBe('[REDACTED]');
    });

    test('GET /api/platform/audit-log/export/csv returns CSV format', async () => {
      const res = await request(app)
        .get('/api/platform/audit-log/export/csv')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Express often appends charset; accept either
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('audit-log-export.csv');

      const lines = res.text.split('\n');
      expect(lines[0]).toContain('ID');
      expect(lines[0]).toContain('Platform User ID');
      expect(lines[0]).toContain('Action');
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row
    });

    test('GET /api/platform/metrics/dashboard returns comprehensive metrics', async () => {
      // Create test data for metrics
      const tenant = await prisma.tenant.create({
        data: { name: 'Metrics Test', status: 'active' }
      });

      const plan = await prisma.plan.create({
        data: {
          code: 'metrics_plan',
          billingFrequency: 'monthly',
          marketingName: 'Metrics Plan',
          marketingDescription: 'Plan for metrics',
          featureHighlights: [],
          public: true,
          active: true,
          prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] }
        }
      });

      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'active'
        }
      });

      const res = await request(app)
        .get('/api/platform/metrics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tenants');
      expect(res.body).toHaveProperty('subscriptions');
      expect(res.body).toHaveProperty('revenue');
      expect(res.body).toHaveProperty('requests');
      expect(res.body.tenants).toHaveProperty('total');
      expect(res.body.tenants).toHaveProperty('active');
      expect(res.body.subscriptions).toHaveProperty('active');
      expect(res.body.revenue).toHaveProperty('total');
      expect(typeof res.body.revenue.total).toBe('object');
      expect(res.body.revenue).toHaveProperty('mrr');
      expect(res.body.revenue).toHaveProperty('churnRate');
      expect(res.body.revenue).toHaveProperty('arpa');
      expect(res.body.revenue).toHaveProperty('ltv');
      expect(res.body.revenue).toHaveProperty('periodChange');
      expect(res.body.revenue.periodChange).toHaveProperty('percentage');
      expect(res.body.revenue).toHaveProperty('timeSeriesData');
      expect(res.body.revenue.timeSeriesData).toHaveProperty('mrr');
      expect(res.body.revenue.timeSeriesData).toHaveProperty('churn');
      expect(res.body.requests).toHaveProperty('conversionRate');
      expect(res.body).toHaveProperty('errorSpikes');

      // Cleanup
      await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.plan.delete({ where: { id: plan.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('GET /api/platform/audit-log supports pagination', async () => {
      // Seed a couple extra logs
      await prisma.auditLog.createMany({
        data: [
          { platformUserId: adminUser.id, action: 'pagin.test.1', resource: 'x' },
          { platformUserId: adminUser.id, action: 'pagin.test.2', resource: 'y' },
        ]
      });
      const res = await request(app)
        .get('/api/platform/audit-log?limit=1&offset=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBe(1);
      expect(res.body).toHaveProperty('pagination.total');
      expect(res.body.pagination.limit).toBe(1);
      expect(res.body.pagination.offset).toBe(1);
    });

    test('GET /api/platform/audit-log filters by date range', async () => {
      // Seed one old and one recent entry
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const oldLog = await prisma.auditLog.create({
        data: {
          platformUserId: adminUser.id,
          action: 'date.filter.old',
          resource: 'audit',
          createdAt: tenDaysAgo
        }
      });
      const recentLog = await prisma.auditLog.create({
        data: {
          platformUserId: adminUser.id,
          action: 'date.filter.recent',
          resource: 'audit',
          createdAt: new Date()
        }
      });

      // Only include last 24h
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .get(`/api/platform/audit-log?startDate=${encodeURIComponent(start)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.logs.map((l: any) => l.id);
      expect(ids).toContain(recentLog.id);
      expect(ids).not.toContain(oldLog.id);
    });

    test('GET /api/platform/metrics/revenue returns MRR/churn/ARPA/LTV/failures', async () => {
        // Seed tenant/subscription first (invoice requires references)
        const now = new Date();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 5);
        const currMonthStart = new Date(now.getFullYear(), now.getMonth(), 5);
    
        const revTenant = await prisma.tenant.create({
            data: { name: 'Revenue Tenant', status: 'active' }
        });
        const plan = await prisma.plan.create({
        data: {
          code: 'rev_plan',
          billingFrequency: 'monthly',
          marketingName: 'Rev Plan',
          marketingDescription: 'Revenue Plan',
          featureHighlights: [],
          public: true,
          active: true,
          prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 5000 }, { currency: 'USD', period: 'yearly', amountInt: 0 } ] }
        }
      });
      const sub = await prisma.subscription.create({
        data: { tenantId: revTenant.id, planId: plan.id, status: 'active' }
      });

      // Minimal snapshot for required JSON field
      const priceSnapshot: any = { planCode: plan.code, currency: 'USD', monthly: 5000, yearly: 0 };
      const taxSnapshot: any = { taxPercent: 0, taxAmount: 0, jurisdiction: null };
      await prisma.invoice.createMany({
        data: [
          { number: 'INV-prev-1', tenantId: revTenant.id, subscriptionId: sub.id, amount: 2000, status: 'paid',   priceSnapshot, taxSnapshot, planVersion: 1, createdAt: prevMonthStart },
          { number: 'INV-curr-1', tenantId: revTenant.id, subscriptionId: sub.id, amount: 3000, status: 'paid',   priceSnapshot, taxSnapshot, planVersion: 1, createdAt: currMonthStart },
          { number: 'INV-curr-2', tenantId: revTenant.id, subscriptionId: sub.id, amount: 1500, status: 'failed', priceSnapshot, taxSnapshot, planVersion: 1, createdAt: new Date() },
        ]
      });
      const revTenantInr = await prisma.tenant.create({ data: { name: 'Revenue INR', status: 'active' } });
      const subInr = await prisma.subscription.create({ data: { tenantId: revTenantInr.id, planId: plan.id, status: 'active', currency: 'INR' } });
      const priceSnapshotInr: any = { planCode: plan.code, currency: 'INR', monthly: 80000, yearly: 0 };
      await prisma.invoice.create({
        data: {
          number: 'INV-inr-1',
          tenantId: revTenantInr.id,
          subscriptionId: subInr.id,
          amount: 80000,
          currency: 'INR',
          status: 'paid',
          priceSnapshot: priceSnapshotInr,
          taxSnapshot,
          planVersion: 1,
          createdAt: currMonthStart
        }
      });

      const res = await request(app)
        .get('/api/platform/metrics/revenue?timeframe=month')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mrr');
      expect(res.body).toHaveProperty('churnRate');
      expect(res.body).toHaveProperty('arpa');
      expect(res.body).toHaveProperty('ltv');
      expect(res.body).toHaveProperty('failures');
      expect(typeof res.body.mrr).toBe('object');
      expect(res.body.mrr.USD).toBeDefined();
      expect(typeof res.body.arpa).toBe('object');
      expect(res.body.arpa.USD).toBeDefined();
      expect(typeof res.body.ltv).toBe('object');
      expect(res.body.ltv.USD).toBeDefined();
      expect(res.body.currentPeriod.revenue.USD).toBeCloseTo(30);
      expect(res.body.currentPeriod.revenue.INR).toBeCloseTo(800);
      expect(res.body.failures).toBeGreaterThanOrEqual(1);

      // Cleanup rev-specific seed
      await prisma.invoice.deleteMany({ where: { tenantId: { in: [revTenant.id, revTenantInr.id] } } });
      await prisma.subscription.deleteMany({ where: { tenantId: { in: [revTenant.id, revTenantInr.id] } } });
      await prisma.tenant.delete({ where: { id: revTenantInr.id } });
      await prisma.plan.delete({ where: { id: plan.id } });
      await prisma.tenant.delete({ where: { id: revTenant.id } });
    });

    test('GET /api/platform/metrics/dashboard counts signups and conversion when seeded', async () => {
      // Seed signups (tenant created within timeframe)
      const signupTenant = await prisma.tenant.create({
        data: { name: 'Signup Tenant', status: 'active' }
      });

      // Seed requests: one converted, one not
      const req1 = await prisma.requestFormSubmission.create({
        data: {
          kind: 'trial',
          email: 'converted@example.com',
          status: 'converted',
          convertedAt: new Date(),
          createdAt: new Date()
        }
      });
      const req2 = await prisma.requestFormSubmission.create({
        data: {
          kind: 'contact',
          email: 'new@example.com',
          createdAt: new Date()
        }
      });

      const res = await request(app)
        // Narrow window so only our new seeds are counted
        .get('/api/platform/metrics/dashboard?timeframe=day')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tenants.newSignups');
      expect(res.body.tenants.newSignups).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('requests.new');
      expect(res.body).toHaveProperty('requests.converted');
      expect(res.body).toHaveProperty('requests.conversionRate');
      expect(res.body.requests.new).toBeGreaterThanOrEqual(2);
      expect(res.body.requests.converted).toBeGreaterThanOrEqual(1);
      expect(res.body.requests.conversionRate).toBeGreaterThan(0);

      // Cleanup
      await prisma.requestFormSubmission.delete({ where: { id: req1.id } });
      await prisma.requestFormSubmission.delete({ where: { id: req2.id } });
      await prisma.tenant.delete({ where: { id: signupTenant.id } });
    });

    test('GET /api/platform/metrics/growth returns daily datapoints', async () => {
      const res = await request(app)
        .get('/api/platform/metrics/growth?days=5')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(5);
      expect(res.body[0]).toHaveProperty('date');
      expect(res.body[0]).toHaveProperty('signups');
      expect(res.body[0]).toHaveProperty('revenue');
    });
  });

  describe('Sad Paths', () => {
    test('access without permission returns 403', async () => {
      // Create user without any permissions
      const noPermUser = await prisma.platformUser.create({
        data: {
          email: 'noperm@platform.test',
          name: 'No Permissions',
          status: 'active'
        }
      });

      const jti = crypto.randomUUID();
      const noPermToken = signPlatformAccess({
        sub: noPermUser.id,
        email: 'noperm@platform.test',
        roles: [],
        permissions: []
      }, jti);

      await PlatformSessionService.create(noPermUser.id, jti);

      const res = await request(app)
        .get('/api/platform/audit-log')
        .set('Authorization', `Bearer ${noPermToken}`);

      expect(res.status).toBe(403);

      // Cleanup
      await prisma.platformUser.delete({ where: { id: noPermUser.id } });
    });

    test('export without audit.export permission returns 403', async () => {
      const res = await request(app)
        .get('/api/platform/audit-log/export/csv')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    });

    test('invalid filter params return 400', async () => {
      const res = await request(app)
        .get('/api/platform/audit-log?startDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    test('replay webhook processing failure updates status correctly', async () => {
      const failedDelivery = await prisma.webhookDelivery.create({
        data: {
          provider: 'test',
          eventId: 'evt_fail_replay',
          payloadHash: 'hash_fail',
          status: 'failed'
        }
      });

      await prisma.webhookEvent.create({
        data: {
          provider: 'test',
          eventId: 'evt_fail_replay',
          payloadHash: 'hash_fail',
          payload: { test: 'fail' }
        }
      });

      const subscriptionSpy = jest.spyOn(SubscriptionService, 'processWebhook')
        .mockRejectedValue(new Error('Processing failed'));

      const res = await request(app)
        .post(`/api/platform/webhooks/deliveries/${failedDelivery.id}/replay`)
        .set('Authorization', `Bearer ${adminToken}`);
      // Expect server to handle the rejection and report failure
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Verify delivery status updated to failed
      const updatedDelivery = await prisma.webhookDelivery.findUnique({
        where: { id: failedDelivery.id }
      });

      expect(updatedDelivery?.status).toBe('failed');
      expect(updatedDelivery?.error).toBe('Processing failed');

      subscriptionSpy.mockRestore();
    });
  });
});