import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { OffboardingJobService } from '../../src/services/offboardingJobService';
import { OffboardTenantJob } from '../../src/jobs/offboardTenantJob';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

describe('Platform Tenant Offboarding', () => {
  let adminToken: string;
  let adminUser: any;
  let testTenant: any;
  let subscription: any;
  let plan: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'tenants.read', description: 'Read tenants' },
        { code: 'tenants.offboard', description: 'Offboard tenants' },
        { code: 'tenants.restore', description: 'Restore tenants' },
        { code: 'tenants.hard_delete', description: 'Hard delete tenants' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'tenant_admin',
        name: 'Tenant Admin',
        description: 'Tenant lifecycle management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['tenants.read', 'tenants.offboard', 'tenants.restore', 'tenants.hard_delete'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'offboard@platform.test',
        name: 'Offboard Admin',
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
      email: 'offboard@platform.test',
      roles: ['tenant_admin'],
      permissions: ['tenants.read', 'tenants.offboard', 'tenants.restore', 'tenants.hard_delete']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test tenant with subscription
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Offboard Test Tenant',
        status: 'active'
      }
    });

    plan = await prisma.plan.create({
      data: {
        code: 'offboard_plan',
        billingFrequency: 'monthly',
        marketingName: 'Offboard Plan',
        marketingDescription: 'Plan for offboarding tests',
        featureHighlights: [],
        public: true,
        active: true,
        prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 1000 }, { currency: 'USD', period: 'yearly', amountInt: 10000 } ] }
      }
    });

    subscription = await prisma.subscription.create({
      data: {
        tenantId: testTenant.id,
        planId: plan.id,
        status: 'active'
      }
    });

    await prisma.subscriber.create({
      data: {
        tenantId: testTenant.id,
        displayName: 'Offboard Test',
        ownerEmail: 'owner@offboard.test'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.offboardingJob.deleteMany();
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
    test('POST /api/platform/tenants/:tenantId/offboard schedules with reason and emits events', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const offboardData = {
        reason: 'Policy violation',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        retentionDays: 30
      };

      const res = await request(app)
        .post(`/api/platform/tenants/${testTenant.id}/offboard`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'offboard-123')
        .send(offboardData);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Tenant offboarding scheduled successfully');
      expect(res.body.retentionDays).toBe(30);

      // Verify job was created
      const job = await prisma.offboardingJob.findUnique({
        where: { tenantId: testTenant.id }
      });

      expect(job).toBeTruthy();
      expect(job?.reason).toBe('Policy violation');
      expect(job?.retentionDays).toBe(30);
      expect(job?.status).toBe('scheduled');

      // Verify tenant status updated
      const updatedTenant = await prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });

      expect(updatedTenant?.status).toBe('suspended');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.offboard_scheduled',
          tenantId: testTenant.id,
          reason: 'Policy violation'
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.tenant.offboarding_scheduled',
        expect.objectContaining({
          tenantId: testTenant.id,
          reason: 'Policy violation'
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('POST /api/platform/tenants/:tenantId/restore cancels offboarding and restores tenant', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const restoreData = {
        reason: 'Issue resolved'
      };

      const res = await request(app)
        .post(`/api/platform/tenants/${testTenant.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(restoreData);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Tenant restored successfully');

      // Verify job was cancelled
      const job = await prisma.offboardingJob.findUnique({
        where: { tenantId: testTenant.id }
      });

      expect(job).toBeNull(); // Job should be deleted when cancelled

      // Verify tenant status restored
      const restoredTenant = await prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });

      expect(restoredTenant?.status).toBe('active');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.offboard_cancelled',
          tenantId: testTenant.id,
          reason: 'Issue resolved'
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.tenant.restored',
        expect.objectContaining({
          tenantId: testTenant.id
        })
      );

      // "Data intact": subscriptions never cancelled by schedule/restore
      const subs = await prisma.subscription.findMany({ where: { tenantId: testTenant.id } });
      expect(subs.length).toBeGreaterThan(0);
      for (const s of subs) {
        expect(s.status).toBe('active');
      }

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('offboarding job processes correctly', async () => {
      // Create a job due for processing
      const processTenant = await prisma.tenant.create({
        data: { name: 'Process Test', status: 'active' }
      });

      const processPlan = await prisma.plan.create({
        data: {
          code: 'process_plan',
          billingFrequency: 'monthly',
          marketingName: 'Process Plan',
          marketingDescription: 'Plan for processing test',
          featureHighlights: [],
          public: true,
          active: true,
          prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 500 }, { currency: 'USD', period: 'yearly', amountInt: 5000 } ] }
        }
      });

      await prisma.subscription.create({
        data: {
          tenantId: processTenant.id,
          planId: processPlan.id,
          status: 'active'
        }
      });

      const job = await OffboardingJobService.schedule({
        tenantId: processTenant.id,
        reason: 'Processing test',
        scheduledAt: new Date(Date.now() - 1000), // Due now
        retentionDays: 30,
        initiatedById: adminUser.id
      });

      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      // Process offboarding
      await OffboardTenantJob.processOffboarding();

      // Verify job was completed
      const completedJob = await prisma.offboardingJob.findUnique({
        where: { id: job.id }
      });

      expect(completedJob?.status).toBe('completed');
      expect(completedJob?.completedAt).toBeTruthy();

      // Verify tenant is suspended
      const processedTenant = await prisma.tenant.findUnique({
        where: { id: processTenant.id }
      });

      expect(processedTenant?.status).toBe('suspended');

      // Verify event was emitted
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.tenant.offboarded',
        expect.objectContaining({
          tenantId: processTenant.id,
          reason: 'Processing test'
        })
      );

      eventSpy.mockRestore();

      // Cleanup
      await prisma.subscription.deleteMany({ where: { tenantId: processTenant.id } });
      await prisma.plan.delete({ where: { id: processPlan.id } });
      await prisma.tenant.delete({ where: { id: processTenant.id } });
    });
  });

  describe('Sad Paths', () => {
    test('restore non-existent offboarding returns 400', async () => {
      const nonOffboardTenant = await prisma.tenant.create({
        data: { name: 'No Offboard', status: 'active' }
      });

      const res = await request(app)
        .post(`/api/platform/tenants/${nonOffboardTenant.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Should fail'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Tenant is not scheduled for offboarding');

      // Cleanup
      await prisma.tenant.delete({ where: { id: nonOffboardTenant.id } });
    });

    test('hard delete before retention period returns 409', async () => {
      // Create tenant with recent offboarding job
      const recentTenant = await prisma.tenant.create({
        data: { name: 'Recent Offboard', status: 'suspended' }
      });

      await OffboardingJobService.schedule({
        tenantId: recentTenant.id,
        reason: 'Too recent',
        scheduledAt: new Date(), // Just scheduled
        retentionDays: 30,
        initiatedById: adminUser.id
      });

      const res = await request(app)
        .delete(`/api/platform/tenants/${recentTenant.id}/hard-delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Should fail - too recent'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Tenant cannot be hard deleted yet - retention period not elapsed');
      expect(res.body).toHaveProperty('canDeleteAt');

      // Cleanup
      await prisma.offboardingJob.deleteMany({ where: { tenantId: recentTenant.id } });
      await prisma.tenant.delete({ where: { id: recentTenant.id } });
    });

    test('schedule duplicate offboarding is idempotent', async () => {
      const duplicateTenant = await prisma.tenant.create({
        data: { name: 'Duplicate Test', status: 'active' }
      });

      const firstRes = await request(app)
        .post(`/api/platform/tenants/${duplicateTenant.id}/offboard`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'duplicate-offboard')
        .send({
          reason: 'First attempt',
          retentionDays: 30
        });

      expect(firstRes.status).toBe(200);

      // Second attempt with same idempotency key
      const secondRes = await request(app)
        .post(`/api/platform/tenants/${duplicateTenant.id}/offboard`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'duplicate-offboard')
        .send({
          reason: 'Second attempt',
          retentionDays: 30
        });

      expect(secondRes.status).toBe(200);

      // Verify only one job exists
      const jobs = await prisma.offboardingJob.findMany({
        where: { tenantId: duplicateTenant.id }
      });

      expect(jobs).toHaveLength(1);

      // Cleanup
      await prisma.offboardingJob.deleteMany({ where: { tenantId: duplicateTenant.id } });
      await prisma.tenant.delete({ where: { id: duplicateTenant.id } });
    });

    test('hard delete non-existent tenant returns 404', async () => {
      const res = await request(app)
        .delete('/api/platform/tenants/non-existent-tenant/hard-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Testing non-existent'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    test('offboarding job failure is handled gracefully', async () => {
      const failTenant = await prisma.tenant.create({
        data: { name: 'Fail Test', status: 'active' }
      });

      const job = await OffboardingJobService.schedule({
        tenantId: failTenant.id,
        reason: 'Will fail',
        scheduledAt: new Date(Date.now() - 1000),
        retentionDays: 30,
        initiatedById: adminUser.id
      });

      // Mock the offboarding process to fail
      const performSpy = jest.spyOn(OffboardTenantJob as any, 'performOffboarding')
        .mockRejectedValue(new Error('Offboarding failed'));

      // Process offboarding (should fail)
      await OffboardTenantJob.processOffboarding();

      // Verify job was marked as failed (reset to scheduled)
      const failedJob = await prisma.offboardingJob.findUnique({
        where: { id: job.id }
      });

      expect(failedJob?.status).toBe('scheduled'); // Failed jobs are reset to scheduled
      expect(failedJob?.processingAt).toBeNull();

      performSpy.mockRestore();

      // Cleanup
      await prisma.offboardingJob.deleteMany({ where: { tenantId: failTenant.id } });
      await prisma.tenant.delete({ where: { id: failTenant.id } });
    });

    test('restore outside window returns 409', async () => {
      // Create tenant that's already been offboarded (completed status)
      const offboardedTenant = await prisma.tenant.create({
        data: { name: 'Already Offboarded', status: 'suspended' }
      });

      // Create a completed offboarding job
      await prisma.offboardingJob.create({
        data: {
          tenantId: offboardedTenant.id,
          reason: 'Already completed',
          scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          retentionDays: 30,
          initiatedById: adminUser.id,
          status: 'completed',
          completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // Completed 5 days ago
        }
      });

      const res = await request(app)
        .post(`/api/platform/tenants/${offboardedTenant.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Should fail - outside window'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Tenant restore not available - offboarding already completed');

      // Cleanup
      await prisma.offboardingJob.deleteMany({ where: { tenantId: offboardedTenant.id } });
      await prisma.tenant.delete({ where: { id: offboardedTenant.id } });
    });

    test('hard delete blocked if completed recently even if scheduled long ago (retention anchors on completedAt)', async () => {
      const t = await prisma.tenant.create({
        data: { name: 'Recent Completion', status: 'suspended' }
      });

      await prisma.subscriber.create({
        data: { tenantId: t.id, displayName: 'Recent Completion', ownerEmail: 'rc@test.com' }
      });

      // Scheduled 40 days ago but only completed 2 days ago
      await prisma.offboardingJob.create({
        data: {
          tenantId: t.id,
          reason: 'Completed recently',
          scheduledAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
          retentionDays: 30,
          initiatedById: adminUser.id,
          status: 'completed',
          completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        }
      });

      const res = await request(app)
        .delete(`/api/platform/tenants/${t.id}/hard-delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Too soon after completion' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Tenant cannot be hard deleted yet - retention period not elapsed');
      expect(res.body).toHaveProperty('canDeleteAt');

      await prisma.offboardingJob.deleteMany({ where: { tenantId: t.id } });
      await prisma.subscriber.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
    });
  });

  describe('Happy Paths - Additional', () => {
    test('POST /hard-delete after retention period performs delete', async () => {
      // Create tenant with old offboarding job (past retention period)
      const oldTenant = await prisma.tenant.create({
        data: { name: 'Old Offboard', status: 'suspended' }
      });

      // Create plan and subscription for this tenant
      const deletePlan = await prisma.plan.create({
        data: {
          code: 'delete_plan',
          billingFrequency: 'monthly',
          marketingName: 'Delete Plan',
          marketingDescription: 'Plan for deletion test',
          featureHighlights: [],
          public: true,
          active: true,
          prices: { create: [ { currency: 'USD', period: 'monthly', amountInt: 500 }, { currency: 'USD', period: 'yearly', amountInt: 5000 } ] }
        }
      });

      await prisma.subscription.create({
        data: {
          tenantId: oldTenant.id,
          planId: deletePlan.id,
          status: 'cancelled'
        }
      });

      await prisma.subscriber.create({
        data: {
          tenantId: oldTenant.id,
          displayName: 'Delete Test',
          ownerEmail: 'delete@test.com'
        }
      });

      // Create a completed offboarding job completed beyond retention
      const completedLongAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      await prisma.offboardingJob.create({
        data: {
          tenantId: oldTenant.id,
          reason: 'Old enough for deletion',
          scheduledAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
          retentionDays: 30,
          initiatedById: adminUser.id,
          status: 'completed',
          completedAt: completedLongAgo
        }
      });

      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .delete(`/api/platform/tenants/${oldTenant.id}/hard-delete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Retention period elapsed'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Tenant permanently deleted');

      // Verify tenant was deleted
      const deletedTenant = await prisma.tenant.findUnique({
        where: { id: oldTenant.id }
      });
      expect(deletedTenant).toBeNull();

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.hard_deleted',
          resourceId: oldTenant.id,
          reason: 'Retention period elapsed'
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.tenant.hard_deleted',
        expect.objectContaining({
          tenantId: oldTenant.id
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();

      // Cleanup plan
      await prisma.plan.delete({ where: { id: deletePlan.id } });
    });
  });
});