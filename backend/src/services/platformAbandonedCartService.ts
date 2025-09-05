import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AuditService } from './auditService';
import { EmailService } from './emailService';
import crypto from 'crypto';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';
import { PlatformConfigService } from './platformConfigService';
import { hashToken } from '../utils/tokenHash';

type HttpError = Error & { status?: number };
const httpError = (status: number, message: string): HttpError => {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
};

export class PlatformAbandonedCartService {
  static async findCarts(filters: {
    status?: 'open' | 'recovered' | 'discarded';
    email?: string;
    planId?: string;
    limit?: number;
    offset?: number;
    seenSince?: Date;
    seenBefore?: Date;
  } = {}) {
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };
    if (filters.planId) where.planId = filters.planId;
    if (filters.seenSince || filters.seenBefore) {
      where.lastSeenAt = {};
      if (filters.seenSince) where.lastSeenAt.gte = filters.seenSince;
      if (filters.seenBefore) where.lastSeenAt.lte = filters.seenBefore;
    }

    return prisma.platformAbandonedCart.findMany({
      where,
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { lastSeenAt: 'desc' }
    });
  }

  static async findCartById(id: string) {
    return prisma.platformAbandonedCart.findUnique({
      where: { id }
    });
  }

  static async sendRecoveryLink(cartId: string, platformUserId: string) {
    const cart = await this.findCartById(cartId);
    if (!cart) throw httpError(404, 'Abandoned cart not found');
    if (!cart.email) throw httpError(400, 'Cart email missing');

    if (cart.status !== 'open') {
      if (cart.status === 'recovered') throw httpError(409, 'Cart already recovered');
      if (cart.status === 'discarded') throw httpError(410, 'Cart is discarded');
      throw httpError(400, 'Cart is not in open status');
    }

    // Generate recovery token
    const recoveryToken = crypto.randomBytes(32).toString('hex');
    const recoveryUrl = `${process.env.FRONTEND_URL}/signup?recovery=${recoveryToken}&sessionId=${cart.sessionId}`;

    // Persist token with 24h expiration
    const tokenHash = hashToken(recoveryToken);
    await PlatformConfigService.setConfig(
      `cart_recovery_${tokenHash}`,
      { sessionId: cart.sessionId },
      undefined,
      { scope: 'platform', encrypt: true, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
    );

    // Send recovery email using platform context
    await EmailService.sendEmail({
      to: cart.email,
      subject: 'Complete your signup',
      template: 'platform-abandoned-cart',
      tenantId: 'platform',
      context: {
        tenantId: 'platform',
        email: cart.email,
        recoveryUrl,
        planId: cart.planId,
        reminderNumber: cart.reminderCount + 1,
        brandingScope: 'platform',
        currency: cart.currency,
      }
    });

    await prisma.platformAbandonedCart.update({
      where: { id: cartId },
      data: { 
        reminderCount: { increment: 1 },
        lastSeenAt: new Date()
      }
    });

    await AuditService.log({
      platformUserId,
      action: 'abandoned_cart.recovery_sent',
      resource: 'abandoned_cart',
      resourceId: cartId,
      changes: { email: cart.email }
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.CART_REMINDER_SENT, {
      cartId,
      email: cart.email,
      currency: cart.currency,
    });

    return { recoveryUrl };
  }

  static async discardCart(cartId: string, platformUserId: string) {
    const cart = await prisma.platformAbandonedCart.update({
      where: { id: cartId },
      data: { status: 'discarded' }
    });

    await AuditService.log({
      platformUserId,
      action: 'abandoned_cart.discarded',
      resource: 'abandoned_cart',
      resourceId: cartId
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.CART_DISCARDED, { cartId, currency: cart.currency });

    return cart;
  }

  static async markRecovered(sessionId: string) {
    const cart = await prisma.platformAbandonedCart.update({
      where: { sessionId },
      data: {
        status: 'recovered',
        recoveredAt: new Date()
      }
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.CART_RECOVERED, { cartId: cart.id, sessionId, currency: cart.currency });
    return cart;
  }

  static async countCarts(filters: {
    status?: 'open' | 'recovered' | 'discarded';
  } = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;

    return prisma.platformAbandonedCart.count({ where });
  }
}