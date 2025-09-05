import express from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { verifyRefresh, verifyAccess } from '../utils/jwt';

export const rateLimitPayment = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  // Payments are sensitive: keep bursts low and key to tenant:user:IP.
  max: 10,
  message: 'Too many payment attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  keyGenerator: (req) => {
    const ip = realIp(req);
    const tid = (req as any).tenantId || 'unknown';
    const uid = (req as any).user?.id || 'anon';
    return `${tid}:${uid}:${ip}`;
  },
  handler: (req, res, _next, options) => {
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    // Expose ratelimit headers to browsers
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(options.statusCode).json({ message: 'Too many payment attempts' });
  },
});

export const rateLimitPaymentBurst = rateLimit({
  windowMs: 5 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  keyGenerator: (req) => {
    const ip = realIp(req);
    const tid = (req as any).tenantId || 'unknown';
    const uid = (req as any).user?.id || 'anon';
    return `${tid}:${uid}:${ip}`;
  },
});

// -- Refresh limiter: tight, route-specific; keys on tenantId:userId:ip (fallback to ip)
export const realIp = (req: express.Request) => {
  const h = req.headers;
  return (
    (h['x-nf-client-connection-ip'] as string) ||
    (h['x-real-ip'] as string) ||
    req.ip ||
    'unknown'
  );
};

// Normalized key: {tenantId|'public'}:route:ip
export const keyByTenantRouteIp = (req: express.Request) => {
  const ip = realIp(req);
  const tid = (req as any).tenantId || 'public';
  // Prefer normalized routePath from middleware to reduce cardinality
  const route =
    (req.res?.locals?.routePath as string | undefined) || `${req.baseUrl || ''}${req.path || ''}`;
  return `${tid}:${route}:${ip}`;
};

export const keyFromUserOrIp = (req: express.Request) => {
  const ip = realIp(req);
  const tid = (req as any).tenantId || 'unknown';
  const user = (req as any).user;
  if (user?.id) return `${tid}:${user.id}`;
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const t = auth.slice(7);
      const p = verifyAccess(t);
      return `${tid}:${p.sub}`;
    }
  } catch {
    // ignore and fall through
  }
  return `${tid}:${ip}`;
};

export const loginIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});

export const loginIdLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const tid = (req as any).tenantId || 'unknown';
    const email = (req.body?.email || '').trim().toLowerCase();
    return `${tid}:${email || 'unknown'}`;
  },
});

// Forgot-password throttles: per-IP (looser) + per-email (tight)
export const forgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});

export const forgotEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const tid = (req as any).tenantId || 'unknown';
    const email = (req.body?.email || '').trim().toLowerCase();
    return `${tid}:${email || 'unknown'}`;
  },
});

export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // at most 60 refreshes/min per key
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = realIp(req);
    const tid = (req as any).tenantId || 'unknown';
    // try to bind to userId if a valid refresh cookie is present
    try {
      const rt = (req as any).cookies?.rt;
      if (rt) {

        const p = verifyRefresh(rt);
        return `${tid}:${p.sub}:${ip}`;
      }
    } catch {
      // ignore parse errors; fall back to tenant/ip
    }
    return `${tid}:${ip}`;
  },
  handler: (req, res, _next, opts) => {
    logger.warn('auth.refresh_rate_limited', {
      tenantId: (req as any).tenantId,
      ip: realIp(req),
      path: req.originalUrl,
      windowMs: opts.windowMs,
      max: opts.max,
    });
    res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(opts.statusCode).json({ error: 'Too many refresh attempts' });
  },
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});

export const publicSensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});