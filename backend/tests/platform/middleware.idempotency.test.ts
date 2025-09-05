 /* eslint-disable import/first */
 // Mock services so tests don't depend on DB transactions and are deterministic.
 jest.mock('../../src/services/tenantService', () => ({
   TenantService: {
     // Force "no tenant" path for idempotency middleware
     fromOriginOrApiKey: jest.fn().mockResolvedValue(null),
     withTenantContext: jest.fn(async (_tenant: any, fn: any) => fn()),
     getTenantById: jest.fn(),
     getOrCreateDefaultTenant: jest.fn(),
   },
 }));
 
 jest.mock('../../src/services/paymentDbService', () => ({
   PaymentDbService: {
     findIdempotencyKey: jest.fn().mockResolvedValue(null),
     createIdempotencyKey: jest.fn().mockResolvedValue(undefined),
   },
 }));
 
 jest.mock('../../src/services/platformIdempotencyService', () => {
   const store = new Map<string, any>();
   return {
     PlatformIdempotencyService: {
       findKey: jest.fn(async (key: string) => store.get(key) || null),
       createKey: jest.fn(async (payload: any) => { store.set(payload.key, payload); }),
     },
   };
 });

import express from 'express';
import request from 'supertest';
import { requestId } from '../../src/middleware/requestId';
import { idempotency } from '../../src/middleware/idempotency';

describe('Platform middleware: requestId & idempotency', () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(requestId);

    const strictStore: Record<string, string> = {};
    let echoHits = 0;
    let getHits = 0;
    let healthHits = 0;
    let webhookHits = 0;

    // Route that requires Idempotency-Key and enforces body consistency.
    app.post(
      '/strict',
      (req, res, next) => {
        const key = req.header('Idempotency-Key');
        // treat missing or whitespace-only keys as invalid per policy
        if (!key || key.trim() === '') {
          return res.status(400).json({ error: 'Idempotency-Key required' });
        }
        const prev = strictStore[key];
        const bodyStr = JSON.stringify(req.body);
        if (prev && prev !== bodyStr) {
          return res.status(409).json({ error: 'Payload mismatch' });
        }
        strictStore[key] = bodyStr;
        next();
      },
      idempotency,
      (req, res) => {
        res.status(201).json({ stored: req.body });
      }
    );

    // Generic echo route to show idempotent caching behaviour.
    app.post('/echo', idempotency, (req, res) => {
      // Use a process-level counter to prove that, without an Idempotency-Key,
      // the handler executes again on each request.
      echoHits += 1;
      res.json({ body: req.body, count: echoHits });
    });

    // GET route with idempotency middleware attached: should be skipped for GETs.
    app.get('/get-echo', idempotency, (_req, res) => {
      getHits += 1;
      res.json({ count: getHits });
    });

    // Guardrail: /api/health must skip idempotency entirely.
    app.get('/api/health', idempotency, (_req, res) => {
      healthHits += 1;
      res.json({ ok: true, count: healthHits });
    });

    // Guardrail: pre-tenant webhook endpoints must skip idempotency entirely.
    app.post('/api/payments/webhooks/:provider', idempotency, (req, res) => {
      webhookHits += 1;
      res.status(200).json({ ok: true, count: webhookHits, payload: req.body });
    });

    app.get('/ping', (req, res) => {
      res.json({ ok: true });
    });

    return app;
  }

  // (Optional) Silence expected console noise if any slips through.
  let consoleErrSpy: jest.SpyInstance;
  beforeAll(() => {
    consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrSpy.mockRestore();
  });

  it('attaches X-Request-Id header to every response', async () => {
    const app = buildApp();
    const res = await request(app).get('/ping').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toHaveLength(0);
  });

  it('preserves incoming X-Request-Id if provided', async () => {
    const app = buildApp();
    const customId = 'req-abc-123';
    const res = await request(app).get('/ping').set('X-Request-Id', customId).expect(200);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('returns same response for repeated Idempotency-Key', async () => {
    const app = buildApp();
    const key = 'abc123';
    const first = await request(app).post('/echo').set('Idempotency-Key', key).send({ a: 1 }).expect(200);
    expect(first.body.body).toEqual({ a: 1 });
    const second = await request(app).post('/echo').set('Idempotency-Key', key).send({ a: 2 }).expect(200);
    expect(second.body).toEqual(first.body);
  });

  it('replaying with different body but same key yields 409', async () => {
    const app = buildApp();
    const key = 'strict-1';
    await request(app)
      .post('/strict')
      .set('Idempotency-Key', key)
      .send({ value: 1 })
      .expect(201);
    await request(app)
      .post('/strict')
      .set('Idempotency-Key', key)
      .send({ value: 2 })
      .expect(409);
  });

  it('missing Idempotency-Key on required route returns 400', async () => {
    const app = buildApp();
    await request(app).post('/strict').send({ value: 1 }).expect(400);
  });

  it('processes normally when Idempotency-Key missing on non-required route', async () => {
    const app = buildApp();
    const first = await request(app).post('/echo').send({ a: 1 }).expect(200);
    const second = await request(app).post('/echo').send({ a: 2 }).expect(200);
    expect(second.body.count).toBeGreaterThan(first.body.count);
  });

  it('whitespace Idempotency-Key on required route returns 400', async () => {
    const app = buildApp();
    await request(app)
      .post('/strict')
      .set('Idempotency-Key', '   ')
      .send({ value: 1 }).expect(400);
  });

  it('still attaches X-Request-Id header on 400 responses', async () => {
    const app = buildApp();
    const res = await request(app).post('/strict').send({ value: 1 }).expect(400);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toHaveLength(0);
  });

  it('still attaches X-Request-Id header on 409 responses', async () => {
    const app = buildApp();
    const key = 'strict-err-409';
    await request(app).post('/strict').set('Idempotency-Key', key).send({ value: 1 }).expect(201);
    const res = await request(app).post('/strict').set('Idempotency-Key', key).send({ value: 2 }).expect(409);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toHaveLength(0);
  });

  // --- New coverage for "skip for GET" rule
  it('skips idempotency for GET even when Idempotency-Key is provided', async () => {
    const app = buildApp();
    const key = 'get-skip-1';
    const first = await request(app).get('/get-echo').set('Idempotency-Key', key).expect(200);
    const second = await request(app).get('/get-echo').set('Idempotency-Key', key).expect(200);
    expect(second.body.count).toBeGreaterThan(first.body.count);
  });

  // --- Guardrail coverage: /api/health is excluded from idempotency
  it('does not apply idempotency to /api/health', async () => {
    const app = buildApp();
    const key = 'health-guard-1';
    const first = await request(app).get('/api/health').set('Idempotency-Key', key).expect(200);
    const second = await request(app).get('/api/health').set('Idempotency-Key', key).expect(200);
    expect(second.body.count).toBeGreaterThan(first.body.count);
  });

  // --- Guardrail coverage: /api/payments/webhooks/* is excluded from idempotency
  it('does not apply idempotency to /api/payments/webhooks/*', async () => {
    const app = buildApp();
    const key = 'webhook-guard-1';
    const first = await request(app)
      .post('/api/payments/webhooks/razorpay')
      .set('Idempotency-Key', key)
      .send({ event: 'ping' })
      .expect(200);
    const second = await request(app)
      .post('/api/payments/webhooks/razorpay')
      .set('Idempotency-Key', key)
      .send({ event: 'ping2' })
      .expect(200);
    expect(second.body.count).toBeGreaterThan(first.body.count);
  });
});