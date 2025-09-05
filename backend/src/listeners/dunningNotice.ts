import { eventBus, BILLING_EVENTS } from '../utils/eventBus';
import { withPlatformRole } from '../utils/prisma';
import { EmailService } from '../services/emailService';
import { logger } from '../utils/logger';

const handler = async (payload: any) => {
  const { tenantId, subscriptionId, attempt } = payload || {};
  if (!tenantId) return;
  try {
    const sub = await withPlatformRole(async (tx) =>
      tx.subscriber.findUnique({
        where: { tenantId },
        select: { ownerEmail: true },
      })
    );
    if (!sub?.ownerEmail) return;
    await EmailService.sendEmail({
      to: sub.ownerEmail,
      subject: 'Subscription payment overdue',
      template: 'dunning-notice',
      context: { attempt, subscriptionId, tenantId },
      tenantId,
    });
  } catch (err: any) {
    logger.error('Failed to send dunning notice', {
      tenantId,
      subscriptionId,
      error: err?.message,
    });
  }
};

const anyBus: any = eventBus as any;
try {
  if (typeof anyBus.on === 'function') {
    anyBus.on(BILLING_EVENTS.DUNNING_NOTICE_SENT, handler);
  } else if (typeof anyBus.subscribe === 'function') {
    anyBus.subscribe(BILLING_EVENTS.DUNNING_NOTICE_SENT, handler);
  } else if (typeof anyBus.addListener === 'function') {
    anyBus.addListener(BILLING_EVENTS.DUNNING_NOTICE_SENT, handler);
  }
} catch (e) {
  logger.debug?.('dunningNotice: failed to register listener', { error: (e as Error).message });
}