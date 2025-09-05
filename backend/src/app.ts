import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { keyByTenantRouteIp, rateLimitPayment, rateLimitPaymentBurst, publicLimiter } from './middleware/rateLimit';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { SitemapService } from './services/sitemapService';
import { resolveTenant, bindRouterTenantContext } from './middleware/tenantMiddleware';
import { requestId } from './middleware/requestId';
import { httpMetrics } from './middleware/httpMetrics';
import { routePath } from './middleware/routePath';
import { prisma } from './utils/prisma';
import { getRedisClient } from './utils/redisClient';
import { breakersHealthy } from './utils/preflight';

// Routes
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import bookingRoutes from './routes/bookings';
import aboutRoutes from './routes/about';
import partnersRoutes from './routes/partners';
import proposalRoutes from './routes/proposals';
import homeRoutes from './routes/home';
import logoRoutes from './routes/logo';
import slidesRoutes from './routes/slides';
import faqRoutes from './routes/faqs';
import jobRoutes from './routes/jobs';
import availabilityRoutes from './routes/availability';
import couponRoutes from './routes/coupons';
import tripRequestRoutes from './routes/tripRequests';
import newsletterRoutes from './routes/newsletter';
import analyticsRoutes from './routes/analytics';
import paymentRoutes from './routes/payments';
import paymentWebhookRoutes from './routes/payments/webhook';
import subscriptionWebhookRoutes from './routes/webhooks/subscriptions';
import uploadRoutes from './routes/uploads';
import searchRoutes from './routes/search';
import abandonedCartRoutes from './routes/abandonedCart';
import destinationRoutes from './routes/destinations';
import attractionRoutes from './routes/attractions';
import experienceCategoryRoutes from './routes/experienceCategories';
import reviewsRoutes from './routes/reviews';
import paypalPaymentRoutes from './routes/paypalPayments';
import currencyRoutes from './routes/currency';
import translateRoutes from './routes/translate';
import partnershipRoutes from './routes/partnership';
import tenantConfigRoutes from './routes/tenantConfig';
import domainRoutes from './routes/tenant/domains';
import brandingRoutes from './routes/tenant/branding';
import paymentMethodRoutes from './routes/billing/paymentMethods';
import subscriptionRoutes from './routes/billing/subscription';
import invoiceRoutes from './routes/billing/invoices';
import platformRoutes from './routes/platform';
import platformAuthRoutes from './routes/platform/auth';
import { secureInvoiceRouter as platformInvoiceSecureRoutes } from './routes/platform/invoices';
import opsRoutes from './routes/ops';
import metricsRoutes from './routes/metrics';
import { allowedOriginsSet, isAllowedOrigin } from './utils/allowedOrigins';
import publicRoutes from './routes/public';
import { isAllowedPublicOrigin } from './utils/allowedPublicOrigins';
import { checkMaintenanceMode } from './middleware/maintenanceMode';
import { platformLimiter, platformAuthLimiter } from './middleware/platformRateLimit';
import imageRuleRoutes from './routes/imageRules';
import './listeners/dunningNotice';
import './listeners/tenantDatasourceChanged';

const app = express();

// // Middleware
// Trust first proxy to obtain the correct client IP without allowing
// arbitrary proxies to spoof requests. A boolean `true` would trust all
// proxies and cause express-rate-limit to throw a validation error.
app.set('trust proxy', 2);

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.originalUrl === '/api/health' ||
    req.originalUrl.startsWith('/api/payments/webhooks') ||
    req.originalUrl.startsWith('/api/webhooks/platform') ||
    (req.method !== 'GET' && req.method !== 'HEAD'),
  handler: (req, res, _next, options) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOriginsSet.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After, ETag, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');
    return res.status(options.statusCode).json({ message: 'Too many requests' });
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.originalUrl === '/api/health' ||
    req.originalUrl.startsWith('/api/payments/webhooks') ||
    req.originalUrl.startsWith('/api/webhooks/platform') ||
    (req.method === 'GET' || req.method === 'HEAD'),
  handler: (req, res, _next, options) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOriginsSet.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin')
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Retry-After, ETag, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset'
    );
    return res.status(options.statusCode).json({ message: 'Too many requests' });
  },
});

app.use(requestId);
app.use(httpMetrics);
app.use(cookieParser());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      scriptSrc  : ["'self'"],
      styleSrc   : ["'self'", "https:"],
      frameSrc   : ["'self'","https://www.paypal.com","https://*.paypal.com"],
      connectSrc : ["'self'", "https://api-m.paypal.com", "https://api-m.sandbox.paypal.com", "https://api.razorpay.com"]
    },
  },
}));

// Check maintenance mode before processing requests
app.use(checkMaintenanceMode);

const corsOptions = {
  origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return cb(null, true);
    cb(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type','X-Requested-With','If-Match','x-api-key','x-csrf-token','X-CSRF-Token'],
  exposedHeaders: ['Retry-After','ETag','RateLimit-Limit','RateLimit-Remaining','RateLimit-Reset'],
};

const publicCorsOptions = {
  origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return cb(null, true);
    cb(null, isAllowedPublicOrigin(origin));
  },
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'],
  exposedHeaders: ['Retry-After','RateLimit-Limit','RateLimit-Remaining','RateLimit-Reset'],
};

