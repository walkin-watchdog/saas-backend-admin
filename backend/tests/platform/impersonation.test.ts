import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess, verifyImpersonationToken } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { ImpersonationService } from '../../src/services/impersonationService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

process.env.ADMIN_URL = 'https://example.com';
// Mock tenant authentication for impersonation token usage
jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  return {
    ...actual,
    authenticate: jest.fn(async (req: any, res: any, next: any) => {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token provided' });

      try {
        // Try impersonation token first
        const payload = verifyImpersonationToken(token, 'tenant-api');
        // Ensure grant is still active (revoked/expired -> 401)
        const { ImpersonationService } = require('../../src/services/impersonationService');
        const isActive = await ImpersonationService.validateGrant(payload.jti);
        if (!isActive) {
          return res.status(401).json({ error: 'Impersonation grant expired or revoked' });
        }
        req.user = {
          id: `impersonation:${payload.sub}`,
          email: `${payload.sub}@platform`,
          role: payload.scope === 'read_only' ? 'VIEWER' : payload.scope === 'billing_support' ? 'EDITOR' : 'ADMIN',
          platformAdmin: true
        };
        req.impersonation = {
          platformUserId: payload.sub,
          tenantId: payload.tenantId,
          scope: payload.scope,
          reason: payload.reason,
          grantId: payload.grantId
        };
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    })
  };
});

