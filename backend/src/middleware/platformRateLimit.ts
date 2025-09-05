import rateLimit from 'express-rate-limit';
import { realIp } from './rateLimit';
import { verifyPlatformRefresh } from '../utils/platformJwt';
import { logger } from '../utils/logger';

// Platform admin rate limiters with stricter controls
export const platformLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for platform users
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = realIp(req);
    const platformUser = (req as any).platformUser;
    return platformUser ? `platform:${platformUser.id}:${ip}` : `platform:anon:${ip}`;
  },
  handler: (req, res, _next, options) => {
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(options.statusCode).json({ error: 'Too many platform requests' });
  },
});

// Sensitive platform operations (billing, offboarding, etc.)
export const platformSensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = realIp(req);
    const platformUser = (req as any).platformUser;
    return platformUser ? `platform:sensitive:${platformUser.id}:${ip}` : `platform:sensitive:anon:${ip}`;
  },
  handler: (req, res, _next, options) => {
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    return res.status(options.statusCode).json({ error: 'Too many sensitive platform operations' });
  },
});

// Platform authentication rate limiter
export const platformAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Stricter for auth
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: realIp,
  handler: (req, res, _next, options) => {
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    return res.status(options.statusCode).json({ error: 'Too many platform authentication attempts' });
  },
});

// Login-specific (IP + ID) parity with tenant
export const platformLoginIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: realIp,
});

export const platformLoginIdLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    return `platform:${email || 'unknown'}`;
  },
});

// Refresh limiter: tight and keys on userId when cookie present
export const platformRefreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = realIp(req);
    try {
      const rt = (req as any).cookies?.platform_rt;
      if (rt) {
        const p = verifyPlatformRefresh(rt);
        return `platform:${p.sub}:${ip}`;
      }
    } catch {
      // ignore parse errors; fall back to IP
    }
    return `platform:anon:${ip}`;
  },
  handler: (req, res, _next, opts) => {
    res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(opts.statusCode).json({ error: 'Too many refresh attempts' });
  },
});

// Light limiter for invite acceptance to reduce token brute force & abuse
export const platformInviteAcceptLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,                    // 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: realIp,
  handler: (req, res, _next, opts) => {
    logger.warn('platform.auth.invite_accept_rate_limited', {
      ip: realIp(req),
      path: (req as any).originalUrl,
      windowMs: opts.windowMs,
      max: opts.max,
    });
    res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(opts.statusCode).json({ error: 'Too many attempts' });
  },
});

// Limit rapid platform user creations to prevent abuse
export const platformUserCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 creations per IP+user per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = realIp(req);
    const platformUser = (req as any).platformUser;
    return platformUser
      ? `platform:create_user:${platformUser.id}:${ip}`
      : `platform:create_user:anon:${ip}`;
  },
  handler: (req, res, _next, opts) => {
    logger.warn('platform.user.create_rate_limited', {
      ip: realIp(req),
      userId: (req as any).platformUser?.id,
      path: (req as any).originalUrl,
      windowMs: opts.windowMs,
      max: opts.max,
    });
    res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset'
    );
    return res.status(opts.statusCode).json({ error: 'Too many platform user creation attempts' });
  },
});

// Limit invite creation to mitigate brute-force or abuse
export const platformInviteCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = realIp(req);
    const platformUser = (req as any).platformUser;
    return platformUser
      ? `platform:invite_create:${platformUser.id}:${ip}`
      : `platform:invite_create:anon:${ip}`;
  },
  handler: (req, res, _next, opts) => {
    logger.warn('platform.user.invite_rate_limited', {
      ip: realIp(req),
      userId: (req as any).platformUser?.id,
      path: (req as any).originalUrl,
      windowMs: opts.windowMs,
      max: opts.max,
    });
    res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset'
    );
    return res.status(opts.statusCode).json({ error: 'Too many invite attempts' });
  },
});