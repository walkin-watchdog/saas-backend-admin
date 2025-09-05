import { PrismaClient, Prisma } from '@prisma/client';
import { withTenantContext } from '../middleware/tenantMiddleware';
import { logger } from '../utils/logger';

let unleash: any;
let unleashClient: any | null;

function getClient() {
  if (!process.env.UNLEASH_URL) {
    return null;
  }
  if (!unleashClient) {
    try {
      unleash = require('unleash-client');
      unleashClient = unleash.initialize({
        url: process.env.UNLEASH_URL,
        appName: 'saas-backend',
        environment: process.env.NODE_ENV || 'development',
      });
    } catch {
      logger.warn('Unleash not configured; defaulting feature flags to ALLOW');
      unleashClient = null;
    }
  }
  return unleashClient;
}

export class FeatureFlagService {
  static async isEnabled(feature: string, tenantId: string): Promise<boolean> {
    return withTenantContext(
      { id: tenantId } as any,
      async (tenantPrisma: PrismaClient | Prisma.TransactionClient) => {
        const sub = await tenantPrisma.subscription.findFirst({
          where: { tenantId, status: { in: ['active', 'trialing', 'past_due'] } },
        });
        const client = getClient();
        if (!client) {
          return true;
        }
        const ctx = { properties: { planId: sub?.planId } } as any;
        try {
          return client.isEnabled(feature, ctx);
        } catch (e) {
          logger.warn('Unleash check failed; defaulting to ALLOW', { feature, tenantId });
          return true;
        }
      },
    );
  }
}