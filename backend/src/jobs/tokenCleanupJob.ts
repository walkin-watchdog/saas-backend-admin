import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { PlatformAbandonedCartJob } from './platformAbandonedCartJob';
import { PlatformSessionService } from '../services/platformSessionService';

export class TokenCleanupJob {
  static async cleanupExpiredTokens() {
    const now = new Date();
    try {
      const invoice = await prisma.globalConfig.deleteMany({
        where: {
          scope: 'global',
          key: { startsWith: 'invoice_access_' },
          expiresAt: { lt: now },
        },
      });
      const cart = await prisma.globalConfig.deleteMany({
        where: {
          scope: 'platform',
          key: { startsWith: 'cart_recovery_' },
          expiresAt: { lt: now },
        },
      });
      const pdf = await prisma.globalConfig.deleteMany({
        where: {
          scope: 'global',
          key: { startsWith: 'invoice_pdf_' },
          expiresAt: { lt: now },
        },
      });
      if (invoice.count || cart.count || pdf.count) {
        logger.info('Cleaned expired global tokens', { invoice: invoice.count, cart: cart.count, pdf: pdf.count });
      }
      const sessions = await PlatformSessionService.cleanupExpired();
      if (sessions.count) {
        logger.info('Cleaned expired platform sessions', { sessions: sessions.count });
      }
    } catch (err) {
      logger.error('Failed cleaning expired global tokens', { err });
    }
  }

  static async runPlatformMaintenance() {
    await this.cleanupExpiredTokens();
    await PlatformAbandonedCartJob.cleanupOldCarts();
  }
}