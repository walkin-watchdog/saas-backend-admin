import { prisma as prismaClient } from '../utils/prisma';
const prisma: any = prismaClient;
import { AuditService } from './auditService';
import { SubscriptionService } from './subscriptionService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';
import crypto from 'crypto';
import { webhookFailureCounter, webhookReplayCounter } from '../utils/metrics';

const failureTracker = new Map<string, number[]>();
function trackFailure(provider: string) {
  const now = Date.now();
  const arr = failureTracker.get(provider) || [];
  const recent = arr.filter(ts => now - ts < 60000);
  recent.push(now);
  failureTracker.set(provider, recent);
  if (recent.length > 20) {
    PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_FAILED, { provider, count: recent.length });
  }
}

const replayTracker = new Map<string, number[]>();
function trackReplay(provider: string) {
  const now = Date.now();
  const arr = replayTracker.get(provider) || [];
  const recent = arr.filter(ts => now - ts < 60000);
  recent.push(now);
  replayTracker.set(provider, recent);
  if (recent.length > 20) {
    PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_RETRY_SPIKE, { provider, count: recent.length });
  }
}

export class WebhookMonitorService {
  static async listEndpoints(filters: { provider?: string; active?: boolean } = {}) {
    const where: any = {};
    if (filters.provider) where.provider = filters.provider;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    return prisma.webhookEndpoint.findMany({ where, orderBy: { createdAt: 'desc' } });
  }
  
  static async recordDelivery(provider: string, eventId: string, payload: string) {
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const parsedPayload = (() => {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    })();
    try {
      await prisma.webhookDelivery.create({
        data: { provider, eventId, payloadHash: hash, status: 'received' },
      });
      await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider, eventId } },
        update: { payloadHash: hash, payload: parsedPayload },
        create: { provider, eventId, payloadHash: hash, payload: parsedPayload, status: 'received' },
      });
      return { duplicate: false };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await prisma.webhookDelivery.findUnique({
          where: { provider_eventId: { provider, eventId } },
        });
        if (existing && existing.payloadHash === hash) {
          return { duplicate: true, status: existing.status };
        }
        throw new Error('WEBHOOK_REPLAY_HASH_MISMATCH');
      }
      throw e;
    }
  }

  static async markProcessed(provider: string, eventId: string) {
    await prisma.webhookDelivery.update({
      where: { provider_eventId: { provider, eventId } },
      data: { status: 'processed', processedAt: new Date(), error: null },
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_PROCESSED, { provider, eventId });
  }

  static async markFailed(provider: string, eventId: string, error: string) {
    await prisma.webhookDelivery.update({
      where: { provider_eventId: { provider, eventId } },
      data: { status: 'failed', error },
    });
    webhookFailureCounter.inc({ provider });
    PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_DELIVERY_FAILED, { provider, eventId, error });
    trackFailure(provider);
  }
  static async findDeliveries(filters: {
    provider?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.provider) where.provider = filters.provider;
    if (filters.status) where.status = filters.status;

    if (filters.startDate || filters.endDate) {
      where.receivedAt = {};
      if (filters.startDate) where.receivedAt.gte = filters.startDate;
      if (filters.endDate) where.receivedAt.lte = filters.endDate;
    }

    return prisma.webhookDelivery.findMany({
      where,
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { receivedAt: 'desc' }
    });
  }

  static async findDeliveryById(id: string) {
    return prisma.webhookDelivery.findUnique({
      where: { id }
    });
  }

  static async replayWebhook(deliveryId: string, platformUserId: string) {
    const delivery = await this.findDeliveryById(deliveryId);
    if (!delivery) {
      throw new Error('Webhook delivery not found');
    }

    trackReplay(delivery.provider);
    webhookReplayCounter.inc({ provider: delivery.provider });

    // Idempotent no-op: already processed is treated as success
    if (delivery.status === 'processed') {
      await AuditService.log({
        platformUserId,
        action: 'webhook.replay_skipped',
        resource: 'webhook_delivery',
        resourceId: deliveryId,
        changes: { provider: delivery.provider, eventId: delivery.eventId, reason: 'already_processed' }
      });
      return { success: true };
    }

    try {
      // Find the original webhook event
      const webhookEvent = await prisma.webhookEvent.findUnique({
        where: { 
          provider_eventId: { 
            provider: delivery.provider, 
            eventId: delivery.eventId 
          }
        }
      });

      if (!webhookEvent) {
        throw new Error('Original webhook event not found');
      }

      // Use stored payload for replay
      const payload = typeof webhookEvent.payload === 'string'
        ? webhookEvent.payload
        : JSON.stringify(webhookEvent.payload);

      // Replay through subscription service
      await SubscriptionService.processWebhook(delivery.provider, payload);

      // Update delivery status
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'processed',
          processedAt: new Date(),
          error: null
        }
      });

      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_REPLAYED, {
        provider: delivery.provider,
        eventId: delivery.eventId,
        platformUserId,
      });

      await AuditService.log({
        platformUserId,
        action: 'webhook.replayed',
        resource: 'webhook_delivery',
        resourceId: deliveryId,
        changes: { provider: delivery.provider, eventId: delivery.eventId }
      });

      return { success: true };
    } catch (error) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          error: (error as Error).message
        }
      });

      PlatformEventBus.publish(PLATFORM_EVENTS.WEBHOOK_REPLAYED, {
        provider: delivery?.provider,
        eventId: delivery.eventId,
        platformUserId,
        error: (error as Error).message,
      });
      trackFailure(delivery?.provider || 'unknown');

      throw error;
    }
  }

  static async getWebhookStats(timeframe: 'hour' | 'day' | 'week' = 'day') {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [total, processed, failed, pending] = await Promise.all([
      prisma.webhookDelivery.count({
        where: { receivedAt: { gte: startDate } }
      }),
      prisma.webhookDelivery.count({
        where: { 
          receivedAt: { gte: startDate },
          status: 'processed'
        }
      }),
      prisma.webhookDelivery.count({
        where: { 
          receivedAt: { gte: startDate },
          status: 'failed'
        }
      }),
      prisma.webhookDelivery.count({
        where: { 
          receivedAt: { gte: startDate },
          status: { in: ['received', 'pending'] }
        }
      })
    ]);

    return {
      timeframe,
      total,
      processed,
      failed,
      pending,
      successRate: total > 0 ? (processed / total) * 100 : 0
    };
  }
}