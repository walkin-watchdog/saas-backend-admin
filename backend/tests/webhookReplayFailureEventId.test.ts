import { prisma } from '../src/utils/prisma';
import { WebhookMonitorService } from '../src/services/webhookMonitorService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../src/utils/platformEvents';
import { SubscriptionService } from '../src/services/subscriptionService';

describe('WebhookMonitorService replay failure emits original eventId', () => {
  afterEach(async () => {
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEvent.deleteMany();
    jest.restoreAllMocks();
  });

  test('replay failure publishes original eventId', async () => {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        provider: 'test',
        eventId: 'evt-original',
        payloadHash: 'hash',
        status: 'failed',
      },
    });
    await prisma.webhookEvent.create({
      data: {
        provider: 'test',
        eventId: 'evt-original',
        payloadHash: 'hash',
        payload: {},
      },
    });

    jest.spyOn(SubscriptionService, 'processWebhook').mockRejectedValue(new Error('boom'));
    const publishSpy = jest.spyOn(PlatformEventBus, 'publish');

    await expect(
      WebhookMonitorService.replayWebhook(delivery.id, 'user1'),
    ).rejects.toThrow('boom');

    const call = publishSpy.mock.calls.find(
      ([event]) => event === PLATFORM_EVENTS.WEBHOOK_REPLAYED,
    );
    expect(call).toBeTruthy();
    expect(call![1]).toMatchObject({ eventId: 'evt-original' });
  });
});
