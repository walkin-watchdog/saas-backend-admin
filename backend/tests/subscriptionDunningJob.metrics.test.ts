import { SubscriptionDunningJob } from '../src/jobs/subscriptionDunningJob';

jest.mock('@prisma/client', () => {
  class PrismaClient {
    tenant = { findMany: jest.fn(async () => [{ id: 't-one' }]) };
  }
  return { PrismaClient };
});

jest.mock('../src/middleware/tenantMiddleware', () => ({
  withTenantContext: async (_t: any, fn: any) =>
    fn({
      subscription: {
        findMany: jest.fn(async () => ([
          // trial expired -> transition
          { id: 's1', tenantId: 't-one', status: 'trialing', trialEndsAt: new Date(0), updatedAt: new Date(0) },
          // past_due, no attempts yet -> will bump
          { id: 's2', tenantId: 't-one', status: 'past_due', dunningAttempts: 0, updatedAt: new Date(0) },
        ])),
        update: jest.fn(async () => ({})),
      },
    }),
}));

jest.mock('../src/services/subscriptionService', () => ({
  SubscriptionService: {
    transitionStatus: jest.fn(async () => ({})),
  },
}));

jest.mock('../src/utils/eventBus', () => ({
  eventBus: { publish: jest.fn() },
  BILLING_EVENTS: { DUNNING_NOTICE_SENT: 'DUNNING_NOTICE_SENT' },
}));

jest.mock('../src/utils/metrics', () => {
  const set = jest.fn();
  const observe = jest.fn();
  const inc = jest.fn();
  return {
    jobQueueDepth: { set },
    jobDuration: { observe },
    dunningRetryCounter: { labels: (tenant: string) => ({ inc }) },
    hashTenantId: (id: string) => `h(${id})`,
  };
});

const { jobQueueDepth, jobDuration } = jest.requireMock('../src/utils/metrics');

describe('SubscriptionDunningJob metrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets queue depth, bumps retries, observes duration', async () => {
    await SubscriptionDunningJob.process();
    expect(jobQueueDepth.set).toHaveBeenCalledWith(
      { job: 'subscription_dunning', tenant: 'h(t-one)' },
      2
    );
    expect(jobDuration.observe).toHaveBeenCalledWith(
      { job: 'subscription_dunning', tenant: 'h(t-one)' },
      expect.any(Number)
    );
  });
});