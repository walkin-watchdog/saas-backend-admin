import { AbandonedCartJob } from '../src/jobs/abandonedCartJob';

jest.mock('../src/utils/metrics', () => {
  const set = jest.fn();
  const observe = jest.fn();
  return {
    jobQueueDepth: { set },
    jobDuration: { observe },
    hashTenantId: () => 'deadbeef',
  };
});

jest.mock('../src/middleware/tenantMiddleware', () => ({
  getTenantPrisma: jest.fn(() => ({
    $queryRaw: jest.fn(async () => [{ pg_try_advisory_lock: true }]),
    $executeRaw: jest.fn(async () => ({})),
  })),
  getTenantId: jest.fn(() => 't-abc'),
}));

jest.mock('../src/services/tenantService', () => ({
  TenantService: {
    withTenantContext: async (_t: any, fn: any) => fn(),
  },
}));

jest.mock('../src/services/abandonedCartService', () => ({
  AbandonedCartService: {
    findManyAbandonedCarts: jest.fn(async () => ([
      { id: 'c1', tenantId: 't-abc', productId: 'p1', currency: 'USD', customerData: {} },
      { id: 'c2', tenantId: 't-abc', productId: 'p2', currency: 'USD', customerData: {} },
    ])),
    updateAbandonedCart: jest.fn(async () => ({})),
    deleteManyAbandonedCarts: jest.fn(async () => ({ count: 0 })),
  },
}));

jest.mock('../src/services/productService', () => ({
  ProductService: {
    findProduct: jest.fn(async () => ({ id: 'p1', title: 'Thing' })),
  },
}));

jest.mock('../src/services/emailService', () => ({
  EmailService: {
    sendNewAbandonedCartNotification: jest.fn(async () => ({})),
    sendAbandonedCartReminder: jest.fn(async () => ({})),
  },
}));

jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: {
    getConfig: jest.fn(async () => ({})),
  },
}));

jest.mock('../src/services/hubspotService', () => ({
  HubSpotService: {
    findOrCreateContact: jest.fn(async () => ({ id: 'hs1', existed: false, cust: {} })),
    createDealForContact: jest.fn(async () => ({})),
  },
}));

const { jobQueueDepth, jobDuration } = jest.requireMock('../src/utils/metrics');

describe('AbandonedCartJob metrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('processDebouncedCarts sets queue depth and observes duration', async () => {
    await AbandonedCartJob.processDebouncedCarts();
    expect(jobQueueDepth.set).toHaveBeenCalledWith(
      { job: 'abandoned_cart_first_touch', tenant: 'deadbeef' },
      2
    );
    expect(jobDuration.observe).toHaveBeenCalledWith(
      { job: 'abandoned_cart_first_touch', tenant: 'deadbeef' },
      expect.any(Number)
    );
  });

  it('processAbandonedCarts sets queue depth and observes duration', async () => {
    const svc = require('../src/services/abandonedCartService');
    // make reminders due
    svc.AbandonedCartService.findManyAbandonedCarts.mockResolvedValueOnce([
      { id: 'c3', tenantId: 't-abc', productId: 'p3', remindersSent: 0, adminNotifiedAt: new Date(0) },
    ]);
    await AbandonedCartJob.processAbandonedCarts();
    expect(jobQueueDepth.set).toHaveBeenCalledWith(
      { job: 'abandoned_cart_follow_up', tenant: 'deadbeef' },
      1
    );
    expect(jobDuration.observe).toHaveBeenCalledWith(
      { job: 'abandoned_cart_follow_up', tenant: 'deadbeef' },
      expect.any(Number)
    );
  });
});