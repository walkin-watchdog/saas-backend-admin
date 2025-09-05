import request from 'supertest';
import express from 'express';
import { requestId } from '../../src/middleware/requestId';
import { httpMetrics } from '../../src/middleware/httpMetrics';
import { routePath } from '../../src/middleware/routePath';

jest.mock('../../src/utils/metrics', () => {
  const observe = jest.fn();
  const labels = jest.fn().mockReturnValue({ observe });
  return {
    // used by middleware
    httpRequestDuration: { labels },
    // safe hash stub to make expectations predictable
    hashTenantId: (id: string) => `h(${id})`,
  };
});

const { httpRequestDuration } = jest.requireMock('../../src/utils/metrics');

describe('httpMetrics middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records latency with routePath override (happy)', async () => {
    const app = express();
    app.use(requestId);
    app.use(routePath);
    app.use(httpMetrics);

    app.get('/hello/:id', (_req, res) => res.status(201).json({ ok: true }));

    await request(app).get('/hello/123');

    expect(httpRequestDuration.labels).toHaveBeenCalledWith('/hello/:id', '201', 'h(platform)');
    const ret = (httpRequestDuration.labels as jest.Mock).mock.results[0].value;
    expect(ret.observe).toHaveBeenCalledWith(expect.any(Number));
  });

  it('falls back to req.route.path when routePath is not set (happy)', async () => {
    const app = express();
    app.use(requestId);
    app.use(httpMetrics);

    app.get('/things/:id', (_req, res) => res.status(200).send('ok'));

    await request(app).get('/things/42');

    expect(httpRequestDuration.labels).toHaveBeenCalledWith('/things/:id', '200', 'h(platform)');
  });

  it('labels unknown tenant when ALS has no tenant (sad-ish)', async () => {
    // simulate no requestId middleware (which seeds platform)
    const app = express();
    app.use(httpMetrics);
    app.get('/x', (_req, res) => res.send('x'));

    await request(app).get('/x');

    // tenant label should be 'unknown'
    expect(httpRequestDuration.labels).toHaveBeenCalledWith('/x', '200', 'unknown');
  });
});