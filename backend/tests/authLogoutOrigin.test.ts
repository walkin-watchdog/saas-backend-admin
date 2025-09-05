/**
 * Logout Origin/Referer allow-list (defense-in-depth)
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Configure allowed origins BEFORE importing the router (module reads env at import time)
process.env.FRONTEND_URL = 'http://good.test';
process.env.ADMIN_URL = 'http://admin.test';
process.env.ALLOWED_ORIGINS = 'http://good.test,http://admin.test';

import authRoutes from '../src/routes/auth';

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  // Inject tenant id (bypasses full tenant resolver)
  app.use((req, _res, next) => { (req as any).tenantId = 'T1'; next(); });
  app.use('/api/auth', authRoutes);
  return app;
}

describe('POST /api/auth/logout Origin/Referer allow-list', () => {
  test('denies with 403 when Origin is not allowed', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'http://evil.test')
      .set('Cookie', 'csrf=abc')
      .set('x-csrf-token', 'abc');
    expect(res.status).toBe(403);
  });

  test('allows when Origin is allowed and CSRF matches', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'http://good.test')
      .set('Cookie', 'csrf=abc')
      .set('x-csrf-token', 'abc');
    expect(res.status).toBe(204);
  });
});