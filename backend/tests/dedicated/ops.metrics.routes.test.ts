import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.mock('../../src/middleware/platformAuth', () => ({
  authenticatePlatform: (_req: any, _res: any, next: any) => next(),
  requirePlatformPermissions: (_:string) => (_req:any,_res:any,next:any)=> next(),
}));

describe('/ops/metrics & /metrics endpoints', () => {
  test('GET /ops/metrics returns snapshot JSON', async () => {
    const app = express();
    const opsRoutes = (await import('../../src/routes/ops')).default;
    app.use('/ops', opsRoutes);

    const r = await request(app).get('/ops/metrics');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('preflightP95');
  });

  test('GET /metrics returns Prometheus text', async () => {
    const app = express();
    const metricsRoutes = (await import('../../src/routes/metrics')).default;
    app.use('/metrics', metricsRoutes);
    const r = await request(app).get('/metrics');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/plain/);
    expect(r.text).toMatch(/process_cpu_user_seconds_total|preflight_latency_ms/);
  });
});
