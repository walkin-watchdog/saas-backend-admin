import request from 'supertest';
import express from 'express';
import { requestId } from '../../src/middleware/requestId';
import { requestContext } from '../../src/utils/logger';

describe('requestId + logger context enrichment', () => {
  it('sets X-Request-Id header and seeds ALS with {requestId, tenantId:"platform"}', async () => {
    const app = express();
    app.use(requestId);
    app.get('/ctx', (_req, res) => {
      const store = requestContext.getStore();
      res.json({ requestId: store?.requestId, tenantId: store?.tenantId });
    });

    const r = await request(app).get('/ctx');
    expect(r.status).toBe(200);
    expect(r.headers['x-request-id']).toBeTruthy();
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
    expect(r.body.tenantId).toBe('platform');
  });
});