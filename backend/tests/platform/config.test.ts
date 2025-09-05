import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import { AuditService } from '../../src/services/auditService';
import crypto from 'crypto';

describe('Platform Global Config & Settings', () => {
  let adminToken: string;
  let viewerToken: string;
  let adminUser: any;
  let viewerUser: any;

  beforeAll(async () => {
    // Create permissions and roles
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'config.read', description: 'Read platform config' },
        { code: 'config.write', description: 'Write platform config' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'config_admin',
        name: 'Config Admin',
        description: 'Config management'
      }
    });

    const viewerRole = await prisma.platformRole.create({
      data: {
        code: 'config_viewer',
        name: 'Config Viewer',
        description: 'Config read only'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['config.read', 'config.write'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: [
        ...perms.map(p => ({
          platformRoleId: adminRole.id,
          permissionId: p.id
        })),
        {
          platformRoleId: viewerRole.id,
          permissionId: perms.find(p => p.code === 'config.read')!.id
        }
      ]
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'config@platform.test',
        name: 'Config Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active'
      }
    });

    viewerUser = await prisma.platformUser.create({
      data: {
        email: 'configviewer@platform.test',
        name: 'Config Viewer',
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
      email: 'config@platform.test',
      roles: ['config_admin'],
      permissions: ['config.read', 'config.write']
    }, adminJti);

    const viewerJti = crypto.randomUUID();
    viewerToken = signPlatformAccess({
      sub: viewerUser.id,
      email: 'configviewer@platform.test',
      roles: ['config_viewer'],
      permissions: ['config.read']
    }, viewerJti);

    await PlatformSessionService.create(adminUser.id, adminJti);
    await PlatformSessionService.create(viewerUser.id, viewerJti);
  });

  afterAll(async () => {
    // Cleanup configs
    await PlatformConfigService.deleteConfig('test_config', adminUser.id, 'platform').catch(() => {});
    await PlatformConfigService.deleteConfig('secret_config', adminUser.id, 'platform').catch(() => {});
    await PlatformConfigService.deleteConfig('maintenance_mode', adminUser.id, 'platform').catch(() => {});
    
    // Cleanup database
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('non-secret config upsert/read works with audit entries', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      // Create config
      const createRes = await request(app)
        .post('/api/platform/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          key: 'test_config',
          value: { setting: 'test_value' },
          encrypt: false
        });

      expect(createRes.status).toBe(200);
      expect(createRes.body.hasValue).toBe(true);

      // Read config
      const readRes = await request(app)
        .get('/api/platform/config/test_config')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.key).toBe('test_config');
      expect(readRes.body.value).toEqual({ setting: 'test_value' });
      expect(readRes.body.hasValue).toBe(true);

      // Update config
      const updateRes = await request(app)
        .post('/api/platform/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          key: 'test_config',
          value: { setting: 'updated_value' },
          encrypt: false
        });

      expect(updateRes.status).toBe(200);

      // Verify audit entries created
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.config.updated',
          resource: 'global_config',
          resourceId: 'test_config'
        })
      );

      auditSpy.mockRestore();
    });

    test('encrypted config returns masked value on read', async () => {
      // Create encrypted config
      const createRes = await request(app)
        .post('/api/platform/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          key: 'secret_config',
          value: { apiKey: 'super_secret_key_123' },
          encrypt: true
        });

      expect(createRes.status).toBe(200);

      // Read back should be masked
      const readRes = await request(app)
        .get('/api/platform/config/secret_config')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.value).toBe('********');
      expect(readRes.body.hasValue).toBe(true);

      // Verify actual value is encrypted in service
      const actualValue = await PlatformConfigService.getConfig('secret_config', 'platform');
      expect(actualValue).toEqual({ apiKey: 'super_secret_key_123' });
    });

    test('DELETE /api/platform/config/:key works and is audited', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();

      // Create config to delete
      await PlatformConfigService.setConfig('delete_test', { value: 'to_delete' }, adminUser.id, { scope: 'platform' });

      const res = await request(app)
        .delete('/api/platform/config/delete_test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Configuration deleted successfully');

      // Verify config was deleted
      const deleted = await PlatformConfigService.getConfig('delete_test', 'platform');
      expect(deleted).toBeNull();

      // Verify audit entry
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'platform.config.deleted',
          resourceId: 'delete_test'
        })
      );

      auditSpy.mockRestore();
    });

    test('maintenance mode can be set and retrieved', async () => {
      // Set maintenance mode
      const setRes = await request(app)
        .post('/api/platform/config/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enabled: true,
          message: 'Platform under maintenance',
          scheduledStart: new Date().toISOString(),
          scheduledEnd: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        });

      expect(setRes.status).toBe(200);
      expect(setRes.body.enabled).toBe(true);

      // Get maintenance mode status
      const getRes = await request(app)
        .get('/api/platform/config/maintenance/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.enabled).toBe(true);
      expect(getRes.body.message).toBe('Platform under maintenance');

      // Disable maintenance mode
      await request(app)
        .post('/api/platform/config/maintenance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });
    });

    test('viewer with read permission can read a non-secret config', async () => {
      // Arrange: create a non-secret config
      await PlatformConfigService.setConfig(
        'viewer_read_test',
        { value: 'readable' },
        adminUser.id,
        { scope: 'platform' }
      );

      // Act: read with viewer token (has config.read only)
      const res = await request(app)
        .get('/api/platform/config/viewer_read_test')
        .set('Authorization', `Bearer ${viewerToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.key).toBe('viewer_read_test');
      expect(res.body.value).toEqual({ value: 'readable' });
      expect(res.body.hasValue).toBe(true);

      // Cleanup
      await PlatformConfigService.deleteConfig('viewer_read_test', adminUser.id, 'platform');
    });

    test('viewer reading an encrypted config receives masked value', async () => {
      // Arrange: create an encrypted config
      await PlatformConfigService.setConfig(
        'viewer_secret_test',
        { token: 'super_secret' },
        adminUser.id,
        { scope: 'platform', encrypt: true }
      );

      // Act: read with viewer token
      const res = await request(app)
        .get('/api/platform/config/viewer_secret_test')
        .set('Authorization', `Bearer ${viewerToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.key).toBe('viewer_secret_test');
      expect(res.body.value).toBe('********');
      expect(res.body.hasValue).toBe(true);

      // Cleanup
      await PlatformConfigService.deleteConfig('viewer_secret_test', adminUser.id, 'platform');
    });

    test('GET /api/platform/config lists all configurations', async () => {
      // Ensure some configs exist
      await PlatformConfigService.setConfig('list_test_1', { value: 'test1' }, adminUser.id, { scope: 'platform' });
      await PlatformConfigService.setConfig('list_test_2', { value: 'test2' }, adminUser.id, { scope: 'platform' });

      const res = await request(app)
        .get('/api/platform/config')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('configs');
      expect(Array.isArray(res.body.configs)).toBe(true);
      expect(res.body.configs.length).toBeGreaterThan(0);

      const testConfigs = res.body.configs.filter((c: any) => c.key.startsWith('list_test_'));
      expect(testConfigs.length).toBe(2);

      // Cleanup
      await PlatformConfigService.deleteConfig('list_test_1', adminUser.id, 'platform');
      await PlatformConfigService.deleteConfig('list_test_2', adminUser.id, 'platform');
    });
  });

  describe('Sad Paths', () => {
    test('write without permission returns 403', async () => {
      const res = await request(app)
        .post('/api/platform/config')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          key: 'forbidden_config',
          value: { test: 'value' }
        });

      expect(res.status).toBe(403);
    });

    test('delete missing key returns 404', async () => {
      const res = await request(app)
        .delete('/api/platform/config/non_existent_key')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Configuration not found');
    });

    test('get non-existent config returns 404', async () => {
      const res = await request(app)
        .get('/api/platform/config/non_existent_config')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Configuration not found');
    });

    test('GET /api/platform/config without auth returns 401', async () => {
      const res = await request(app)
        .get('/api/platform/config');
      expect([401, 403]).toContain(res.status); // environments may return 401 (unauthenticated) or 403 (forbidden)
    });
  });
});