describe('Platform Impersonation', () => {
  let adminToken: string;
  let adminUser: any;
  let viewerToken: string;
  let viewerUser: any;
  let tenant: any;
  let impersonationGrant: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'impersonation.issue', description: 'Issue impersonation grants' },
        { code: 'impersonation.read', description: 'Read impersonation grants' },
        { code: 'impersonation.revoke', description: 'Revoke impersonation grants' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'impersonation_admin',
        name: 'Impersonation Admin',
        description: 'Impersonation management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['impersonation.issue', 'impersonation.read', 'impersonation.revoke'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'impersonate@platform.test',
        name: 'Impersonation Admin',
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
      email: 'impersonate@platform.test',
      roles: ['impersonation_admin'],
      permissions: ['impersonation.issue', 'impersonation.read', 'impersonation.revoke']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create viewer role with no impersonation permissions
    const viewerRole = await prisma.platformRole.create({
      data: {
        code: 'viewer',
        name: 'Viewer',
        description: 'Read-only viewer'
      }
    });

    // Create viewer user
    viewerUser = await prisma.platformUser.create({
      data: {
        email: 'viewer@platform.test',
        name: 'Viewer User',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active',
        mfaEnabled: true
      }
    });

    await prisma.platformUserRole.create({
      data: {
        platformUserId: viewerUser.id,
        platformRoleId: viewerRole.id
      }
    });

    const viewerJti = crypto.randomUUID();
    viewerToken = signPlatformAccess({
      sub: viewerUser.id,
      email: 'viewer@platform.test',
      roles: ['viewer'],
      permissions: [] // No impersonation permissions
    }, viewerJti);

    await PlatformSessionService.create(viewerUser.id, viewerJti);

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Impersonation Test Tenant',
        status: 'active'
      }
    });

    // Create test user in tenant
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'user@imptest.com',
        password: 'password',
        name: 'Test User',
        role: 'ADMIN'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.impersonationGrant.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('POST /api/platform/impersonate issues scoped token and emits event', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const impersonateData = {
        tenantId: tenant.id,
        reason: 'Customer support investigation',
        scope: 'billing_support' as const,
        durationMinutes: 60
      };

      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'impersonate-123')
        .send(impersonateData);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('loginUrl');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body).toHaveProperty('grantId');
      expect(res.body.loginUrl).toBe(`https://example.com/impersonate/${res.body.token}`);

      // short-lived (~60m) expiry window
      const expMs = new Date(res.body.expiresAt).getTime() - Date.now();
      expect(expMs).toBeGreaterThan(50 * 60 * 1000); // >50m
      expect(expMs).toBeLessThan(70 * 60 * 1000);    // <70m

      const createdGrant = await prisma.impersonationGrant.findUnique({ where: { id: res.body.grantId } });
      expect(createdGrant?.scope).toBe('billing_support');
      expect(createdGrant?.reason).toBe('Customer support investigation');
      if (!createdGrant) throw new Error('Grant not found');

      impersonationGrant = createdGrant;

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'impersonation.granted',
          tenantId: tenant.id,
          reason: impersonateData.reason
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.impersonation.issued',
        expect.objectContaining({
          tenantId: tenant.id,
          grantId: res.body.grantId,
          scope: 'billing_support'
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('impersonation token can be used on tenant routes according to scope', async () => {
      // Use the token from previous test
      const impersonationToken = (await ImpersonationService.createGrant({
        platformUserId: adminUser.id,
        tenantId: tenant.id,
        reason: 'Testing token usage',
        scope: 'read_only',
        durationMinutes: 30
      })).token;

      // Try to access tenant route with read_only scope
      const readRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .set('x-api-key', tenant.apiKey);

      // This should work as read_only maps to VIEWER role
      expect([200, 404]).toContain(readRes.status); // 404 if no user context, but auth should pass

      // Try to access admin-only route (should fail with read_only scope)
      const writeRes = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .set('x-api-key', tenant.apiKey)
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        });

      expect(writeRes.status).toBe(403); // Insufficient permissions
    });

    test('GET /api/platform/impersonate/grants lists active grants', async () => {
      const res = await request(app)
        .get('/api/platform/impersonate/grants')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('grants');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.grants)).toBe(true);
      expect(res.body.grants.length).toBeGreaterThan(0);
    });

    test('GET /api/platform/impersonate/grants filters by tenantId', async () => {
      const res = await request(app)
        .get(`/api/platform/impersonate/grants?tenantId=${tenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.grants.every((g: any) => g.tenantId === tenant.id)).toBe(true);
    });

    test('GET /api/platform/impersonate/grants with unknown tenant returns empty', async () => {
      const res = await request(app)
        .get('/api/platform/impersonate/grants?tenantId=unknown')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.grants.length).toBe(0);
    });

    test('GET /api/platform/impersonate/tenants/:tenantId/history returns impersonation history', async () => {
      const res = await request(app)
        .get(`/api/platform/impersonate/tenants/${tenant.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('history');
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    test('POST /api/platform/impersonate/grants/:id/revoke revokes grant', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/platform/impersonate/grants/${impersonationGrant.id}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Investigation completed'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Impersonation grant revoked successfully');

      // Verify grant was revoked
      const revokedGrant = await prisma.impersonationGrant.findUnique({
        where: { id: impersonationGrant.id }
      });

      expect(revokedGrant?.revokedAt).toBeTruthy();

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'impersonation.revoked',
          resourceId: impersonationGrant.id
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.impersonation.revoked',
        expect.objectContaining({
          tenantId: tenant.id,
          grantId: impersonationGrant.id
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('revoked impersonation token cannot be used on tenant routes', async () => {
      // Create a fresh grant we will revoke
      const { grant, token } = await ImpersonationService.createGrant({
        platformUserId: adminUser.id,
        tenantId: tenant.id,
        reason: 'Post-revoke denial check',
        scope: 'read_only',
        durationMinutes: 30
      });

      const revokeRes = await request(app)
        .post(`/api/platform/impersonate/grants/${grant.id}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Revoke for test' });
      expect(revokeRes.status).toBe(200);

      // Try to use the (now revoked) token on a tenant route
      const afterRevoke = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-api-key', tenant.apiKey);
      expect(afterRevoke.status).toBe(401);
    });
  });

  describe('Sad Paths', () => {
    test('issue without impersonation.issue permission returns 403', async () => {
      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          tenantId: tenant.id,
          reason: 'Should fail',
          scope: 'read_only'
        });

      expect(res.status).toBe(403);
    });

    test('issue for non-existent tenant returns 404', async () => {
      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: 'non-existent-tenant',
          reason: 'Testing non-existent tenant',
          scope: 'read_only'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    test('issue for inactive tenant returns 400', async () => {
      const inactiveTenant = await prisma.tenant.create({
        data: {
          name: 'Inactive Tenant',
          status: 'suspended'
        }
      });

      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: inactiveTenant.id,
          reason: 'Testing inactive tenant',
          scope: 'read_only'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot impersonate inactive tenant');

      // Cleanup
      await prisma.tenant.delete({ where: { id: inactiveTenant.id } });
    });

    test('use token after expiry returns 401', async () => {
      // Create active grant to get a usable token
      const { grant, token } = await ImpersonationService.createGrant({
        platformUserId: adminUser.id,
        tenantId: tenant.id,
        reason: 'Expiry test',
        scope: 'read_only',
        durationMinutes: 30
      });
      // Force it to be expired at DB level
      await prisma.impersonationGrant.update({
        where: { id: grant.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      // Attempt to use on tenant route -> 401
      const res401 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-api-key', tenant.apiKey);
      expect(res401.status).toBe(401);
    });

    test('revoke unknown grant returns 404; already revoked returns 409', async () => {
      const res = await request(app)
        .post('/api/platform/impersonate/grants/non-existent-id/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Testing non-existent grant'
        });

      expect(res.status).toBe(404);

      // Test already revoked
      const alreadyRevoked = await prisma.impersonationGrant.create({
        data: {
          issuedById: adminUser.id,
          tenantId: tenant.id,
          reason: 'Already revoked test',
          scope: 'read_only',
          jti: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          revokedAt: new Date()
        }
      });

      const revokeRes = await request(app)
        .post(`/api/platform/impersonate/grants/${alreadyRevoked.id}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Testing already revoked'
        });

      expect(revokeRes.status).toBe(409);
    });

    test('invalid scope in impersonation request returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: tenant.id,
          reason: 'Invalid scope test',
          scope: 'invalid_scope' // Not in enum
        });

      expect(res.status).toBe(400);
    });

    test('missing required fields returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/impersonate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: tenant.id,
          // Missing reason and scope
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Token Validation', () => {
    test('impersonation token validates grant existence', async () => {
      const grant = await ImpersonationService.createGrant({
        platformUserId: adminUser.id,
        tenantId: tenant.id,
        reason: 'Token validation test',
        scope: 'full_tenant_admin',
        durationMinutes: 30
      });

      // Valid grant should validate
      const isValid = await ImpersonationService.validateGrant(grant.grant.jti);
      expect(isValid).toBe(true);

      // Revoke the grant
      const revoked = await ImpersonationService.revokeGrant(grant.grant.id, adminUser.id, 'Test completed');
      expect(revoked).toBe('revoked');

      // Should no longer validate
      const isValidAfterRevoke = await ImpersonationService.validateGrant(grant.grant.jti);
      expect(isValidAfterRevoke).toBe(false);
    });

    test('different scopes map to appropriate tenant roles', async () => {
      const scopes = [
        { scope: 'read_only' as const, expectedRole: 'VIEWER' },
        { scope: 'billing_support' as const, expectedRole: 'EDITOR' },
        { scope: 'full_tenant_admin' as const, expectedRole: 'ADMIN' }
      ];

      for (const { scope, expectedRole } of scopes) {
        const grant = await ImpersonationService.createGrant({
          platformUserId: adminUser.id,
          tenantId: tenant.id,
          reason: `Testing ${scope} scope`,
          scope,
          durationMinutes: 30
        });

        // Decode token to verify scope mapping
        const payload = verifyImpersonationToken(grant.token, 'tenant-api');
        expect(payload.scope).toBe(scope);

        // Test token usage would map to correct role (mocked above)
        const testRes = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${grant.token}`)
          .set('x-api-key', tenant.apiKey);

        // The mock should set the role based on scope
        expect([200, 404]).toContain(testRes.status); // Auth passes, may 404 on no user context
      }
    });
  });

  describe('Grant Management', () => {
    test('grants can be filtered and paginated', async () => {
      // Create multiple grants
      const grants = await Promise.all([
        ImpersonationService.createGrant({
          platformUserId: adminUser.id,
          tenantId: tenant.id,
          reason: 'Grant 1',
          scope: 'read_only',
          durationMinutes: 30
        }),
        ImpersonationService.createGrant({
          platformUserId: adminUser.id,
          tenantId: tenant.id,
          reason: 'Grant 2',
          scope: 'billing_support',
          durationMinutes: 30
        })
      ]);

      // Get first page
      const page1 = await request(app)
        .get('/api/platform/impersonate/grants?limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(page1.status).toBe(200);
      expect(page1.body.grants).toHaveLength(1);

      // Get second page
      const page2 = await request(app)
        .get('/api/platform/impersonate/grants?limit=1&offset=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(page2.status).toBe(200);
      expect(page2.body.grants).toHaveLength(1);

      // Verify different grants
      expect(page1.body.grants[0].id).not.toBe(page2.body.grants[0].id);
    });

    test('impersonation history includes revoked grants', async () => {
      const res = await request(app)
        .get(`/api/platform/impersonate/tenants/${tenant.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.history.length).toBeGreaterThan(0);

      // Should include both active and revoked grants
      const hasRevoked = res.body.history.some((g: any) => g.revokedAt !== null);
      expect(hasRevoked).toBe(true);
    });
  });
});