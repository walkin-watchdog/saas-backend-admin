import { logger } from './logger';
import { TenantConfigKey } from '../types/tenantConfig';
import crypto from 'crypto';

// Simple in-memory cache implementation since Redis is not available in WebContainer
class InMemoryCache {
  private cache = new Map<string, any>();
  private ttl = new Map<string, number>();
  private readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour

  set(key: string, value: any, ttlMs?: number): void {
    this.cache.set(key, value);
    if (ttlMs) {
      this.ttl.set(key, Date.now() + ttlMs);
    }
  }

  get(key: string): any | null {
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    return this.cache.has(key) ? this.cache.get(key) : null;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.ttl.clear();
  }

  has(key: string): boolean {
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
      return false;
    }
    return this.cache.has(key);
  }
}

export class CacheService {
  private static instance: InMemoryCache = new InMemoryCache();
  private static eventHandlers = new Map<string, Function[]>();
  private static redisPub: any | null = null;
  private static redisSub: any | null = null;
  private static redisReady = false;
  private static connectedUrl: string | null = null;
  private static sourceId = crypto.randomBytes(8).toString('hex');

  static getSourceId() { return this.sourceId; }

  // Initialize optional Redis if REDIS_URL is set
  private static async ensureRedis() {
    function isTrue(v?: string) {
      if (!v) return false;
      const s = v.toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    }
    
    // In tests, only use Redis if explicitly enabled
    if (process.env.NODE_ENV === 'test' && !isTrue(process.env.CACHE_TEST_USE_REDIS)) return;

    const url = process.env.REDIS_URL;
    if (!url) return;

    // Already connected to same URL → nothing to do
    if (this.redisReady && this.connectedUrl === url) return;
    // URL changed (or state stale) → tear down and reconnect
    if (this.redisReady && this.connectedUrl !== url) {
      try { await this.shutdown(); } catch {}
    }

    try {
      // dynamic import to avoid build-time dep in tests
      const { createClient } = await import('redis');
      const testSocket =
        process.env.NODE_ENV === 'test'
          ? { socket: { connectTimeout: 100, reconnectStrategy: () => new Error('no-retry-tests') } }
          : {};
      this.redisPub = createClient({ url, ...testSocket });
      this.redisSub = createClient({ url, ...testSocket });
      this.redisPub.on('error', (e: any) => logger.error('Redis pub error', { e }));
      this.redisSub.on('error', (e: any) => logger.error('Redis sub error', { e }));
      await this.redisPub.connect();
      await this.redisSub.connect();
      await this.redisSub.pSubscribe('tenant:*:config-updated', (message: string, channel: string) => {
        try {
          const data = JSON.parse(message);
          // Ignore our own published messages to avoid self-eviction
          if (data?.sourceId && data.sourceId === this.sourceId) {
            return;
          }
          // Invalidate locally to keep instances consistent
          if (data?.tenantId && data?.key) {
            const cacheKey = `tenant:${data.tenantId}:config:${data.key}`;
            this.instance.delete(cacheKey);
            this.emit(channel, data);
          }
        } catch (err) {
          logger.error('Redis message parse error', { channel, err });
        }
      });
      this.redisReady = true;
      this.connectedUrl = url;
      logger.info('CacheService: Redis connected for pub/sub');
    } catch (err) {
      this.redisReady = false;
      this.connectedUrl = null;
      logger.warn('CacheService: Redis unavailable, using in-memory only', { error: (err as any)?.message });
    }
  }

