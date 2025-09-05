import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformUserService } from '../../src/services/platformUserService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../src/utils/platformEvents';
import { TenantService } from '../../src/services/tenantService';
import { SubscriptionService } from '../../src/services/subscriptionService';

jest.mock('../../src/services/tenantService', () => ({
  TenantService: {
    createTenant: jest.fn().mockResolvedValue({ id: 't_new' }),
    getOrCreateDefaultTenant: jest.fn().mockResolvedValue({ id: 'default_tenant' }),
    // Provide a fake tenant-scoped prisma so we don't hit platform DB FKs.
    withTenantContext: jest.fn().mockImplementation(async (_tenant, cb) => {
      const fakeTenantPrisma = {
        user: {
          create: jest.fn().mockResolvedValue({ id: 'u_new' }),
        },
      };
      return cb(fakeTenantPrisma as any);
    }),
  },
}));

jest.mock('../../src/services/subscriptionService', () => ({
  SubscriptionService: { createSubscription: jest.fn().mockResolvedValue({ id: 'sub' }) },
}));

describe('Platform Request Forms routes', () => {
  let adminUser: any;
  let viewerUser: any;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    // permissions
    const readPerm = await prisma.platformPermission.create({ data: { code: 'requests.read', description: 'read' } });
    const assignPerm = await prisma.platformPermission.create({ data: { code: 'requests.assign', description: 'assign' } });
    const convertPerm = await prisma.platformPermission.create({ data: { code: 'requests.convert', description: 'convert' } });
    const writePerm = await prisma.platformPermission.create({ data: { code: 'requests.write', description: 'write' } });

    // roles
    const adminRole = await prisma.platformRole.create({ data: { code: 'admin', name: 'Admin', description: 'Administrator role' } });
    const viewerRole = await prisma.platformRole.create({ data: { code: 'viewer', name: 'Viewer', description: 'Viewer role' } });

    await prisma.platformRolePermission.createMany({
      data: [
        { platformRoleId: adminRole.id, permissionId: readPerm.id },
        { platformRoleId: adminRole.id, permissionId: assignPerm.id },
        { platformRoleId: adminRole.id, permissionId: convertPerm.id },
        { platformRoleId: adminRole.id, permissionId: writePerm.id },
        { platformRoleId: viewerRole.id, permissionId: readPerm.id },
      ],
    });

    // users
    const passwordHash = await PlatformUserService.hashPassword('secret');
    adminUser = await prisma.platformUser.create({
      data: { email: 'admin@pf.test', name: 'Admin', passwordHash, status: 'active' },
    });
    viewerUser = await prisma.platformUser.create({
      data: { email: 'viewer@pf.test', name: 'Viewer', passwordHash, status: 'active' },
    });

    await prisma.platformUserRole.createMany({
      data: [
        { platformUserId: adminUser.id, platformRoleId: adminRole.id },
        { platformUserId: viewerUser.id, platformRoleId: viewerRole.id },
      ],
    });

    // tokens
    const adminJti = randomUUID();
    adminToken = signPlatformAccess(
      {
        sub: adminUser.id,
        email: adminUser.email,
        roles: ['admin'],
        permissions: ['requests.read', 'requests.assign', 'requests.convert', 'requests.write'],
      },
      adminJti
    );
    await PlatformSessionService.create(adminUser.id, adminJti);

    const viewerJti = randomUUID();
    viewerToken = signPlatformAccess(
      {
        sub: viewerUser.id,
        email: viewerUser.email,
        roles: ['viewer'],
        permissions: ['requests.read'],
      },
      viewerJti
    );
    await PlatformSessionService.create(viewerUser.id, viewerJti);
  });

  afterAll(async () => {
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
    await prisma.requestFormSubmission.deleteMany();
  });

  test('GET /api/platform/requests lists and filters', async () => {
    await prisma.requestFormSubmission.createMany({
      data: [
        { email: 'a@a.com', kind: 'trial', status: 'new' },
        { email: 'b@b.com', kind: 'enterprise', status: 'rejected' },
      ],
    });

    const res = await request(app)
      .get('/api/platform/requests?status=new')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].status).toBe('new');
  });

  test('GET /api/platform/requests/:id retrieves a single record', async () => {
    const reqRecord = await prisma.requestFormSubmission.create({ data: { email: 'c@c.com', kind: 'trial' } });

    const res = await request(app)
      .get(`/api/platform/requests/${reqRecord.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(reqRecord.id);
  });

  test('GET /api/platform/requests/:id returns 404 when not found', async () => {
    await request(app)
      .get(`/api/platform/requests/${randomUUID()}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  test('POST /:id/assign assigns request and emits audit/event', async () => {
    const reqRecord = await prisma.requestFormSubmission.create({ data: { email: 'd@d.com', kind: 'trial' } });
    const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
    const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToId: adminUser.id })
      .expect(200);

    expect(res.body.assignedToId).toBe(adminUser.id);
    expect(auditSpy).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(PLATFORM_EVENTS.REQUEST_ASSIGNED, expect.any(Object));

    // RBAC check
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/assign`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ assignedToId: adminUser.id })
      .expect(403);

    auditSpy.mockRestore();
    eventSpy.mockRestore();
  });

  test('POST /:id/convert converts request and emits audit/event', async () => {
    const reqRecord = await prisma.requestFormSubmission.create({ data: { email: 'e@e.com', kind: 'trial', company: 'E Co' } });
    const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
    const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyName: 'E Co', planId: 'plan1', ownerPassword: 'password1' })
      .expect(200);

    expect(res.body.request.status).toBe('converted');
    expect(res.body.request.convertedAt).toBeTruthy();
    expect(auditSpy).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(PLATFORM_EVENTS.REQUEST_CONVERTED, expect.any(Object));
    // Creates tenant + initial subscription
    expect(TenantService.createTenant).toHaveBeenCalledWith({ name: 'E Co', status: 'active' });
    // 't_new' comes from our mock TenantService.createTenant
    expect(SubscriptionService.createSubscription).toHaveBeenCalledWith('t_new', 'plan1', { currency: 'USD', trial: true });

    // RBAC check
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/convert`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ companyName: 'E Co', planId: 'plan1', ownerPassword: 'password1' })
      .expect(403);

    auditSpy.mockRestore();
    eventSpy.mockRestore();
  });

  test('POST /:id/reject rejects request and emits audit/event', async () => {
    const reqRecord = await prisma.requestFormSubmission.create({ data: { email: 'f@f.com', kind: 'trial' } });
    const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
    const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'duplicate' })
      .expect(200);

    expect(['rejected']).toContain(res.body.status);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'request.rejected' }));
    expect(res.body.status).toBe('rejected');
    expect(auditSpy).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(PLATFORM_EVENTS.REQUEST_REJECTED, expect.any(Object));

    // RBAC check
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/reject`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ reason: 'duplicate' })
      .expect(403);

    auditSpy.mockRestore();
    eventSpy.mockRestore();
  });

  test('Sad paths: assign non-existent user, convert/reject already converted, missing fields', async () => {
    const reqRecord = await prisma.requestFormSubmission.create({ data: { email: 'g@g.com', kind: 'trial' } });

    // assign to non-existent user
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToId: 'no-user' })
      .expect(404);

    // convert when already converted
    await prisma.requestFormSubmission.update({ where: { id: reqRecord.id }, data: { status: 'converted' } });
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyName: 'X', planId: 'p', ownerPassword: 'secret1' })
      .expect(409);

    // reject when already converted
    await request(app)
      .post(`/api/platform/requests/${reqRecord.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'nope' })
      .expect(409);

    // missing required fields for convert
    const newReq = await prisma.requestFormSubmission.create({ data: { email: 'h@h.com', kind: 'trial' } });
    await request(app)
      .post(`/api/platform/requests/${newReq.id}/convert`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });
});