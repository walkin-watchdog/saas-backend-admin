import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.mock('../../src/middleware/platformAuth', () => ({
  requireMfaEnabled: (_req:any,_res:any,next:any)=> next(),
  requirePlatformPermissions: () => (_req:any,_res:any,next:any)=> next(),
}));

const getTenantById = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../src/services/tenantService', () => ({
  TenantService: { getTenantById: (...a:any[]) => getTenantById(...a) }
}));

const evictDedicatedClient = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../src/utils/prisma', () => ({
  evictDedicatedClient: (...a:any[]) => evictDedicatedClient(...a),
}));

describe('POST /api/platform/tenants/:id/evict-client', () => {
  test('evicts when dedicated', async () => {
    getTenantById.mockResolvedValue({ id:'t1', dedicated:true, datasourceUrl:'postgres://d' });

    const tenantsRoutes = (await import('../../src/routes/platform/tenants')).default;
    const app = express();
    app.use('/api/platform/tenants', tenantsRoutes);

    const r = await request(app).post('/api/platform/tenants/t1/evict-client');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(evictDedicatedClient).toHaveBeenCalledWith('postgres://d', 'admin_endpoint');
  });

  test('404 when tenant missing', async () => {
    getTenantById.mockResolvedValue(null);
    const tenantsRoutes = (await import('../../src/routes/platform/tenants')).default;
    const app = express();
    app.use('/api/platform/tenants', tenantsRoutes);

    const r = await request(app).post('/api/platform/tenants/missing/evict-client');
    expect(r.status).toBe(404);
  });
});