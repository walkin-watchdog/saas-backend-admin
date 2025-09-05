// tests/middleware/tenantMiddleware.preflight.test.ts
import request from 'supertest';
import express from 'express';
import { requestId } from '../../src/middleware/requestId';
import { signAccess } from '../../src/utils/jwt';

process.env.JWT_SECRET = 'test-secret';

// --- register mocks BEFORE loading the SUT, and reset module cache ---
jest.resetModules();

jest.mock('../../src/services/tenantService', () => ({
  TenantService: {
    getTenantById: jest.fn((id: string) => Promise.resolve({
      id,
      status: 'active',
      dedicated: true,
      datasourceUrl: 'postgresql://tenant/db',
    })),
    fromOriginOrApiKey: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('../../src/utils/prisma', () => ({
  getDedicatedPrisma: jest.fn(() => ({})),
  prisma: { $connect: jest.fn(), $disconnect: jest.fn() },
}));

// keep a handle to the fire() mock so we can assert it ran
const mockFire = jest.fn().mockRejectedValue(new Error('boom'));
jest.mock('../../src/utils/preflight', () => ({
  getPreflightBreaker: jest.fn(() => ({ fire: mockFire })),
}));

jest.mock('../../src/utils/opMetrics', () => ({
  opMetrics: {
    inc: jest.fn(),
    observePreflight: jest.fn(),
    snapshot: jest.fn(() => ({})),
  },
}));

jest.mock('../../src/utils/metrics', () => ({
  hashTenantId: () => 'abcdef12',
}));

jest.mock('../../src/services/auditService', () => ({
  AuditService: { log: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
  requestContext: {
    getStore: jest.fn(() => ({ tenantId: 't-503' })),
    run: jest.fn((_store, cb) => cb()),
  },
}));

// now load the SUT AFTER mocks
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveTenant } = require('../../src/middleware/tenantMiddleware');

const { opMetrics } = jest.requireMock('../../src/utils/opMetrics');
const { getPreflightBreaker } = jest.requireMock('../../src/utils/preflight');

describe('resolveTenant preflight (dedicated DB unavailable)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 503 and bumps dbUnavailable with hashed tenant label', async () => {
    const app = express();
    app.use(requestId);
    app.use(resolveTenant);
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));

    const token = signAccess({
      sub: 'U1',
      tenantId: 't-503',
      tokenVersion: 0,
      role: 'ADMIN',
    });

    const r = await request(app).get('/api/ping').set('Authorization', `Bearer ${token}`);

    // prove the preflight path actually executed against our mock
    expect(getPreflightBreaker).toHaveBeenCalledWith('postgresql://tenant/db');
    expect(mockFire).toHaveBeenCalled();

    // expected 503 behavior
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('10');
    expect(opMetrics.inc).toHaveBeenCalledWith('dbUnavailable', 1, { tenantId: 'abcdef12' });
  });
});