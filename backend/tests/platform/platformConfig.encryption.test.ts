import express from 'express';
import request from 'supertest';
import configRoutes from '../../src/routes/platform/config';
import { prisma } from '../../src/utils/prisma';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import { AuditService } from '../../src/services/auditService';

jest.mock('../../src/middleware/platformAuth', () => ({
  requirePlatformPermissions: () => (req: any, _res: any, next: any) => {
    req.platformUser = { id: 'user1', email: 'u@example.com', roles: [], permissions: [], mfaEnabled: true };
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/', configRoutes);

describe('Platform config encryption', () => {
  const key = 'secret_test_key';

  beforeAll(async () => {
    await prisma.globalConfig.deleteMany({ where: { key, scope: 'platform' } });
  });

  afterAll(async () => {
    await prisma.globalConfig.deleteMany({ where: { key, scope: 'platform' } });
  });

  it('stores encrypted value and masks retrieval', async () => {
    const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
    const res = await request(app).post('/').send({ key, value: 'super-secret', encrypt: true });
    expect(res.status).toBe(200);
    const record = await prisma.globalConfig.findUnique({ where: { scope_key: { scope: 'platform', key } } });
    expect(record?.secretData).not.toBeNull();
    expect(record?.data).toBeNull();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      changes: { key, encrypted: true }
    }));
    auditSpy.mockRestore();

    const getRes = await request(app).get(`/${key}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual({ key, value: '********', hasValue: true });
    const actual = await PlatformConfigService.getConfig<string>(key, 'platform');
    expect(actual).toBe('super-secret');
  });
});
