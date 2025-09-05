import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/utils/prisma';
import { URL } from 'node:url';

describe('resolveTenant → preflight circuit breaker mapping to 503', () => {
  let tenant: any;
  let goodUrl: string;
  let badUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set for preflight integration test');
    }
    // good DSN = your test DB; bad DSN = quick-fail variant (closed port + tiny connect_timeout)
    const ok = new URL(process.env.DATABASE_URL);
    const bad = new URL(process.env.DATABASE_URL);
    bad.hostname = '127.0.0.1';
    bad.port = '1';
    bad.searchParams.set('connect_timeout', '1');
    goodUrl = ok.toString();
    badUrl  = bad.toString();
    // Create a real tenant the middleware can resolve via x-api-key
    tenant = await prisma.tenant.create({
      data: {
        name: 'PreflightTenant',
        status: 'active',
        dedicated: true,
        datasourceUrl: goodUrl,
      },
      select: {
        id: true,
        apiKey: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });
  const buildApp = async () => {
    const app = express();
    const { resolveTenant } = await import('../../src/middleware/tenantMiddleware');
    app.use(resolveTenant);
    app.get('/test', (_req, res) => res.json({ ok:true }));
    return app;
  };

  test('happy path: preflight OK → 200', async () => {
    const app = await buildApp();
    const r = await request(app)
      .get('/test')
      .set('x-api-key', tenant.apiKey);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  test('sad path: preflight fails → 503 with structured body + Retry-After', async () => {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { datasourceUrl: badUrl },
    });

    const app = await buildApp();
    const r = await request(app)
      .get('/test')
      .set('x-api-key', tenant.apiKey);
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('10');
    expect(r.body).toEqual(expect.objectContaining({
      code: 'DEDICATED_DB_UNAVAILABLE',
      tenantId: tenant.id,
      retryAfterSec: 10,
    }));
  });
});