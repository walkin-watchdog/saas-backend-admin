import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { AuditService } from '../../src/services/auditService';
import { PlatformUserService } from '../../src/services/platformUserService';
import { EmailService } from '../../src/services/emailService';
import { PlatformEventBus } from '../../src/utils/platformEvents';

describe('Platform Users Management', () => {
  let adminUser: any;
  let viewerUser: any;
  let adminToken: string;
  let viewerToken: string;
  let adminRole: any;
  let viewerRole: any;

  beforeAll(async () => {
    // Create roles and permissions
    const readPerm = await prisma.platformPermission.create({
      data: { code: 'platform.users.read', description: 'Read platform users' }
    });

    const writePerm = await prisma.platformPermission.create({
      data: { code: 'platform.users.write', description: 'Write platform users' }
    });

    const invitePerm = await prisma.platformPermission.create({
      data: { code: 'platform.users.invite', description: 'Invite platform users' }
    });

    const deletePerm = await prisma.platformPermission.create({
      data: { code: 'platform.users.delete', description: 'Delete platform users' }
    });

    adminRole = await prisma.platformRole.create({
      data: {
        code: 'platform_admin',
        name: 'Platform Admin',
        description: 'Full platform access'
      }
    });

    viewerRole = await prisma.platformRole.create({
      data: {
        code: 'platform_viewer',
        name: 'Platform Viewer',
        description: 'Read-only access'
      }
    });

    await prisma.platformRolePermission.createMany({
      data: [
        { platformRoleId: adminRole.id, permissionId: readPerm.id },
        { platformRoleId: adminRole.id, permissionId: writePerm.id },
        { platformRoleId: adminRole.id, permissionId: invitePerm.id },
        { platformRoleId: adminRole.id, permissionId: deletePerm.id },
        { platformRoleId: viewerRole.id, permissionId: readPerm.id }
      ]
    });

    // Create test users
    const passwordHash = await PlatformUserService.hashPassword('password123');

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'admin@platform.test',
        name: 'Admin User',
        passwordHash,
        status: 'active'
      }
    });

    viewerUser = await prisma.platformUser.create({
      data: {
        email: 'viewer@platform.test',
        name: 'Viewer User',
        passwordHash,
        status: 'active'
      }
    });

    // Assign roles
    await prisma.platformUserRole.createMany({
      data: [
        { platformUserId: adminUser.id, platformRoleId: adminRole.id },
        { platformUserId: viewerUser.id, platformRoleId: viewerRole.id }
      ]
    });

    // Create tokens
    const jti = randomUUID();
    adminToken = signPlatformAccess({
      sub: adminUser.id,
      email: 'admin@platform.test',
      roles: ['platform_admin'],
      permissions: ['platform.users.read', 'platform.users.write', 'platform.users.invite', 'platform.users.delete']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    const viewerJti = randomUUID();
    viewerToken = signPlatformAccess({
      sub: viewerUser.id,
      email: 'viewer@platform.test', 
      roles: ['platform_viewer'],
      permissions: ['platform.users.read']
    }, viewerJti);
    await PlatformSessionService.create(viewerUser.id, viewerJti);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformInvite.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('GET /api/platform/users respects limit and offset', async () => {
      // First page
      const page1 = await request(app)
        .get('/api/platform/users?status=active&limit=1&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(page1.status).toBe(200);
      expect(page1.body.users).toHaveLength(1);
      const firstId = page1.body.users[0].id;

      // Second page (offset=1) should be a different record
      const page2 = await request(app)
        .get('/api/platform/users?status=active&limit=1&offset=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(page2.status).toBe(200);
      expect(page2.body.users).toHaveLength(1);
      expect(page2.body.users[0].id).not.toBe(firstId);
    });
    test('GET /api/platform/users lists users with pagination and filters', async () => {
      const res = await request(app)
        .get('/api/platform/users?status=active&limit=10&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThan(0);
      // Assert pagination echoes inputs
      expect(res.body.pagination).toEqual({ limit: 10, offset: 0 });
      // Assert status filter applied
      for (const u of res.body.users) {
        expect(u.status).toBe('active');
      }
    });

    test('GET /api/platform/users omits sensitive fields', async () => {
      const res = await request(app)
        .get('/api/platform/users?limit=5&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const user = res.body.users[0];
      expect(user.passwordHash).toBeUndefined();
      expect(user.twoFaSecret).toBeUndefined();
      expect(user.twoFaRecoveryCodes).toBeUndefined();
      expect(Array.isArray(user.permissions)).toBe(true);
    });

    test('GET /api/platform/users supports search', async () => {
      const res = await request(app)
        .get('/api/platform/users?search=Admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.users[0].email).toBe('admin@platform.test');
    });

    test('GET /api/platform/users search with no match returns empty list', async () => {
      const res = await request(app)
        .get('/api/platform/users?search=nope')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.users.length).toBe(0);
    });

    test('GET /api/platform/users filters by status=disabled', async () => {
      const disabled = await prisma.platformUser.create({ data: { email: 'disabled1@platform.test', name: 'Disabled One', status: 'disabled' } });
      const res = await request(app).get('/api/platform/users?status=disabled&limit=50&offset=0').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      res.body.users.forEach((u: any) => expect(u.status).toBe('disabled'));
      expect(res.body.users.map((u: any) => u.id)).toContain(disabled.id);
    });

    test('GET /api/platform/users filters by role', async () => {
      const res = await request(app)
        .get('/api/platform/users?role=platform_viewer&limit=50&offset=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      // every user returned should have the requested role
      for (const u of res.body.users) {
        // roles come back with included role objects
        const codes = (u.roles || []).map((r: any) => r.role?.code).filter(Boolean);
        expect(codes).toContain('platform_viewer');
      }
    });

    test('GET /api/platform/users/:id returns sanitized user', async () => {
      const res = await request(app)
        .get(`/api/platform/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.twoFaSecret).toBeUndefined();
      expect(res.body.twoFaRecoveryCodes).toBeUndefined();
      expect(Array.isArray(res.body.permissions)).toBe(true);
    });

    test('POST /api/platform/users creates user with optional IP allowlist', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      const userData = {
        email: 'newuser@platform.test',
        name: 'New User',
        roleCodes: ['platform_viewer'],
        ipAllowlist: ['192.168.1.1', '10.0.0.0/8']
      };

      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData);

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(userData.email);
      expect(res.body.name).toBe(userData.name);

      // Verify user was created in DB
      const createdUser = await prisma.platformUser.findUnique({
        where: { email: userData.email }
      });

      expect(createdUser).toBeTruthy();
      expect(createdUser?.ipAllowlist).toEqual(userData.ipAllowlist);

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId: adminUser.id,
          action: 'platform.user.created'
        })
      );

      auditSpy.mockRestore();
    });

    test('POST /api/platform/users trims whitespace in ipAllowlist', async () => {
      const userData = {
        email: 'spaces@platform.test',
        name: 'Spaces',
        roleCodes: ['platform_viewer'],
        ipAllowlist: [' 127.0.0.1 ', '10.0.0.0/8  ']
      };
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData);
      expect(res.status).toBe(201);
      const created = await prisma.platformUser.findUnique({ where: { email: userData.email } });
      expect(created?.ipAllowlist).toEqual(['127.0.0.1', '10.0.0.0/8']);
    });

    test('POST /api/platform/users assigns roleCodes on create', async () => {
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'roleoncreate@platform.test', name: 'Role On Create', roleCodes: ['platform_viewer'] });
      expect(res.status).toBe(201);
      const user = await prisma.platformUser.findUnique({ where: { email: 'roleoncreate@platform.test' } });
      const roles = await prisma.platformUserRole.findMany({ where: { platformUserId: user!.id }, include: { role: true } });
      expect(roles.map(r => r.role.code)).toEqual(['platform_viewer']);
    });

    test('PUT /api/platform/users/:id updates user properties', async () => {
      const user = await prisma.platformUser.create({
        data: {
          email: 'updateme@platform.test',
          name: 'Update Me',
          status: 'active'
        }
      });

      const updateData = {
        name: 'Updated Name',
        status: 'disabled' as const,
        ipAllowlist: ['127.0.0.1']
      };

      const res = await request(app)
        .put(`/api/platform/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(updateData.name);
      expect(res.body.status).toBe(updateData.status);

      // Verify in database
      const updatedUser = await prisma.platformUser.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser?.name).toBe(updateData.name);
      expect(updatedUser?.status).toBe(updateData.status);
      expect(updatedUser?.ipAllowlist).toEqual(updateData.ipAllowlist);
    });

    test('POST /api/platform/users/invite creates invite and sends email', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const inviteData = {
        email: 'invite@platform.test',
        roleCodes: ['platform_viewer'],
        expiresInHours: 72
      };

      const res = await request(app)
        .post('/api/platform/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData);

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(inviteData.email);
      expect(res.body.roleCodes).toEqual(inviteData.roleCodes);
      expect(res.body.inviteUrl).toContain('/platform/accept-invite/');

      // Verify invite was created
      const invite = await prisma.platformInvite.findFirst({
        where: { email: inviteData.email }
      });

      expect(invite).toBeTruthy();
      expect(invite?.roleCodes).toEqual(inviteData.roleCodes);

      // Verify audit and event
      expect(auditSpy).toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalled();

      // Verify email send was attempted
      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: inviteData.email,
          subject: 'Platform Admin Invitation',
          template: 'platform-invite'
        })
      );

      auditSpy.mockRestore();
      emailSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('POST /api/platform/auth/accept-invite creates user from valid invite', async () => {
      // Create an invite
      const invite = await prisma.platformInvite.create({
        data: {
          email: 'acceptme@platform.test',
          invitedById: adminUser.id,
          roleCodes: ['platform_viewer'],
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
        }
      });

      const res = await request(app)
        .post('/api/platform/auth/accept-invite')
        .send({
          token: invite.token,
          name: 'Accepted User',
          password: 'newpassword123'
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('acceptme@platform.test');

      // Verify user was created
      const user = await prisma.platformUser.findUnique({
        where: { email: 'acceptme@platform.test' }
      });

      // Verify roles were assigned
      const userRoles = await prisma.platformUserRole.findMany({
        where: { platformUserId: user!.id },
        include: { role: true }
      });
      expect(userRoles.map(ur => ur.role.code)).toEqual(['platform_viewer']);

      expect(user).toBeTruthy();
      expect(user?.name).toBe('Accepted User');

      // Verify invite was marked as accepted
      const acceptedInvite = await prisma.platformInvite.findUnique({
        where: { id: invite.id }
      });

      expect(acceptedInvite?.acceptedAt).toBeTruthy();
    });

    test('POST /api/platform/users/:id/roles assigns roles successfully', async () => {
      const user = await prisma.platformUser.create({
        data: {
          email: 'roletest@platform.test',
          name: 'Role Test',
          status: 'active'
        }
      });

      const res = await request(app)
        .post(`/api/platform/users/${user.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roleCodes: ['platform_viewer']
        });

      expect(res.status).toBe(200);

      // Verify roles were assigned
      const userRoles = await prisma.platformUserRole.findMany({
        where: { platformUserId: user.id },
        include: { role: true }
      });

      expect(userRoles).toHaveLength(1);
      expect(userRoles[0].role.code).toBe('platform_viewer');
    });
  });

  describe('Sad Paths', () => {
    test('create user with invalid IP in ipAllowlist returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'badip@platform.test', name: 'Bad IP', ipAllowlist: ['not-an-ip'] });
      expect(res.status).toBe(400);
    });
    test('GET /api/platform/users requires auth', async () => {
      const res = await request(app).get('/api/platform/users');
      expect([401, 403]).toContain(res.status);
    });
    test('viewer can list users (has read permission)', async () => {
      const res = await request(app)
        .get('/api/platform/users?limit=5&offset=0')
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
    });
    test('reused invite returns 409', async () => {
      const invite = await prisma.platformInvite.create({
        data: {
          email: 'reuse@platform.test',
          invitedById: adminUser.id,
          roleCodes: ['platform_viewer'],
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
        }
      });

      // First accept succeeds
      const first = await request(app)
        .post('/api/platform/auth/accept-invite')
        .send({ token: invite.token, name: 'One', password: 'pw123456' });
      expect(first.status).toBe(201);

      // Second accept should fail with 409
      const second = await request(app)
        .post('/api/platform/auth/accept-invite')
        .send({ token: invite.token, name: 'Two', password: 'pw123456' });
      expect(second.status).toBe(409);
      expect((second.body.error || '').toLowerCase()).toMatch(/used/);
    });

    test('failed acceptance due to existing user leaves invite unused', async () => {
      // Create an invite for an email that already exists (adminUser.email)
      const invite = await prisma.platformInvite.create({
        data: {
          email: adminUser.email,
          invitedById: adminUser.id,
          roleCodes: ['platform_viewer'],
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post('/api/platform/auth/accept-invite')
        .send({ token: invite.token, name: 'Dup', password: 'pw123456' });

      expect(res.status).toBe(409);

      // Invite should remain unused
      const refreshed = await prisma.platformInvite.findUnique({ where: { id: invite.id } });
      expect(refreshed?.acceptedAt).toBeNull();
    });
    test('create user with duplicate email returns 409', async () => {
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'admin@platform.test', // existing email
          name: 'Duplicate User'
        });

      expect(res.status).toBe(409);
    });

    test('update with invalid IP format returns 400', async () => {
      const res = await request(app)
        .put(`/api/platform/users/${viewerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ipAllowlist: ['invalid-ip-format']
        });

      expect(res.status).toBe(400);
    });

    test('invite with empty roles returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'noroles@platform.test',
          roleCodes: []
        });

      expect(res.status).toBe(400);
    });

    test('accept expired invite returns 410', async () => {
      const expiredInvite = await prisma.platformInvite.create({
        data: {
          email: 'expired@platform.test',
          invitedById: adminUser.id,
          roleCodes: ['platform_viewer'],
          token: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() - 60 * 60 * 1000) // expired 1 hour ago
        }
      });

      const res = await request(app)
        .post('/api/platform/auth/accept-invite')
        .send({
          token: expiredInvite.token,
          name: 'Too Late',
          password: 'password123'
        });

      expect(res.status).toBe(410);
      expect((res.body.error || '').toLowerCase()).toMatch(/expired/);
    });

    test('accept invite with malformed token returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/auth/accept-invite')
        .set('X-Real-IP', '203.0.113.210')
        .send({ token: 'bad-token', name: 'Bad', password: 'password123' });
      expect(res.status).toBe(400);
    });

    test('accept invite with unknown token returns 401', async () => {
      const res = await request(app)
        .post('/api/platform/auth/accept-invite')
        .set('X-Real-IP', '203.0.113.211')
        .send({ token: 'a'.repeat(64), name: 'Ghost', password: 'password123' });
      expect(res.status).toBe(401);
    });

    test('assign unknown role code returns 422', async () => {
      const res = await request(app)
        .post(`/api/platform/users/${viewerUser.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roleCodes: ['nonexistent_role']
        });

      expect(res.status).toBe(422);
    });

    test('viewer cannot create users (insufficient permissions)', async () => {
      const res = await request(app)
        .post('/api/platform/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          email: 'forbidden@platform.test',
          name: 'Forbidden User'
        });

      expect(res.status).toBe(403);
    });

    test('self-disable is prevented', async () => {
      const res = await request(app)
        .put(`/api/platform/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'disabled'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot disable your own account');
    });

    test('self-deletion is prevented', async () => {
      const res = await request(app)
        .delete(`/api/platform/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot delete your own account');
    });
  });

  describe('Role Management', () => {
    test('role assignment emits platform event', async () => {
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const user = await prisma.platformUser.create({
        data: {
          email: 'rolechange@platform.test',
          name: 'Role Change',
          status: 'active'
        }
      });

      await PlatformUserService.assignRoles(user.id, ['platform_admin']);

      expect(eventSpy).toHaveBeenCalledWith(
        'platform.user.role_changed',
        expect.objectContaining({
          userId: user.id,
          roleCodes: ['platform_admin']
        })
      );

      eventSpy.mockRestore();
    });
  });

  describe('Rate Limiting', () => {
    test('user creation endpoint is rate limited', async () => {
      const ip = '198.51.100.50';
      const results = [] as any[];
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/platform/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Real-IP', ip)
          .send({ email: `limituser${i}@platform.test`, name: `Limit ${i}` });
        results.push(res);
      }
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      rateLimited.forEach(r => {
        expect(r.headers['retry-after']).toBeDefined();
      });
    });

    test('invite creation endpoint is rate limited', async () => {
      const ip = '198.51.100.51';
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      const results = [] as any[];
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/platform/users/invite')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Real-IP', ip)
          .send({ email: `limitinvite${i}@platform.test`, roleCodes: ['platform_viewer'] });
        results.push(res);
      }
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      rateLimited.forEach(r => {
        expect(r.headers['retry-after']).toBeDefined();
      });
      emailSpy.mockRestore();
    });

    test('invite accept endpoint is rate limited', async () => {
      // Create multiple invites
      const invites = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          prisma.platformInvite.create({
            data: {
              email: `test${i}@platform.test`,
              invitedById: adminUser.id,
              roleCodes: ['platform_viewer'],
              token: randomBytes(32).toString('hex'),
              expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
            }
          })
        )
      );

      // Attempt to accept multiple invites rapidly
      const promises = invites.map(invite =>
        request(app)
          .post('/api/platform/auth/accept-invite')
          .set('X-Real-IP', '203.0.113.200')
          .send({
            token: invite.token,
            name: 'Rate Limited',
            password: 'password123'
          })
      );

      const results = await Promise.all(promises);
      
      // Some should succeed, the last ones should be rate limited
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Rate limited responses should have Retry-After header
      rateLimited.forEach(res => {
        expect(res.headers['retry-after']).toBeDefined();
      });
    });
  });

  describe('Audit Log Redaction', () => {
    test('audit log redacts email and roleCodes', async () => {
      await AuditService.log({
        platformUserId: adminUser.id,
        action: 'audit.redaction.test',
        resource: 'platform_user',
        changes: { email: 'secret@platform.test', roleCodes: ['platform_admin'] }
      });
      const log = await prisma.auditLog.findFirst({ where: { action: 'audit.redaction.test' } });
      expect((log?.changes as any).email).toBe('[REDACTED]');
      expect((log?.changes as any).roleCodes).toBe('[REDACTED]');
      await prisma.auditLog.delete({ where: { id: log!.id } });
    });
  });
});