import dotenv from 'dotenv';
dotenv.config();

import { CronJob } from 'cron';
import { logger } from './utils/logger';
import { AbandonedCartJob } from './jobs/abandonedCartJob';
import { TenantService } from './services/tenantService';
import { prisma, disconnectAllPrisma } from './utils/prisma';
import { KeyRotationJob } from './jobs/rotateKeysJob';
import { SubscriptionDunningJob } from './jobs/subscriptionDunningJob';
import { PlatformAbandonedCartJob } from './jobs/platformAbandonedCartJob';
import { TokenCleanupJob } from './jobs/tokenCleanupJob';
import { OffboardTenantJob } from './jobs/offboardTenantJob';
import { TenantPreflightSweepJob } from './jobs/tenantPreflightSweepJob';
import { TenantRlsAuditJob } from './jobs/tenantRlsAuditJob';
import { TenantCacheWarmJob } from './jobs/tenantCacheWarmJob';
import './listeners/dunningNotice';
import './listeners/tenantDatasourceChanged';

// Get all active tenants
async function getActiveTenants() {
  return prisma.tenant.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
      status: true,
      dedicated: true,
      datasourceUrl: true,
      dbName: true,
    }
  });
}

// Execute job for all tenants
async function executeForAllTenants(jobName: string, jobFn: () => Promise<void>) {
  const tenants = await getActiveTenants();
  
  for (const tenant of tenants) {
    try {
      await TenantService.withTenantContext(tenant, async () => {
        await jobFn();
      });
    } catch (error) {
      logger.error(`Job ${jobName} failed for tenant ${tenant.id}:`, error);
    }
  }
}
// Schedule jobs
const abandonedCartJob = new CronJob(
  '0 */2 * * *',
  () => executeForAllTenants('abandonedCart', AbandonedCartJob.processAbandonedCarts),
  null,
  true,
  'Asia/Kolkata'
);

const cleanupJob = new CronJob(
  '0 0 * * 0',
  () => executeForAllTenants('cleanupCarts', AbandonedCartJob.cleanupOldCarts),
  null,
  true,
  'Asia/Kolkata'
);

const firstTouchJob = new CronJob(
  '*/1 * * * *',
  () => executeForAllTenants('debouncedCarts', AbandonedCartJob.processDebouncedCarts),
  null,
  true,
  'Asia/Kolkata'
);

const subscriptionDunningJob = new CronJob(
  '0 * * * *',
  () => SubscriptionDunningJob.process(),
  null,
  true,
  'Asia/Kolkata'
);

// Platform abandoned cart job (every 2 hours)
const platformAbandonedCartJob = new CronJob(
  '0 */2 * * *',
  () => PlatformAbandonedCartJob.processAbandonedCarts(),
  null,
  true,
  'Asia/Kolkata'
);

// Platform cart cleanup job (weekly)
const platformMaintenanceJob = new CronJob(
  '0 2 * * 0',
  () => TokenCleanupJob.runPlatformMaintenance(),
  null,
  true,
  'Asia/Kolkata'
);

// Tenant offboarding job (daily)
const offboardTenantJob = new CronJob(
  '0 3 * * *',
  () => OffboardTenantJob.processOffboarding(),
  null,
  true,
  'Asia/Kolkata'
);

// Offboarding cleanup job (weekly)
const offboardingCleanupJob = new CronJob(
  '0 4 * * 0',
  () => OffboardTenantJob.cleanupCompleted(),
  null,
  true,
  'Asia/Kolkata'
);

logger.info('Worker online - cron jobs initialised (first-touch: 1m, follow-ups: 2h, cleanup: weekly, dunning: hourly)');
logger.info('Platform jobs initialised (abandoned carts: 2h, maintenance: weekly, offboarding: daily, offboard cleanup: weekly)');

// ──────────────────────────────────────────────────────────────────────────────
// Encryption Key Rotation (centralised here in the worker)
//   - Daily self-test to ensure encryption works
//   - Weekly rotation of secrets in TenantConfig (per-tenant, transactional)
//   - Weekly cleanup of expired/legacy keys (env var holders)
// Opt-out by setting KEY_ROTATION_ENABLED=false
// ──────────────────────────────────────────────────────────────────────────────
const keyRotationEnabled = process.env.KEY_ROTATION_ENABLED !== 'false';

let encryptionSelfTestDaily: CronJob | undefined;
let keyRotationWeeklyJob: CronJob | undefined;
let keyCleanupWeeklyJob: CronJob | undefined;

if (keyRotationEnabled) {
  // 02:15 IST daily – quick encryption/decryption self-test, logs error on failure
  encryptionSelfTestDaily = new CronJob(
    '15 2 * * *',
    async () => {
      const ok = await KeyRotationJob.validateEncryption();
      if (!ok) logger.error('Encryption self-test failed – check ENCRYPTION_KEY/KMS config');
    },
    null,
    true,
    'Asia/Kolkata'
  );

  // 05:00 IST every Monday – rotate all tenant secrets to a new key
  keyRotationWeeklyJob = new CronJob(
    '0 5 * * 1',
    async () => {
      try {
        await KeyRotationJob.rotateEncryptionKeys();
      } catch (err) {
        logger.error('Weekly key rotation failed', { err });
      }
    },
    null,
    true,
    'Asia/Kolkata'
  );

  // 06:00 IST every Monday – prune expired/legacy keys from env holders
  keyCleanupWeeklyJob = new CronJob(
    '0 6 * * 1',
    async () => {
      await KeyRotationJob.cleanupExpiredKeys();
    },
    null,
    true,
    'Asia/Kolkata'
  );

  logger.info('Key rotation cron jobs initialised (self-test: 02:15 daily, rotate: Mon 05:00, cleanup: Mon 06:00)');
} else {
  logger.info('Key rotation disabled by env (KEY_ROTATION_ENABLED=false)');
}

const preflightSweep = new CronJob('*/5 * * * *', () => TenantPreflightSweepJob.run(), null, true, 'Asia/Kolkata');
const rlsAuditWeekly = new CronJob('0 1 * * 1', () => TenantRlsAuditJob.run(), null, true, 'Asia/Kolkata');
const cacheWarmHourly = new CronJob('0 * * * *', () => TenantCacheWarmJob.run(), null, true, 'Asia/Kolkata');


// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM → stopping cron jobs');
  firstTouchJob.stop();
  subscriptionDunningJob.stop();
  abandonedCartJob.stop();
  cleanupJob.stop();
  platformAbandonedCartJob.stop();
  platformMaintenanceJob.stop();
  offboardTenantJob.stop();
  offboardingCleanupJob.stop();
  encryptionSelfTestDaily?.stop();
  keyRotationWeeklyJob?.stop();
  keyCleanupWeeklyJob?.stop();
  preflightSweep.stop();
  rlsAuditWeekly.stop();
  cacheWarmHourly.stop();
  await disconnectAllPrisma();
  process.exit(0);
});