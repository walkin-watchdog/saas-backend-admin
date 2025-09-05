import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { KycService } from '../../src/services/kycService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

describe('KYC & Compliance Management', () => {
  let adminToken: string;
  let adminUser: any;
  let tenant: any;
  let subscriber: any;
  let kycRecord: any;
  let initialUpdatedAt: Date;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'kyc.read', description: 'Read KYC records' },
        { code: 'kyc.write', description: 'Write KYC records' },
        { code: 'kyc.review', description: 'Review KYC records' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'kyc_admin',
        name: 'KYC Admin',
        description: 'KYC management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['kyc.read', 'kyc.write', 'kyc.review'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'kyc@platform.test',
        name: 'KYC Admin',
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
      email: 'kyc@platform.test',
      roles: ['kyc_admin'],
      permissions: ['kyc.read', 'kyc.write', 'kyc.review']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test tenant and subscriber
    tenant = await prisma.tenant.create({
      data: {
        name: 'KYC Test Tenant',
        status: 'active'
      }
    });

    subscriber = await prisma.subscriber.create({
      data: {
        tenantId: tenant.id,
        displayName: 'KYC Test Subscriber',
        ownerEmail: 'owner@kyc.test',
        kycStatus: 'pending'
      }
    });

    // Create test KYC record
    kycRecord = await prisma.kycRecord.create({
      data: {
        tenantId: tenant.id,
        status: 'pending',
        provider: 'manual',
        refId: 'KYC-123'
      }
    });
    initialUpdatedAt = kycRecord.updatedAt;
    expect(kycRecord.createdAt).toBeTruthy();
    expect(kycRecord.updatedAt).toBeTruthy();
  });

  afterAll(async () => {
    await prisma.kycRecord.deleteMany();
    await prisma.subscriber.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/kyc lists with filters', async () => {
      // Create additional records for filtering
      await prisma.kycRecord.createMany({
        data: [
          {
            tenantId: tenant.id,
            status: 'verified',
            provider: 'onfido',
            refId: 'KYC-456'
          },
          {
            tenantId: tenant.id,
            status: 'rejected',
            provider: 'manual',
            refId: 'KYC-789'
          }
        ]
      });

      // Defaults & ordering: no filters
      const defaultsRes = await request(app)
        .get('/api/platform/kyc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(defaultsRes.status).toBe(200);
      expect(defaultsRes.body.pagination.limit).toBe(50);
      expect(defaultsRes.body.pagination.offset).toBe(0);
      // Ensure submittedAt is sorted DESC
      const times = defaultsRes.body.records.map((r: any) => new Date(r.submittedAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
      // Limit/offset: the second page's first item must be <= first page's first item by submittedAt
      const firstItem = defaultsRes.body.records[0];
      const pagedRes = await request(app)
        .get('/api/platform/kyc?limit=1&offset=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pagedRes.status).toBe(200);
      expect(pagedRes.body.records).toHaveLength(1);
      expect(new Date(pagedRes.body.records[0].submittedAt).getTime())
        .toBeLessThanOrEqual(new Date(firstItem.submittedAt).getTime());

      // Filter by status
      const statusRes = await request(app)
        .get('/api/platform/kyc?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.records.every((r: any) => r.status === 'pending')).toBe(true);

      // Filter by tenant
      const tenantRes = await request(app)
        .get(`/api/platform/kyc?tenantId=${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(tenantRes.status).toBe(200);
      expect(tenantRes.body.records.every((r: any) => r.tenantId === tenant.id)).toBe(true);

      // Filter by provider
      const providerRes = await request(app)
        .get('/api/platform/kyc?provider=manual')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(providerRes.status).toBe(200);
      expect(providerRes.body.records.every((r: any) => r.provider === 'manual')).toBe(true);
    });

    test('POST /:id/review with verified status updates subscriber', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/platform/kyc/${kycRecord.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          notes: 'Documents verified successfully'
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('verified');
      expect(res.body.notes).toBe('Documents verified successfully');
      expect(res.body.reviewedById).toBe(adminUser.id);
      expect(res.body.reviewedAt).toBeTruthy();
      expect(new Date(res.body.reviewedAt).getTime()).toBeGreaterThan(0);
      const dbRecord = await prisma.kycRecord.findUnique({ where: { id: kycRecord.id } });
      expect(new Date(dbRecord!.updatedAt).getTime()).toBeGreaterThan(new Date(initialUpdatedAt).getTime());
      // Verify subscriber KYC status updated
      const updatedSubscriber = await prisma.subscriber.findUnique({
        where: { tenantId: tenant.id }
      });
      expect(updatedSubscriber?.kycStatus).toBe('verified');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kyc.verified',
          tenantId: tenant.id
        })
      );

      // Also verify generic review audit entry
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kyc.review',
          tenantId: tenant.id,
          resource: 'kyc_record',
          resourceId: kycRecord.id,
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.kyc.approved',
        expect.objectContaining({
          tenantId: tenant.id,
          recordId: kycRecord.id
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('POST /api/platform/kyc creates a record and emits submitted event; GET /:id fetches it', async () => {
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});
      const createRes = await request(app)
        .post('/api/platform/kyc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: tenant.id,
          provider: 'manual',
          refId: 'KYC-NEW',
          notes: 'Creating via API'
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeTruthy();
      expect(createRes.body.tenantId).toBe(tenant.id);
      expect(createRes.body.status).toBe('pending');
      // submitted event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.kyc.submitted',
        expect.objectContaining({
          tenantId: tenant.id,
          recordId: createRes.body.id,
          provider: 'manual',
        })
      );
      // fetch single
      const fetchRes = await request(app)
        .get(`/api/platform/kyc/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.id).toBe(createRes.body.id);
      eventSpy.mockRestore();
    });

    test('POST /:id/review with rejected status emits rejection event', async () => {
      const rejectRecord = await prisma.kycRecord.create({
        data: {
          tenantId: tenant.id,
          status: 'pending',
          provider: 'manual',
          refId: 'KYC-REJECT'
        }
      });

      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/platform/kyc/${rejectRecord.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'rejected',
          notes: 'Insufficient documentation'
        });

      expect(res.status).toBe(200);
      // reviewer fields should be populated on rejection as well
      expect(res.body.reviewedById).toBe(adminUser.id);
      expect(res.body.reviewedAt).toBeTruthy();
      expect(new Date(res.body.reviewedAt).getTime()).toBeGreaterThan(0);

      expect(eventSpy).toHaveBeenCalledWith(
        'platform.kyc.rejected',
        expect.objectContaining({
          tenantId: tenant.id,
          recordId: rejectRecord.id
        })
      );

      // Rejection should also update subscriber status
      const subAfterReject = await prisma.subscriber.findUnique({
        where: { tenantId: tenant.id },
        select: { kycStatus: true },
      });
      expect(subAfterReject?.kycStatus).toBe('rejected');

      eventSpy.mockRestore();
    });

    test('GET /tenant/:tenantId/status returns KYC verification status', async () => {
      const res = await request(app)
        .get(`/api/platform/kyc/tenant/${tenant.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenant.id);
      expect(res.body).toHaveProperty('kycVerified');
      expect(typeof res.body.kycVerified).toBe('boolean');
    });

    test('GET /stats/overview returns counts', async () => {
      const res = await request(app)
        .get('/api/platform/kyc/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('submitted');
    });

    test('GET /tenant/:tenantId returns latest record', async () => {
      const res = await request(app)
        .get(`/api/platform/kyc/tenant/${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenant.id);
    });

    test('GET /tenant/:tenantId for unknown tenant returns 404', async () => {
      const res = await request(app)
        .get('/api/platform/kyc/tenant/unknown')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    test('KYC gating blocks paid features before verification', async () => {
      // Create unverified tenant
      const unverifiedTenant = await prisma.tenant.create({
        data: { name: 'Unverified', status: 'active' }
      });

      await prisma.subscriber.create({
        data: {
          tenantId: unverifiedTenant.id,
          displayName: 'Unverified',
          ownerEmail: 'unverified@test.com',
          kycStatus: 'pending'
        }
      });

      // Mock a protected service call that requires KYC
      await expect(KycService.requireVerified(unverifiedTenant.id))
        .rejects.toThrow('KYC_REQUIRED');

      // Approve via the review endpoint (not by mutating DB directly)
      const unverifiedRecord = await prisma.kycRecord.create({
        data: {
          tenantId: unverifiedTenant.id,
          status: 'pending',
          provider: 'manual',
          refId: 'KYC-GATE'
        }
      });
      const approveRes = await request(app)
        .post(`/api/platform/kyc/${unverifiedRecord.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          notes: 'Approved for gating test'
        });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('verified');

      // Ensure subscriber status actually flipped via the endpoint path
      const gatedSub = await prisma.subscriber.findUnique({
        where: { tenantId: unverifiedTenant.id },
        select: { kycStatus: true },
      });
      expect(gatedSub?.kycStatus).toBe('verified');

      // Should now pass
      await expect(KycService.requireVerified(unverifiedTenant.id))
        .resolves.not.toThrow();

      await prisma.subscriber.delete({ where: { tenantId: unverifiedTenant.id } });
      await prisma.tenant.delete({ where: { id: unverifiedTenant.id } });
    });

    test('re-reject is idempotent', async () => {
      const rec = await prisma.kycRecord.create({
        data: {
          tenantId: tenant.id,
          status: 'rejected',
          reviewedById: adminUser.id,
          reviewedAt: new Date(),
          notes: 'Already rejected',
          provider: 'manual',
        },
      });
      const res = await request(app)
        .post(`/api/platform/kyc/${rec.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', notes: 'Re-rejecting' });
      expect(res.status).toBe(200);
    });
  });

  describe('Sad Paths', () => {
    test('review non-existent KYC record returns 404', async () => {
      const res = await request(app)
        .post('/api/platform/kyc/non-existent-id/review')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          notes: 'Test'
        });

      expect(res.status).toBe(404);
    });

    test('review without required notes returns 400', async () => {
      const res = await request(app)
        .post(`/api/platform/kyc/${kycRecord.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'rejected'
          // Missing notes for rejection
        });

      expect(res.status).toBe(400);
    });

    test('review with whitespace-only notes returns 400', async () => {
      const rec = await prisma.kycRecord.create({
        data: {
          tenantId: tenant.id,
          status: 'pending',
          provider: 'manual',
          refId: 'KYC-WHITESPACE'
        }
      });
      const res = await request(app)
        .post(`/api/platform/kyc/${rec.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', notes: '   ' });
      expect(res.status).toBe(400);
    });

    test('re-review is idempotent', async () => {
      const reviewRecord = await prisma.kycRecord.create({
        data: {
          tenantId: tenant.id,
          status: 'verified',
          reviewedById: adminUser.id,
          reviewedAt: new Date(),
          notes: 'Already reviewed'
        }
      });

      const res = await request(app)
        .post(`/api/platform/kyc/${reviewRecord.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          notes: 'Re-reviewing'
        });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Re-reviewing');
    });
  });
});