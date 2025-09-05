import { PaymentDbService } from '../services/paymentDbService'
import { TenantService } from '../services/tenantService'
import { PlatformIdempotencyService } from '../services/platformIdempotencyService'
import { TenantRequest } from './tenantMiddleware'
import { NextFunction, Request, Response } from 'express'
import { logger } from '../utils/logger';

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  // Only apply idempotency to write-ish operations; GETs are naturally idempotent.
  if (!key || req.method === 'GET') return next();

  // Guardrails: health & pre-tenant endpoints should skip idempotency entirely.
  if (req.path === '/api/health' || req.path.startsWith('/api/payments/webhooks')) {
    return next();
  }

  // Ensure we have a tenant. Prefer the one set by resolveTenant/bindRouterTenantContext.
  let tenant = (req as TenantRequest).tenant || (res.locals?.tenant);
  if (!tenant) {
    try {
      tenant = await TenantService.fromOriginOrApiKey(req);
    } catch {
      // Dev/Test convenience for /api/auth when Origin/API key is not present.
      const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
      const isAuth = req.path.startsWith('/api/auth');
      if (isDevOrTest && isAuth && !req.headers['x-api-key'] && !req.headers.origin) {
        const devTenantId = process.env.DEV_TENANT_ID;
        tenant = devTenantId
          ? await TenantService.getTenantById(devTenantId)
          : await TenantService.getOrCreateDefaultTenant();
      }
    }
  }

  if (!tenant) {
    const existing = await PlatformIdempotencyService.findKey(key);
    if (existing) {
      res.status(existing.status).json(existing.response);
      return;
    }

    const chunks: Buffer[] = []
    const originalWrite = res.write.bind(res)
    const originalEnd   = res.end.bind(res)

    res.write = (chunk: any, ...args: any[]) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return originalWrite(chunk, ...args)
    }
    res.end = (chunk?: any, ...args: any[]) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      return originalEnd(chunk, ...args)
    }

    res.on('finish', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      let parsedBody: any = rawBody
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {}

      PlatformIdempotencyService
        .createKey({
          key,
          method:   req.method,
          endpoint: req.originalUrl,
          status:   res.statusCode,
          response: parsedBody,
        })
        .catch((err: any) => {
          logger.error('Failed to save platform idempotency record:', err)
        })
    })

    next()
    return
  }

  // Check for an existing idempotent response *within* the tenant context.
  const existing = await TenantService.withTenantContext(tenant, async () => {
    return PaymentDbService.findIdempotencyKey(key!);
  });
  if (existing) {
    res.status(existing.status).json(existing.response);
    return;
  }

  const chunks: Buffer[] = []
  const originalWrite = res.write.bind(res)
  const originalEnd   = res.end.bind(res)

  res.write = (chunk: any, ...args: any[]) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return originalWrite(chunk, ...args)
  }
  res.end = (chunk?: any, ...args: any[]) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return originalEnd(chunk, ...args)
  }

  res.on('finish', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8')
    let parsedBody: any = rawBody
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {}

    TenantService
      .withTenantContext(tenant!, async () => {
        await PaymentDbService.createIdempotencyKey({
          key,
          method:   req.method,
          endpoint: req.originalUrl,
          status:   res.statusCode,
          response: parsedBody,
        });
      })
      .catch((err: any) => {
        // Non-fatal: do not disrupt the response if idempotency persistence fails.
        logger.error('Failed to save idempotency record:', err);
      });
  });

  next();
}