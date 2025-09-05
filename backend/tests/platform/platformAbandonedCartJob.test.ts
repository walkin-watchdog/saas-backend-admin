import { prisma } from '../../src/utils/prisma';
import { PlatformAbandonedCartJob } from '../../src/jobs/platformAbandonedCartJob';
import { EmailService } from '../../src/services/emailService';
import { PlatformConfigService } from '../../src/services/platformConfigService';

describe('PlatformAbandonedCartJob templates', () => {
  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://example.com';
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.platformAbandonedCart.deleteMany();
  });

  it('sends stage-specific templates', async () => {
    const now = new Date();
    await prisma.platformAbandonedCart.createMany({
      data: [
        {
          sessionId: 'sess1',
          email: 'first@example.com',
          planId: 'plan',
          status: 'open',
          reminderCount: 0,
          lastSeenAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        },
        {
          sessionId: 'sess2',
          email: 'second@example.com',
          planId: 'plan',
          status: 'open',
          reminderCount: 1,
          lastSeenAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        },
        {
          sessionId: 'sess3',
          email: 'third@example.com',
          planId: 'plan',
          status: 'open',
          reminderCount: 2,
          lastSeenAt: new Date(now.getTime() - 73 * 60 * 60 * 1000),
        },
      ],
    });

    const emailSpy = jest
      .spyOn(EmailService, 'sendEmail')
      .mockResolvedValue({} as any);
    jest.spyOn(PlatformConfigService, 'setConfig').mockResolvedValue();

    await PlatformAbandonedCartJob.processAbandonedCarts();

    expect(emailSpy).toHaveBeenCalledTimes(3);
    const calls = emailSpy.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'first@example.com',
          template: 'platform-cart-reminder-1',
        }),
        expect.objectContaining({
          to: 'second@example.com',
          template: 'platform-cart-reminder-2',
        }),
        expect.objectContaining({
          to: 'third@example.com',
          template: 'platform-cart-reminder-3',
        }),
      ])
    );
  });
});

