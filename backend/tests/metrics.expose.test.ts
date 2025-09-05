import request from 'supertest';
import express from 'express';
import metricsRoute from '../src/routes/metrics';

jest.mock('../src/utils/metrics', () => ({
  promRegister: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: jest.fn(async () => '# HELP dummy ok\n# TYPE dummy counter\ndummy 1\n'),
  },
}));

describe('GET /metrics', () => {
  it('returns Prometheus exposition format', async () => {
    const app = express();
    app.use('/metrics', metricsRoute);

    const r = await request(app).get('/metrics');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/plain');
    expect(r.text).toContain('dummy 1');
  });
});