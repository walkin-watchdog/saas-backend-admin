describe('WebhookMonitorService replay observability', () => {
  it('audit-logs skipped replay, increments replay counter, and emits spike on bursts', async () => {
    jest.resetModules();

    const auditLog = jest.fn();
    const inc = jest.fn();
    const publish = jest.fn();

    // Delivery is already processed -> idempotent skip path
    jest.doMock('../src/utils/prisma', () => ({
      prisma: {
        webhookDelivery: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'd1',
            provider: 'foo',
            eventId: 'e1',
            status: 'processed',
          }),
        },
      },
    }));

    jest.doMock('../src/services/auditService', () => ({
      AuditService: { log: auditLog },
    }));
    jest.doMock('../src/utils/metrics', () => ({
      webhookReplayCounter: { inc },
    }));
    jest.doMock('../src/utils/platformEvents', () => ({
      PlatformEventBus: { publish },
      PLATFORM_EVENTS: { WEBHOOK_RETRY_SPIKE: 'platform.webhook.retry_spike' },
    }));

    const { WebhookMonitorService } = await import('../src/services/webhookMonitorService');

    // Single replay -> counter inc + audit log for skip
    await WebhookMonitorService.replayWebhook('d1', 'u1');
    expect(inc).toHaveBeenCalledWith({ provider: 'foo' });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.replay_skipped',
        resource: 'webhook_delivery',
        resourceId: 'd1',
      }),
    );

    // Burst to trigger spike (threshold > 20 within 1 min)
    for (let i = 0; i < 21; i++) {
      await WebhookMonitorService.replayWebhook('d1', 'u1');
    }
    expect(publish).toHaveBeenCalledWith(
      'platform.webhook.retry_spike',
      expect.objectContaining({ provider: 'foo', count: expect.any(Number) }),
    );
  });
});