import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformUserService } from '../../src/services/platformUserService';
import { AuditService } from '../../src/services/auditService';

describe('Platform security features', () => {
  let adminToken: string;
  let adminUser: any;
  let targetUser: any;
  let viewerToken: string;

  beforeAll(async () => {
    const permRead = await prisma.platformPermission.create({ data: { code: 'platform.users.read', description: 'read users' } });
    const permWrite = await prisma.platformPermission.create({ data: { code: 'platform.users.write', description: 'write users' } });
    const permPerms = await prisma.platformPermission.create({ data: { code: 'platform.permissions.read', description: 'read perms' } });

    const roleAdmin = await prisma.platformRole.create({ data: { code: 'admin', name: 'Admin', description: 'admin' } });
    const roleViewer = await prisma.platformRole.create({ data: { code: 'viewer', name: 'Viewer', description: 'viewer' } });

    await prisma.platformRolePermission.createMany({
      data: [
        { platformRoleId: roleAdmin.id, permissionId: permRead.id },
        { platformRoleId: roleAdmin.id, permissionId: permWrite.id },
        { platformRoleId: roleAdmin.id, permissionId: permPerms.id },
        { platformRoleId: roleViewer.id, permissionId: permRead.id },
      ],
    });

    const passwordHash = await PlatformUserService.hashPassword('pass');
    adminUser = await prisma.platformUser.create({ data: { email: 'admin@test', name: 'Admin', passwordHash } });
    targetUser = await prisma.platformUser.create({ data: { email: 'target@test', name: 'Target', passwordHash } });
    const viewer = await prisma.platformUser.create({ data: { email: 'viewer@test', name: 'Viewer', passwordHash } });

    await prisma.platformUserRole.createMany({ data: [
      { platformUserId: adminUser.id, platformRoleId: roleAdmin.id },
      { platformUserId: targetUser.id, platformRoleId: roleViewer.id },
      { platformUserId: viewer.id, platformRoleId: roleViewer.id },
    ]});

    const jti = randomUUID();
    adminToken = signPlatformAccess({ sub: adminUser.id, email: adminUser.email, roles: ['admin'], permissions: ['platform.users.read','platform.users.write','platform.permissions.read'] }, jti);
    await PlatformSessionService.create(adminUser.id, jti);

    const viewerJti = randomUUID();
    viewerToken = signPlatformAccess({ sub: viewer.id, email: viewer.email, roles: ['viewer'], permissions: ['platform.users.read'] }, viewerJti);
    await PlatformSessionService.create(viewer.id, viewerJti);

    const targetJti = randomUUID();
    const targetToken = signPlatformAccess({ sub: targetUser.id, email: targetUser.email, roles: ['viewer'], permissions: ['platform.users.read'] }, targetJti);
    await PlatformSessionService.create(targetUser.id, targetJti);
    // store token on user for test
    (targetUser as any).token = targetToken;
  });

  afterAll(async () => {
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformPermission.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  test('reset MFA and IP allowlist management', async () => {
    // add ip
    let res = await request(app)
      .post(`/api/platform/users/${targetUser.id}/ip-allowlist`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ip: '1.1.1.1' });
    expect(res.status).toBe(200);
    expect(res.body.ipAllowlist).toContain('1.1.1.1');

    // invalid IP
    res = await request(app)
      .post(`/api/platform/users/${targetUser.id}/ip-allowlist`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ip: 'bad-ip' });
    expect(res.status).toBe(400);

    // reset MFA
    res = await request(app)
      .post(`/api/platform/users/${targetUser.id}/reset-mfa`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const updated = await prisma.platformUser.findUnique({ where: { id: targetUser.id } });
    expect(updated?.mfaEnabled).toBe(false);
  });

  test('require MFA denies access until enabled', async () => {
    // Clear IP allowlist to ensure MFA check runs instead of IP blocking
    await PlatformUserService.updateUser(targetUser.id, { ipAllowlist: [] });

    const r = await request(app)
      .post(`/api/platform/users/${targetUser.id}/require-mfa`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);

    const denied = await request(app)
      .get('/api/platform/users')
      .set('Authorization', `Bearer ${(targetUser as any).token}`);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('mfa_required');
  });

  test('login history and permission matrix', async () => {
    await AuditService.log({ platformUserId: targetUser.id, action: 'platform.auth.login_success' });
    const res = await request(app)
      .get(`/api/platform/users/${targetUser.id}/login-history`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);

    const forbiddenHistory = await request(app)
      .get(`/api/platform/users/${targetUser.id}/login-history`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(forbiddenHistory.status).toBe(403);

    const matrix = await request(app)
      .get('/api/platform/permissions/matrix')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(matrix.status).toBe(200);
    expect(matrix.body.matrix[0].role).toBeDefined();

    const forbidden = await request(app)
      .get('/api/platform/permissions/matrix')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(forbidden.status).toBe(403);
  });
});