app.use('/public', cors(publicCorsOptions));
app.options('/public/*', cors(publicCorsOptions));
app.use('/api', cors(corsOptions));
app.options('/api/*', cors(corsOptions));

app.use('/public', publicLimiter);
app.use('/public', express.json({ limit: '10mb' }));
app.use('/public', express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/public', routePath, publicRoutes);
app.use('/api/payments/webhooks', routePath, paymentWebhookRoutes);
app.use('/api/webhooks/platform', routePath, subscriptionWebhookRoutes);
app.use('/ops', routePath, opsRoutes);
app.use('/metrics', routePath, metricsRoutes);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Platform admin routes (no tenant context binding needed)
app.use('/api/platform/invoices/secure', platformInvoiceSecureRoutes);
app.use('/api/platform/auth', platformAuthLimiter, platformAuthRoutes);
app.use('/api/platform', platformLimiter, platformRoutes);

// Tenant resolution middleware (before auth)
app.use(resolveTenant);

app.use('/api', readLimiter);
app.use('/api', writeLimiter);

// Routes
app.use('/api/auth',                   routePath, bindRouterTenantContext(authRoutes));
app.use('/api/products',               routePath, bindRouterTenantContext(productRoutes));
app.use('/api/about',                  routePath, bindRouterTenantContext(aboutRoutes));
app.use('/api/home',                   routePath, bindRouterTenantContext(homeRoutes));
app.use('/api/logo',                   routePath, bindRouterTenantContext(logoRoutes));
app.use('/api/partners',               routePath, bindRouterTenantContext(partnersRoutes));
app.use('/api/slides',                 routePath, bindRouterTenantContext(slidesRoutes));
app.use('/api/faqs',                   routePath, bindRouterTenantContext(faqRoutes));
app.use('/api/jobs',                   routePath, bindRouterTenantContext(jobRoutes));
app.use('/api/bookings',               routePath, bindRouterTenantContext(bookingRoutes));
app.use('/api/availability',           routePath, bindRouterTenantContext(availabilityRoutes));
app.use('/api/coupons',                routePath, bindRouterTenantContext(couponRoutes));
app.use('/api/trip-requests',          routePath, bindRouterTenantContext(tripRequestRoutes));
app.use('/api/newsletter',             routePath, bindRouterTenantContext(newsletterRoutes));
app.use('/api/analytics',              routePath, bindRouterTenantContext(analyticsRoutes));
app.use('/api/payments',               rateLimitPayment, rateLimitPaymentBurst, routePath, bindRouterTenantContext(paymentRoutes));
app.use('/api/uploads',                routePath, bindRouterTenantContext(uploadRoutes));
app.use('/api/search',                 routePath, bindRouterTenantContext(searchRoutes));
app.use('/api/abandoned-carts',        routePath, bindRouterTenantContext(abandonedCartRoutes));
app.use('/api/destinations',           routePath, bindRouterTenantContext(destinationRoutes));
app.use('/api/attractions',            routePath, bindRouterTenantContext(attractionRoutes));
app.use('/api/experience-categories',  routePath, bindRouterTenantContext(experienceCategoryRoutes));
app.use('/api/reviews',                routePath, bindRouterTenantContext(reviewsRoutes));
app.use('/api/payments/paypal',        routePath, bindRouterTenantContext(paypalPaymentRoutes));
app.use('/api/currency',               routePath, bindRouterTenantContext(currencyRoutes));
app.use('/api/translate',              routePath, bindRouterTenantContext(translateRoutes));
app.use('/api/partnership',            routePath, bindRouterTenantContext(partnershipRoutes));
app.use('/api/proposals',              routePath, bindRouterTenantContext(proposalRoutes));
app.use('/api/config/image-rules',     routePath, bindRouterTenantContext(imageRuleRoutes));
app.use('/api/tenant/config',          routePath, bindRouterTenantContext(tenantConfigRoutes));
app.use('/api/tenant/domains',         routePath, bindRouterTenantContext(domainRoutes));
app.use('/api/tenant/branding',         routePath, bindRouterTenantContext(brandingRoutes));
app.use('/api/billing/payment-methods', routePath, bindRouterTenantContext(paymentMethodRoutes));
app.use('/api/billing/subscription',    routePath, bindRouterTenantContext(subscriptionRoutes));
app.use('/api/billing/invoices',        routePath, bindRouterTenantContext(invoiceRoutes));

// Health check
app.get('/api/health', routePath, (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/health/ready', routePath, async (_req, res) => {
  const [db, redis] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    getRedisClient().then((c) => Boolean(c)).catch(() => false),
  ]);
  const queue = redis;
  const breakers = breakersHealthy();
  const ok = db && redis && queue && breakers;
  res.status(ok ? 200 : 503).json({ db, redis, queue, breakers });
});

// Sitemap endpoint
app.get('/sitemap.xml', routePath, async (req, res, next) => {
  try {
    const sitemap = await SitemapService.getSitemap();
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    next(error);
  }
});

// Error handling
app.use(errorHandler);

export { app };