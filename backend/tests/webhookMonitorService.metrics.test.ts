import { WebhookMonitorService } from '../src/services/webhookMonitorService';

jest.mock('../src/utils/metrics', () => ({
  webhookFailureCounter: { inc: jest.fn() },
}));
jest.mock('../src/utils/prisma', () => ({
  prisma: {
    webhookDelivery: {
      update: jest.fn(async () => ({})),
    },
  },
}));

const { webhookFailureCounter } = jest.requireMock('../src/utils/metrics');
const { prisma } = jest.requireMock('../src/utils/prisma');

describe('WebhookMonitorService.markFailed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('increments failure counter and updates storage', async () => {
    await WebhookMonitorService.markFailed('stripe', 'evt_1', 'oops');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_1' } },
      data: { status: 'failed', error: 'oops' },
    });
    expect(webhookFailureCounter.inc).toHaveBeenCalledWith({ provider: 'stripe' });
  });
});