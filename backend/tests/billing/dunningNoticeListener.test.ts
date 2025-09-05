import { eventBus, BILLING_EVENTS } from '../../src/utils/eventBus';
import { prisma } from '../../src/utils/prisma';
import { EmailService } from '../../src/services/emailService';
import '../../src/listeners/dunningNotice';

jest.spyOn(EmailService, 'sendEmail').mockResolvedValue({} as any);

describe('dunning notice listener', () => {
  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: 't1', name: 'T1', status: 'active', dedicated: false } });
    await prisma.subscriber.create({ data: { tenantId: 't1', displayName: 'T1', ownerEmail: 'owner@t1.test' } as any });
  });
  afterAll(async () => {
    await prisma.subscriber.deleteMany({ where: { tenantId: 't1' } });
    await prisma.tenant.deleteMany({ where: { id: 't1' } });
  });

  it('sends email when event published', async () => {
    eventBus.publish(BILLING_EVENTS.DUNNING_NOTICE_SENT, { tenantId: 't1', subscriptionId: 's1', attempt: 1 });
    // Wait up to 2s for the async handler (transaction + query) to complete
    const start = Date.now();
    while ((EmailService.sendEmail as jest.Mock).mock.calls.length === 0) {
      if (Date.now() - start > 2000) {
        throw new Error('Timed out waiting for dunning notice email to be sent');
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(EmailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@t1.test' }));
  });
});