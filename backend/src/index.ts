// backend/src/index.ts
import dotenv from 'dotenv';
dotenv.config();
import { app } from './app';
import { logger } from './utils/logger';
import { prisma, disconnectAllPrisma } from './utils/prisma';
import { TenantConfigService } from './services/tenantConfigService';
import { CacheService } from './utils/cache';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const displayHost = HOST === '0.0.0.0' ? 'localhost': HOST;
const IS_PROD = process.env.NODE_ENV === 'production';

// Initialize cache and warm up configs
async function initializeServices() {
  try {
    const cacheHealthy = await CacheService.healthCheck();
    if (cacheHealthy) {
      logger.info('Cache service initialized successfully');
    } else {
      // In production, Redis is required for cross-instance invalidation → fail fast
      if (IS_PROD) {
        logger.error('FATAL: Cache service health check failed in production (Redis required).');
        process.exit(1);
      }
      logger.warn('Cache service health check failed, continuing with database fallback (non-prod)');
    }
    
    // Warm up config cache for all tenants
    await TenantConfigService.warmUpCache();
    logger.info('Tenant config cache warmed up');
    
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    // Any init error is fatal in production
    if (IS_PROD) {
      logger.error('FATAL: Service initialization failed in production.');
      process.exit(1);
    }
    // Continue startup in non-production
  }
}

// In production, require REDIS_URL and initialize services BEFORE accepting traffic
function preflightOrExit() {
  if (IS_PROD && !process.env.REDIS_URL) {
    logger.error('FATAL: REDIS_URL is required in production for cross-instance cache invalidation.');
    process.exit(1);
  }
}

let server: import('http').Server;

async function start() {
  preflightOrExit();

  if (IS_PROD) {
    // Ensure cache + warmup are ready before we listen in production
    await initializeServices();
  }

  server = app.listen(PORT, HOST, () => {
    logger.info(`API ready → http://${displayHost}:${PORT}`);
    if (!IS_PROD) {
      // Initialize services after server starts (dev/test ergonomics)
      void initializeServices();
    }
  });
}

start().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received – draining connections');
  server.close(async () => {
    try { await CacheService.shutdown?.(); } catch {}
    await disconnectAllPrisma();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});