  /**
   * Set a tenant config in the local cache.
   * Set `opts.broadcast=true` only when the underlying data changed (create/update/delete),
   * not when you are merely filling the cache after a read or warm-up.
   */
  static setTenantConfig(tenantId: string, key: TenantConfigKey, value: any, opts?: { broadcast?: boolean }): void {
    try {
      const cacheKey = `tenant:${tenantId}:config:${key}`;
      this.instance.set(cacheKey, value);
      
      this.ensureRedis().catch(() => {});
      // Emit config updated locally
      const evt = { tenantId, key, value: null, sourceId: this.sourceId };
      if (opts?.broadcast) {
        // Self-evict writer to guarantee no stale reads on the updating instance
        this.instance.delete(cacheKey);
        // Broadcast only if Redis is ready (prevents cross-instance eviction in no-Redis mode)
        this.emit(`tenant:${tenantId}:config-updated`, evt);
        // Broadcast cross-instance only if Redis is enabled/ready
        this.ensureRedis()
          .then(() => {
            if (this.redisReady) {
              this.redisPub
                .publish(`tenant:${tenantId}:config-updated`, JSON.stringify(evt))
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch (error) {
      logger.error('Cache set failed', { tenantId, key, error });
    }
  }

  static getTenantConfig(tenantId: string, key: TenantConfigKey): any | null {
    try {
      const cacheKey = `tenant:${tenantId}:config:${key}`;
      return this.instance.get(cacheKey);
    } catch (error) {
      logger.error('Cache get failed', { tenantId, key, error });
      return null;
    }
  }

  static deleteTenantConfig(tenantId: string, key: TenantConfigKey): void {
    try {
      const cacheKey = `tenant:${tenantId}:config:${key}`;
      this.instance.delete(cacheKey);
      
      // Emit locally; then publish if Redis is available
      const evt = { tenantId, key, value: null, sourceId: this.sourceId };
      this.emit(`tenant:${tenantId}:config-updated`, evt);
      this.ensureRedis()
        .then(() => {
          if (this.redisReady) {
            this.redisPub
              .publish(`tenant:${tenantId}:config-updated`, JSON.stringify(evt))
              .catch(() => {});
          }
        })
        .catch(() => {});
    } catch (error) {
      logger.error('Cache delete failed', { tenantId, key, error });
    }
  }

  static clearTenantConfigs(tenantId: string): void {
    try {
      // Clear all configs for a tenant
      const keys = Array.from((this.instance as any).cache.keys()) as string[];
      const tenantKeys = keys.filter((key: string) =>
        key.startsWith(`tenant:${tenantId}:config:`)
      );
      
      tenantKeys.forEach(key => this.instance.delete(key));
      
      // Emit tenant configs cleared event
      this.emit(`tenant:${tenantId}:configs-cleared`, { tenantId });
    } catch (error) {
      logger.error('Cache clear failed', { tenantId, error });
    }
  }

  // Event system for cache invalidation
  static on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    // lazy connect to Redis when someone subscribes to tenant:* events
    if (event.startsWith('tenant:') || event.includes('*')) {
      this.ensureRedis().catch(()=>{});
    }
  }

  static emit(event: string, data: any): void {
    // Get exact event handlers
    const exactHandlers = this.eventHandlers.get(event) || [];
    
    // Get wildcard handlers
    const wildcardHandlers: Function[] = [];
    for (const [pattern, handlers] of this.eventHandlers.entries()) {
      if (pattern.includes('*')) {
        const regexPattern = pattern.replace(/\*/g, '[^:]+');
        const regex = new RegExp(`^${regexPattern}$`);
        if (regex.test(event)) {
          wildcardHandlers.push(...handlers);
        }
      }
    }
    
    // Execute all matching handlers
    const allHandlers = [...exactHandlers, ...wildcardHandlers];
    allHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error('Cache event handler failed', { event, error });
      }
    });
  }

  // General cache methods
  static set(key: string, value: any, ttlMs?: number): void {
    try {
      this.instance.set(key, value, ttlMs);
    } catch (error) {
      logger.error('Cache set failed', { key, error });
    }
  }

  static get(key: string): any | null {
    try {
      return this.instance.get(key);
    } catch (error) {
      logger.error('Cache get failed', { key, error });
      return null;
    }
  }

  static delete(key: string): void {
    try {
      this.instance.delete(key);
    } catch (error) {
      logger.error('Cache delete failed', { key, error });
    }
  }

  static clear(): void {
    try {
      this.instance.clear();
    } catch (error) {
      logger.error('Cache clear failed', { error });
    }
  }

  // Health check for cache
  static async healthCheck(): Promise<boolean> {
    try {
      const testKey = `health:${Date.now()}`;
      const testValue = 'test';
      
      this.set(testKey, testValue);
      const retrieved = this.get(testKey);
      this.delete(testKey);
      
      return retrieved === testValue;
    } catch (error) {
      logger.error('Cache health check failed', { error });
      return false;
    }
  }

  static async shutdown(): Promise<void> {
    try {
      if (this.redisSub) { await this.redisSub.quit(); }
    } catch {}
    try {
      if (this.redisPub) { await this.redisPub.quit(); }
    } catch {}
    this.redisSub = null;
    this.redisPub = null;
    this.redisReady = false;
    this.connectedUrl = null;
  }
}