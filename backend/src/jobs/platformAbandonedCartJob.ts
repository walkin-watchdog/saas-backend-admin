import { EmailService } from '../services/emailService';
import { logger } from '../utils/logger';
import { prisma } from '../utils/prisma';
import { PlatformConfigService } from '../services/platformConfigService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';
import { hashToken } from '../utils/tokenHash';
import crypto from 'crypto';

export class PlatformAbandonedCartJob {
  /**
   * Process abandoned platform signup carts and send recovery emails
   */
  static async processAbandonedCarts() {
    try {
      const now = new Date();
      
      // Get carts that need reminders based on different cadences
      const cutoff1Hour = new Date(now.getTime() - 60 * 60 * 1000);        // 1 hour
      const cutoff24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);  // 24 hours
      const cutoff72Hours = new Date(now.getTime() - 72 * 60 * 60 * 1000);  // 72 hours

      const abandonedCarts = await prisma.platformAbandonedCart.findMany({
        where: {
          status: 'open',
          email: { not: null },
          OR: [
            // First reminder: 1 hour after last activity, no reminders sent
            {
              AND: [
                { reminderCount: 0 },
                { lastSeenAt: { lte: cutoff1Hour } }
              ]
            },
            // Second reminder: 24 hours after last activity, 1 reminder sent
            {
              AND: [
                { reminderCount: 1 },
                { lastSeenAt: { lte: cutoff24Hours } }
              ]
            },
            // Final reminder: 72 hours after last activity, 2 reminders sent
            {
              AND: [
                { reminderCount: 2 },
                { lastSeenAt: { lte: cutoff72Hours } }
              ]
            }
          ]
        },
        orderBy: { lastSeenAt: 'asc' }
      });

      logger.info(`Processing ${abandonedCarts.length} platform abandoned carts`);

      for (const cart of abandonedCarts) {
        try {
          if (!cart.email) continue;

          // Generate recovery token
          const recoveryToken = crypto.randomBytes(32).toString('hex');
          const recoveryUrl = `${process.env.FRONTEND_URL}/signup?recovery=${recoveryToken}&sessionId=${cart.sessionId}`;

          // Store recovery token in config temporarily
          const tokenHash = hashToken(recoveryToken);
          await PlatformConfigService.setConfig(
            `cart_recovery_${tokenHash}`,
            { sessionId: cart.sessionId },
            undefined,
            { scope: 'platform', encrypt: true, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
          );

          // Send recovery email based on reminder count
          let subject: string;
          let template: string;
          
          switch (cart.reminderCount) {
            case 0:
              subject = 'Complete your signup - Get started today!';
              template = 'platform-cart-reminder-1';
              break;
            case 1:
              subject = 'Still interested? Complete your signup';
              template = 'platform-cart-reminder-2';
              break;
            case 2:
              subject = 'Last chance - Complete your signup';
              template = 'platform-cart-reminder-3';
              break;
            default:
              continue; // Skip if too many reminders sent
          }

          // Since we're in platform context, we'll use basic email sending
          // In a real implementation, you'd want platform-scoped email templates
          try {
            await EmailService.sendEmail({
              to: cart.email,
              subject,
              template,
              tenantId: 'platform',
              context: {
                tenantId: 'platform', // template context
                email: cart.email,
                recoveryUrl,
                planId: cart.planId,
                reminderNumber: cart.reminderCount + 1,
                brandingScope: 'platform'
              }
            });
          } catch (emailError) {
            logger.warn('Failed to send platform cart recovery email', {
              cartId: cart.id,
              email: cart.email,
              error: (emailError as Error).message
            });
          }

          // Update reminder count
          await prisma.platformAbandonedCart.update({
            where: { id: cart.id },
            data: {
              reminderCount: { increment: 1 },
              lastSeenAt: new Date()
            }
          });

          logger.info(`Sent platform cart reminder #${cart.reminderCount + 1} for cart ${cart.id}`);
          PlatformEventBus.publish(PLATFORM_EVENTS.CART_REMINDER_SENT, {
            cartId: cart.id,
            email: cart.email,
            reminderNumber: cart.reminderCount + 1,
          });
        } catch (error) {
          logger.error(`Error processing platform abandoned cart ${cart.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in platform abandoned cart job:', error);
    }
  }

  /**
   * Clean up old abandoned carts
   */
  static async cleanupOldCarts() {
    try {
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - 90); // 90 days

      const result = await prisma.platformAbandonedCart.deleteMany({
        where: {
          OR: [
            { status: 'discarded' },
            { 
              AND: [
                { status: 'open' },
                { lastSeenAt: { lte: cutoffTime } }
              ]
            }
          ]
        }
      });

      logger.info(`Cleaned up ${result.count} old platform abandoned carts`);
    } catch (error) {
      logger.error('Error cleaning up platform abandoned carts:', error);
    }
  }
}