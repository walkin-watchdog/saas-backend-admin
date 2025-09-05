import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.mock('../../src/middleware/platformAuth', () => ({
  requirePlatformPermissions: () => (_req:any,_res:any,next:any)=> next(),
}));

jest.mock('../../src/utils/prisma', () => ({
  getDedicatedCacheStats: () => ({ size: 1, keys: ['u1'], metrics: { cacheHit: 10, cacheMiss: 2, preflightP95: 123, preflightMs: [] } }),
}));

describe('GET /api/platform/diagnostics/prisma-cache', () => {
  test('returns cache introspection safely', async () => {
    const router = (await import('../../src/routes/platform/diagnostics')).default;
    const app = express();
    app.use('/api/platform/diagnostics', router);

    const r = await request(app).get('/api/platform/diagnostics/prisma-cache');
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ size: 1, keys: ['u1'] }));
  });
});