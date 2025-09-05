import { EmailService } from '../services/emailService';
import { HubSpotService } from '../services/hubspotService';
import { logger } from '../utils/logger';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';
import { AbandonedCartService } from '../services/abandonedCartService';
import { ProductService } from '../services/productService';
import { TenantService } from '../services/tenantService';
import { TenantConfigService } from '../services/tenantConfigService';
import { jobQueueDepth, jobDuration, hashTenantId } from '../utils/metrics';

const LOCK_NAMESPACE  = 42;
const PROCESS_LOCK_ID = 1;
const FIRST_TOUCH_LOCK_ID = 2;
const DEBOUNCE_MINUTES = 2;

export class AbandonedCartJob {
  static async processDebouncedCarts() {
    const prisma = getTenantPrisma();
    const gotLock = await prisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
        SELECT pg_try_advisory_lock(CAST(${LOCK_NAMESPACE} AS INT), CAST(${FIRST_TOUCH_LOCK_ID} AS INT))`;
    if (!gotLock[0]?.pg_try_advisory_lock) {
      logger.info('Another worker owns the first-touch lock - skipping.');
      return;
    }
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - DEBOUNCE_MINUTES * 60_000);

      const candidates = await AbandonedCartService.findManyAbandonedCarts({
        where: {
          adminNotifiedAt: null,
          updatedAt: { lte: cutoff },
        },
        orderBy: { updatedAt: 'asc' },
      });

      const tenantHash = hashTenantId(getTenantId());
      jobQueueDepth.set({ job: 'abandoned_cart_first_touch', tenant: tenantHash }, candidates.length);
      const t0 = Date.now();

      if (candidates.length) {
        logger.info(`First-touch: processing ${candidates.length} abandoned carts (debounced ≥ ${DEBOUNCE_MINUTES}m)`);
      }

      for (const cart of candidates) {
        try {
          await TenantService.withTenantContext({ id: cart.tenantId } as any, async () => {

            const product = await ProductService.findProduct(
              { id: cart.productId },
              { select: { id: true, title: true } }
            );
            if (!product) {
              return;
            }

            await EmailService.sendNewAbandonedCartNotification(cart);

            await AbandonedCartService.updateAbandonedCart(cart.id, {
                adminNotifiedAt: new Date(),
                updatedAt: new Date(),
            });

            try {
              const hsCfg = await TenantConfigService.getConfig<{ defaultOwnerId?: string }>(cart.tenantId, 'hubspot');
              const ownerId = hsCfg?.defaultOwnerId || process.env.HUBSPOT_DEFAULT_OWNER_ID || undefined;
              const cust = (cart.customerData as any) || {};
              const email = cust.customerEmail || cart.email;
              const name  = cust.customerName;
              const phone = cust.customerPhone;

              const existed = !!(await HubSpotService.getContactByEmail(email));
              const contact = await HubSpotService.ensureContact({ email, name, phone, ownerId });

              const productTitle = product?.title ?? cart.productId;
              const dealName = `Abandoned cart – ${productTitle}`;
              await HubSpotService.createDealForContact({
                contactId: contact.id,
                dealName,
                stageLabel: 'Lead',
                ownerId,
                dealType: existed ? 'existingbusiness' : 'newbusiness',
                priorityLabel: 'HIGH',
                amount: Number(cust?.totalAmount ?? 0) || undefined,
                properties: {
                  customerData: cart.customerData,
                  totalAmount: cust?.totalAmount,
                  currency: cart.currency
                }
              });
            } catch (e) {
              logger.warn('HubSpot sync (first touch) failed', { error: (e as Error).message, cartId: cart.id });
            }
          });
        } catch (error) {
          logger.error(`First-touch error for cart ${cart.id}:`, error);
        }
        jobDuration.observe({ job: 'abandoned_cart_first_touch', tenant: tenantHash }, Date.now() - t0);
      }
    } catch (error) {
      logger.error('Error in first-touch job:', error);
    } finally {
      await prisma.$executeRaw`SELECT pg_advisory_unlock(CAST(${LOCK_NAMESPACE} AS INT), CAST(${FIRST_TOUCH_LOCK_ID} AS INT))`;
    }
  }

  static async processAbandonedCarts() {
    const prisma = getTenantPrisma();
    const gotLock = await prisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
        SELECT pg_try_advisory_lock(CAST(${LOCK_NAMESPACE} AS INT), CAST(${PROCESS_LOCK_ID} AS INT))`;
    if (!gotLock[0]?.pg_try_advisory_lock) {
      logger.info('Another worker owns the abandoned-cart lock – skipping.');
      return;
    }

    try {
      const now = new Date();
      const cutoff1 = new Date(now.getTime() - 2  * 60 * 60 * 1000);  // 2h
      const cutoff2 = new Date(now.getTime() - 24 * 60 * 60 * 1000);  // 24h
      const cutoff3 = new Date(now.getTime() - 72 * 60 * 60 * 1000);  // 72h

      const abandonedCarts = await AbandonedCartService.findManyAbandonedCarts({
        where: {
          adminNotifiedAt: { not: null },
          remindersSent: { lt: 3 },
          OR: [
            {
              AND: [
                { remindersSent: 0 },
                { adminNotifiedAt: { lte: cutoff1 } }
              ]
            },
            {
              AND: [
                { remindersSent: 1 },
                { adminNotifiedAt: { lte: cutoff2 } }
              ]
            },
            {
              AND: [
                { remindersSent: 2 },
                { adminNotifiedAt: { lte: cutoff3 } }
              ]
            }
          ]
        },
        orderBy: { adminNotifiedAt: 'asc' }
      });

      const tenantHash = hashTenantId(getTenantId());
      jobQueueDepth.set({ job: 'abandoned_cart_follow_up', tenant: tenantHash }, abandonedCarts.length);
      const t0 = Date.now();
      logger.info(`Follow-ups: found ${abandonedCarts.length} carts due for reminder (relative to adminNotifiedAt)`);

      for (const cart of abandonedCarts) {
        try {
          const product = await ProductService.findProduct({ id: cart.productId });

          if (product) {
            await TenantService.withTenantContext({ id: cart.tenantId } as any, async () => {
              await EmailService.sendAbandonedCartReminder(cart, product);
            });
            
            await AbandonedCartService.updateAbandonedCart(cart.id, {
                remindersSent: cart.remindersSent + 1,
                updatedAt: new Date(),
            });

            logger.info(`Sent abandoned cart reminder #${cart.remindersSent + 1} for cart ${cart.id}`);
          }
        } catch (error) {
          logger.error(`Error processing abandoned cart ${cart.id}:`, error);
        }
      }
      jobDuration.observe({ job: 'abandoned_cart_follow_up', tenant: tenantHash }, Date.now() - t0);
    } catch (error) {
      logger.error('Error processing abandoned carts:', error);
    } finally {
      await prisma.$executeRaw`SELECT pg_advisory_unlock(CAST(${LOCK_NAMESPACE} AS INT), CAST(${PROCESS_LOCK_ID} AS INT))`;
    }
  }

  static async cleanupOldCarts() {
    try {
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - 30);

      const result = await AbandonedCartService.deleteManyAbandonedCarts({
        where: {
          createdAt: {
            lte: cutoffTime,
          },
        },
      });

      logger.info(`Cleaned up ${result.count} old abandoned carts`);
    } catch (error) {
      logger.error('Error cleaning up old abandoned carts:', error);
    }
  }
}