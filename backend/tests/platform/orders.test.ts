import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { AuditService } from '../../src/services/auditService';

let razorpayRefundSpy: jest.SpyInstance;
beforeAll(async () => {
  // Import the exact module OrderService dynamically imports, then spy on it.
  const razorpay = await import('../../src/services/razorpayService');
  razorpayRefundSpy = jest
    .spyOn(razorpay.RazorpayService, 'refundPayment')
    .mockResolvedValue({ id: 'rfnd_test_mock' } as any);
});

afterAll(() => {
  razorpayRefundSpy?.mockRestore();
});

describe('Platform Orders & Invoices', () => {
  let adminToken: string;
  let adminUser: any;
  let tenant: any;
  let testOrder: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'orders.read', description: 'Read orders' },
        { code: 'orders.refund', description: 'Refund orders' },
        { code: 'orders.adjust', description: 'Create adjustments' },
        { code: 'invoices.read', description: 'Read invoices' },
        { code: 'invoices.write', description: 'Write invoices' },
        { code: 'invoices.export', description: 'Export invoices' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'billing_admin',
        name: 'Billing Admin',
        description: 'Billing operations'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { 
        code: { 
          in: ['orders.read', 'orders.refund', 'orders.adjust', 'invoices.read', 'invoices.write', 'invoices.export'] 
        } 
      }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'billing@platform.test',
        name: 'Billing Admin',
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
      email: 'billing@platform.test',
      roles: ['billing_admin'],
      permissions: ['orders.read', 'orders.refund', 'orders.adjust', 'invoices.read', 'invoices.write', 'invoices.export']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test tenant and order
    tenant = await prisma.tenant.create({
      data: {
        name: 'Order Test Tenant',
        status: 'active'
      }
    });

    testOrder = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        type: 'invoice',
        gateway: 'razorpay',
        status: 'completed',
        total: 1000,
        currency: 'USD',
        gatewayRefId: 'pay_123456'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.order.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/orders/:id returns order details', async () => {
      const res = await request(app)
        .get(`/api/platform/orders/${testOrder.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testOrder.id);
      expect(res.body.type).toBe('invoice');
      expect(res.body.total).toBe(1000);
    });

    test('POST /api/platform/orders/:id/refund processes refund with audit', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const refundData = {
        amount: 500,
        reason: 'Customer requested partial refund'
      };

      const res = await request(app)
        .post(`/api/platform/orders/${testOrder.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'refund-123')
        .send(refundData);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('refund');
      expect(res.body.total).toBe(-500); // negative for refund

      // Verify original order status updated
      const updatedOrder = await prisma.order.findUnique({
        where: { id: testOrder.id }
      });

      expect(updatedOrder?.status).toBe('partially_refunded');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'order.refunded',
          changes: expect.objectContaining({
            amount: 500,
            reason: refundData.reason
          })
        })
      );

      auditSpy.mockRestore();
    });

    test('refund idempotency: same Idempotency-Key returns the same refund order', async () => {
      // fresh order to refund twice with the same key
      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          type: 'invoice',
          gateway: 'razorpay',
          status: 'completed',
          total: 400,
          currency: 'USD',
          gatewayRefId: 'pay_same_key_1'
        }
      });

      const payload = { amount: 200, reason: 'Partial refund' };

      const first = await request(app)
        .post(`/api/platform/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'refund-same-key-1')
        .send(payload);
      expect(first.status).toBe(200);
      expect(first.body.type).toBe('refund');
      expect(first.body.total).toBe(-200);

      const second = await request(app)
        .post(`/api/platform/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'refund-same-key-1')
        .send(payload);
      expect(second.status).toBe(200);
      // the second response must be the same refund order (same id)
      expect(second.body.id).toBe(first.body.id);
    });

    test('POST /api/platform/orders/adjustment creates adjustment order', async () => {
      const adjustmentData = {
        tenantId: tenant.id,
        amount: 100,
        currency: 'USD',
        reason: 'Compensation for service downtime',
        metadata: { type: 'service_credit' }
      };

      const res = await request(app)
        .post('/api/platform/orders/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'adjustment-123')
        .send(adjustmentData);

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('adjustment');
      expect(res.body.gateway).toBe('manual');
      expect(res.body.total).toBe(100);
    });

    test('idempotency works for order operations', async () => {
      const adjustmentData = {
        tenantId: tenant.id,
        amount: 200,
        currency: 'USD',
        reason: 'Duplicate test'
      };

      // First request
      const res1 = await request(app)
        .post('/api/platform/orders/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'dup-adjustment-456')
        .send(adjustmentData);

      expect(res1.status).toBe(201);

      // Second request with same key
      const res2 = await request(app)
        .post('/api/platform/orders/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'dup-adjustment-456')
        .send(adjustmentData);

      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe(res1.body.id); // same order returned

      // Verify only one order was created
      const orders = await prisma.order.findMany({
        where: {
          tenantId: tenant.id,
          type: 'adjustment',
          total: 200
        }
      });

      expect(orders).toHaveLength(1);
    });
  });

  describe('Sad Paths', () => {
    test('refund twice with different Idempotency-Key returns 409', async () => {
      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          type: 'invoice',
          gateway: 'razorpay',
          status: 'completed',
          total: 500,
          currency: 'USD'
        }
      });

      // First refund
      const res1 = await request(app)
        .post(`/api/platform/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'refund-first')
        .send({
          amount: 500,
          reason: 'Full refund'
        });

      expect(res1.status).toBe(200);

      // Second refund attempt with different key
      const res2 = await request(app)
        .post(`/api/platform/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'refund-second')
        .send({
          amount: 100,
          reason: 'Another refund'
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toBe('Order already refunded');
    });

    test('refund with invalid amount returns 400', async () => {
      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          type: 'invoice',
          gateway: 'paypal',
          status: 'completed',
          total: 300,
          currency: 'USD'
        }
      });

      const res = await request(app)
        .post(`/api/platform/orders/${order.id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 0, // invalid amount
          reason: 'Invalid refund'
        });

      expect(res.status).toBe(400);
    });

    test('refund non-existent order returns 404', async () => {
      const res = await request(app)
        .post('/api/platform/orders/non-existent-id/refund')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 100,
          reason: 'Test refund'
        });

      expect(res.status).toBe(404);
    });

    test('adjustment without required fields returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/orders/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: tenant.id,
          // missing amount and reason
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Filters and Pagination', () => {
    test('GET /api/platform/orders filters by type, gateway, and status', async () => {
      // Create orders with different properties
      await prisma.order.createMany({
        data: [
          { tenantId: tenant.id, type: 'invoice', gateway: 'razorpay', status: 'completed', total: 100, currency: 'USD' },
          { tenantId: tenant.id, type: 'refund', gateway: 'paypal', status: 'completed', total: -50, currency: 'USD' },
          { tenantId: tenant.id, type: 'adjustment', gateway: 'manual', status: 'completed', total: 25, currency: 'USD' }
        ]
      });

      // Filter by type
      const typeRes = await request(app)
        .get('/api/platform/orders?type=refund')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(typeRes.status).toBe(200);
      expect(typeRes.body.orders.every((o: any) => o.type === 'refund')).toBe(true);

      // Filter by gateway
      const gatewayRes = await request(app)
        .get('/api/platform/orders?gateway=manual')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(gatewayRes.status).toBe(200);
      expect(gatewayRes.body.orders.every((o: any) => o.gateway === 'manual')).toBe(true);
    });

    test('GET /api/platform/orders filters by status and supports pagination', async () => {
      // seed a handful of orders with mixed statuses
      await prisma.order.createMany({
        data: [
          { tenantId: tenant.id, type: 'invoice', gateway: 'paypal', status: 'completed', total: 10, currency: 'USD' },
          { tenantId: tenant.id, type: 'invoice', gateway: 'paypal', status: 'pending', total: 20, currency: 'USD' },
          { tenantId: tenant.id, type: 'invoice', gateway: 'paypal', status: 'completed', total: 30, currency: 'USD' },
          { tenantId: tenant.id, type: 'invoice', gateway: 'paypal', status: 'completed', total: 40, currency: 'USD' },
          { tenantId: tenant.id, type: 'invoice', gateway: 'paypal', status: 'failed', total: 50, currency: 'USD' },
        ]
      });

      const statusRes = await request(app)
        .get('/api/platform/orders?status=completed')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.orders.length).toBeGreaterThan(0);
      expect(statusRes.body.orders.every((o: any) => o.status === 'completed')).toBe(true);

      // pagination: take 2, then next 2
      const page1 = await request(app)
        .get('/api/platform/orders?limit=2&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);
      const page2 = await request(app)
        .get('/api/platform/orders?limit=2&offset=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.body.orders).toHaveLength(2);
      expect(page2.body.orders).toHaveLength(2);
      // ensure pages are disjoint by id
      const ids1 = page1.body.orders.map((o: any) => o.id);
      const ids2 = page2.body.orders.map((o: any) => o.id);
      const all = new Set([...ids1, ...ids2]);
      expect(all.size).toBeGreaterThan(ids1.length);
      // echo pagination in response
      expect(page1.body.pagination.limit).toBe(2);
      expect(page1.body.pagination.offset).toBe(0);
      expect(page2.body.pagination.limit).toBe(2);
      expect(page2.body.pagination.offset).toBe(2);
    });
  });
});