import express from 'express';
import request from 'supertest';
import { idempotency } from '../src/middleware/idempotency';

// Mock PaymentDbService and TenantService used by the middleware
jest.mock('../src/services/paymentDbService', () => ({
  PaymentDbService: {
    findIdempotencyKey: jest.fn(),
    createIdempotencyKey: jest.fn(),
  },
}));

jest.mock('../src/services/tenantService', () => ({
  TenantService: {
    // Execute the callback immediately in the "tenant context"
    withTenantContext: jest.fn(async (_tenant: any, cb: any) => cb()),
    fromOriginOrApiKey: jest.fn(),
    getTenantById: jest.fn(),
    getOrCreateDefaultTenant: jest.fn(),
  },
}));

import { PaymentDbService } from '../src/services/paymentDbService';
import { TenantService } from '../src/services/tenantService';

/**
 * Build a tiny Express app mounting the idempotency middleware
 * and a test route we can exercise.
 */
function buildApp(
  { attachTenant = true, path = '/test', handler }: { attachTenant?: boolean; path?: string; handler?: any } = {}
) {
  const app = express();
  app.use(express.json());

  // Optionally simulate that a tenant has already been resolved upstream.
  if (attachTenant) {
    app.use((req, res, next) => {
      (req as any).tenant = { id: 't_1' };
      (res as any).locals = { tenant: { id: 't_1' } };
      next();
    });
  }

  app.use(idempotency as any);

  let postHit = 0;
  const defaultHandler = (_req: express.Request, res: express.Response) => {
    postHit++;
    return res.status(202).json({ ok: true });
  };

  app.get(path, (_req, res) => res.status(200).json({ ok: true }));
  app.post(path, handler ?? defaultHandler);

  return { app, getPostHit: () => postHit };
}

describe('middleware/idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete (process.env as any).DEV_TENANT_ID;
  });

  it('skips when method is GET even if header is present', async () => {
    const { app } = buildApp();
    await request(app)
      .get('/test')
      .set('Idempotency-Key', 'abc')
      .expect(200);
    expect(PaymentDbService.findIdempotencyKey).not.toHaveBeenCalled();
  });

  it('skips when Idempotency-Key header is missing on POST', async () => {
    const { app } = buildApp();
    await request(app).post('/test').send({ a: 1 }).expect(202);
    expect(PaymentDbService.findIdempotencyKey).not.toHaveBeenCalled();
  });

  it('short-circuits with cached response when key already exists', async () => {
    (PaymentDbService.findIdempotencyKey as jest.Mock).mockResolvedValue({
      status: 201,
      response: { cached: true },
    });
    const { app, getPostHit } = buildApp();
    const res = await request(app)
      .post('/test')
      .set('Idempotency-Key', 'dup-1')
      .send({ any: 'thing' })
      .expect(201);
    expect(res.body).toEqual({ cached: true });
    // Route handler should not run when we hit the cache.
    expect(getPostHit()).toBe(0);
    expect(PaymentDbService.createIdempotencyKey).not.toHaveBeenCalled();
  });

  it('persists the first response on finish when key is new', async () => {
    (PaymentDbService.findIdempotencyKey as jest.Mock).mockResolvedValue(null);
    const { app } = buildApp({
      handler: (_req: express.Request, res: express.Response) =>
        res.status(202).json({ created: 42 }),
    });
    await request(app)
      .post('/test')
      .set('Idempotency-Key', 'fresh-1')
      .send({ foo: 'bar' })
      .expect(202);

    // Allow the 'finish' listener to run
    await new Promise((r) => setImmediate(r));

    expect(PaymentDbService.createIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'fresh-1',
        method: 'POST',
        endpoint: '/test',
        status: 202,
        response: { created: 42 },
      })
    );
  });

  it('dev/test fallback: creates or loads a tenant for /api/auth without Origin/API key', async () => {
    // Simulate no tenant resolvable from Origin/API key
    (TenantService.fromOriginOrApiKey as jest.Mock).mockRejectedValue(
      new Error('no tenant')
    );
    (TenantService.getOrCreateDefaultTenant as jest.Mock).mockResolvedValue({
      id: 'dev-tenant',
    });
    (PaymentDbService.findIdempotencyKey as jest.Mock).mockResolvedValue(null);

    const { app } = buildApp({
      attachTenant: false,
      path: '/api/auth/login',
      handler: (_req: express.Request, res: express.Response) =>
        res.status(200).json({ ok: true }),
    });

    await request(app)
      .post('/api/auth/login')
      .set('Idempotency-Key', 'auth-1')
      .send({ email: 'a@b.com', pwd: 'x' })
      .expect(200);

    expect(TenantService.getOrCreateDefaultTenant).toHaveBeenCalled();
    expect(PaymentDbService.findIdempotencyKey).toHaveBeenCalledWith('auth-1');
  });
});