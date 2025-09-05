import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { WebhookMonitorService } from '../../src/services/webhookMonitorService';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

describe('Platform Webhook Monitor', () => {
  let adminToken: string;
  let adminUser: any;
  let delivery: any;
  let webhookEvent: any;
  let endpoint1: any;
  let endpoint2: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'webhooks.read', description: 'Read webhook deliveries' },
        { code: 'webhooks.replay', description: 'Replay webhook deliveries' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'webhook_admin',
        name: 'Webhook Admin',
        description: 'Webhook management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['webhooks.read', 'webhooks.replay'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'webhook@platform.test',
        name: 'Webhook Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active',
        mfaEnabled: true
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
      email: 'webhook@platform.test',
      roles: ['webhook_admin'],
      permissions: ['webhooks.read', 'webhooks.replay']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test webhook event and delivery
    webhookEvent = await prisma.webhookEvent.create({
      data: {
        provider: 'test',
        eventId: 'evt_test_123',
        payloadHash: 'hash123',
        payload: { test: 'data' },
        status: 'received'
      }
    });

    delivery = await prisma.webhookDelivery.create({
      data: {
        provider: 'test',
        eventId: 'evt_test_123',
        payloadHash: 'hash123',
        status: 'failed',
        error: 'Test error'
      }
    });

    // Create webhook endpoints
    [endpoint1, endpoint2] = await prisma.$transaction([
      prisma.webhookEndpoint.create({
        data: {
          provider: 'razorpay',
          kind: 'platform_subscription',
          url: 'https://example.com/rzp',
          secretMasked: '****',
          active: true,
        }
      }),
      prisma.webhookEndpoint.create({
        data: {
          provider: 'paypal',
          kind: 'platform_subscription',
          url: 'https://example.com/pp',
          secretMasked: '****',
          active: false,
        }
      })
    ]);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/webhooks lists endpoints', async () => {
      const res = await request(app)
        .get('/api/platform/webhooks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.endpoints).toHaveLength(2);
    });

    test('GET /api/platform/webhooks filters by provider and active', async () => {
      const res = await request(app)
        .get('/api/platform/webhooks?provider=razorpay&active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.endpoints).toHaveLength(1);
      expect(res.body.endpoints[0].provider).toBe('razorpay');
    });
    
    test('GET /api/platform/webhooks/deliveries lists with filters', async () => {
      // Create additional deliveries for filtering
      await prisma.webhookDelivery.createMany({
        data: [
          {
            provider: 'razorpay',
            eventId: 'evt_razorpay_1',
            payloadHash: 'hash_razorpay',
            status: 'processed',
            processedAt: new Date()
          },
          {
            provider: 'paypal',
            eventId: 'evt_paypal_1',
            payloadHash: 'hash_paypal',
            status: 'failed',
            error: 'PayPal error'
          }
        ]
      });

      // Test without filters
      const allRes = await request(app)
        .get('/api/platform/webhooks/deliveries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(allRes.status).toBe(200);
      expect(allRes.body).toHaveProperty('deliveries');
      expect(allRes.body).toHaveProperty('pagination');
      expect(Array.isArray(allRes.body.deliveries)).toBe(true);

      // Filter by provider
      const providerRes = await request(app)
        .get('/api/platform/webhooks/deliveries?provider=razorpay')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(providerRes.status).toBe(200);
      expect(providerRes.body.deliveries.every((d: any) => d.provider === 'razorpay')).toBe(true);

      // Filter by status
      const statusRes = await request(app)
        .get('/api/platform/webhooks/deliveries?status=processed')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.deliveries.every((d: any) => d.status === 'processed')).toBe(true);

      // Test pagination
      const pagedRes = await request(app)
        .get('/api/platform/webhooks/deliveries?limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(pagedRes.status).toBe(200);
      expect(pagedRes.body.deliveries).toHaveLength(1);
      expect(pagedRes.body.pagination.limit).toBe(1);
      expect(pagedRes.body.pagination.offset).toBe(0);
    });

    test('GET /api/platform/webhooks/deliveries/:id returns delivery details', async () => {
      const res = await request(app)
        .get(`/api/platform/webhooks/deliveries/${delivery.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(delivery.id);
      expect(res.body.provider).toBe('test');
      expect(res.body.eventId).toBe('evt_test_123');
      expect(res.body.status).toBe('failed');
    });

    test('POST /api/platform/webhooks/deliveries/:id/replay triggers safe replay and marks processed', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});
      const subscriptionSpy = jest.spyOn(SubscriptionService, 'processWebhook')
        .mockResolvedValue({ tenantResolved: true, processed: true });

      const res = await request(app)
        .post(`/api/platform/webhooks/deliveries/${delivery.id}/replay`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify delivery was marked as processed
      const updatedDelivery = await prisma.webhookDelivery.findUnique({
        where: { id: delivery.id }
      });

      expect(updatedDelivery?.status).toBe('processed');
      expect(updatedDelivery?.processedAt).toBeTruthy();
      expect(updatedDelivery?.error).toBeNull();

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.replayed',
          resourceId: delivery.id
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.webhook.replayed',
        expect.objectContaining({
          provider: 'test',
          eventId: 'evt_test_123'
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
      subscriptionSpy.mockRestore();
    });

    test('GET /api/platform/webhooks/stats returns webhook statistics', async () => {
      const res = await request(app)
        .get('/api/platform/webhooks/stats?timeframe=day')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('timeframe', 'day');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('processed');
      expect(res.body).toHaveProperty('failed');
      expect(res.body).toHaveProperty('pending');
      expect(res.body).toHaveProperty('successRate');
      expect(typeof res.body.successRate).toBe('number');
    });

    test('Duplicate (provider, eventId) is ignored on receive', async () => {
      const provider = 'test';
      const eventId = 'evt_dup_1';
      const payload = JSON.stringify({ ok: true });

      const first = await WebhookMonitorService.recordDelivery(provider, eventId, payload);
      expect(first.duplicate).toBe(false);

      const duplicateResult = await WebhookMonitorService.recordDelivery(provider, eventId, payload);
      expect(duplicateResult.duplicate).toBe(true);
      expect(duplicateResult.status).toBeDefined();

      const deliveries = await prisma.webhookDelivery.findMany({
        where: { provider, eventId }
      });
      expect(deliveries).toHaveLength(1);
    });

    test('GET /api/platform/webhooks/deliveries supports date range filters', async () => {
      // Seed two deliveries with distinct receivedAt timestamps
      const older = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const newer = new Date();
      await prisma.webhookDelivery.createMany({
        data: [
          {
            provider: 'razorpay',
            eventId: 'evt_old_1',
            payloadHash: 'h1',
            status: 'received',
            receivedAt: older
          },
          {
            provider: 'paypal',
            eventId: 'evt_new_1',
            payloadHash: 'h2',
            status: 'received',
            receivedAt: newer
          }
        ]
      });

      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
      const end = new Date(Date.now() + 60 * 1000).toISOString(); // a minute in the future for safety

      const res = await request(app)
        .get(`/api/platform/webhooks/deliveries?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.deliveries)).toBe(true);
      // Should include the newer event, exclude the older one
      const ids = res.body.deliveries.map((d: any) => d.eventId);
      expect(ids).toContain('evt_new_1');
      expect(ids).not.toContain('evt_old_1');
    });

    test('GET /api/platform/webhooks/deliveries with an excluding date range returns empty list', async () => {
      // Choose a far-future window that will not contain any seeded deliveries
      const startFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // +1 year
      const endFuture = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();   // +1 year + 1 day

      const res = await request(app)
        .get(`/api/platform/webhooks/deliveries?startDate=${encodeURIComponent(startFuture)}&endDate=${encodeURIComponent(endFuture)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.deliveries)).toBe(true);
      expect(res.body.deliveries).toHaveLength(0);
    });
  });

  describe('Sad Paths', () => {
    test('replay without permission returns 403', async () => {
      // Create user without replay permission
      const readOnlyUser = await prisma.platformUser.create({
        data: {
          email: 'readonly@platform.test',
          name: 'Read Only',
          status: 'active'
        }
      });

      const readRole = await prisma.platformRole.create({
        data: {
          code: 'webhook_reader',
          name: 'Webhook Reader',
          description: 'Read only webhook access'
        }
      });

      const readPerm = await prisma.platformPermission.findFirst({
        where: { code: 'webhooks.read' }
      });

      await prisma.platformRolePermission.create({
        data: {
          platformRoleId: readRole.id,
          permissionId: readPerm!.id
        }
      });

      await prisma.platformUserRole.create({
        data: {
          platformUserId: readOnlyUser.id,
          platformRoleId: readRole.id
        }
      });

      const jti = crypto.randomUUID();
      const readOnlyToken = signPlatformAccess({
        sub: readOnlyUser.id,
        email: 'readonly@platform.test',
        roles: ['webhook_reader'],
        permissions: ['webhooks.read']
      }, jti);

      await PlatformSessionService.create(readOnlyUser.id, jti);

      const res = await request(app)
        .post(`/api/platform/webhooks/deliveries/${delivery.id}/replay`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');

      // Cleanup
      await prisma.platformUserRole.deleteMany({ where: { platformUserId: readOnlyUser.id } });
      await prisma.platformRolePermission.deleteMany({ where: { platformRoleId: readRole.id } });
      await prisma.platformUser.delete({ where: { id: readOnlyUser.id } });
      await prisma.platformRole.delete({ where: { id: readRole.id } });
    });

    test('replay already processed delivery returns 200 no-op', async () => {
      const processedDelivery = await prisma.webhookDelivery.create({
        data: {
          provider: 'test',
          eventId: 'evt_processed',
          payloadHash: 'hash_processed',
          status: 'processed',
          processedAt: new Date()
        }
      });

      await prisma.webhookEvent.create({
        data: {
          provider: 'test',
          eventId: 'evt_processed',
          payloadHash: 'hash_processed',
          payload: { test: 'processed' }
        }
      });

      const res = await request(app)
        .post(`/api/platform/webhooks/deliveries/${processedDelivery.id}/replay`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('replay non-existent deliveryId returns 404', async () => {
      const res = await request(app)
        .post('/api/platform/webhooks/deliveries/non-existent-id/replay')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    test('duplicate with different payload hash throws WEBHOOK_REPLAY_HASH_MISMATCH', async () => {
      await expect(
        WebhookMonitorService.recordDelivery(
          'test',
          'evt_test_123',
          JSON.stringify({ test: 'different_data' })
        )
      ).rejects.toThrow('WEBHOOK_REPLAY_HASH_MISMATCH');
    });
  });
});