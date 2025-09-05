import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { keyByTenantRouteIp } from '../middleware/rateLimit';
import { z, ZodError } from 'zod';
import { logger } from '../utils/logger';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { TenantConfigService } from '../services/tenantConfigService';
import { getTenantId } from '../middleware/tenantMiddleware';
import { externalCall } from '../utils/externalAdapter';

const router = express.Router();
dotenv.config();


// --- RATE LIMITER ---
const limiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute
  max: 60,                    // limit each IP to 60 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTenantRouteIp,
});
router.use('/convert', limiter);
router.use('/currencies', limiter);

// --- CACHE SETUP ---
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
type CacheEntry = { rates: Record<string, number>; fetchedAt: number };
const rateCache = new Map<string, CacheEntry>();

// --- ZOD SCHEMAS ---
const currencyCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Currency must be 3 letters')  // enforce 3-letter code :contentReference[oaicite:7]{index=7}
  .transform((val) => val.toUpperCase());                  // normalize to uppercase :contentReference[oaicite:8]{index=8}

const conversionSchema = z.object({
  from: currencyCodeSchema,
  to:   currencyCodeSchema,
  amount: z.coerce.number().positive(),                   // coerce strings → numbers, enforce >0 :contentReference[oaicite:9]{index=9}
});

// --- FETCH & CACHE LOGIC ---
export async function fetchExchangeRates(base: string): Promise<Record<string, number>> {
  const key = base.toUpperCase();
  const now = Date.now();
  const cached = rateCache.get(key);

  let API_KEY: string | undefined;
  const tenantId = getTenantId();
  if (tenantId) {
    const cfg = await TenantConfigService.getConfig<{ apiKey?: string }>(tenantId, 'currencyApi');
    if (cfg?.apiKey) API_KEY = cfg.apiKey;
  }
  if (!API_KEY) {
    const err: any = new Error('Exchange rate API key not configured');
    err.code = 'CURRENCY_API_KEY_MISSING';
    throw err;
  }
  if (cached && now - cached.fetchedAt < CACHE_DURATION) {
    return cached.rates;
  }

  const url = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${key}`;
  try {
    const res = await externalCall('exchange_rate_api', (signal) => fetch(url, { signal }));
    if (!res.ok) {
      const rates = { [key]: 1 } as Record<string, number>;
      rateCache.set(key, { rates, fetchedAt: now });
      return rates;
    }
    const data = await res.json();
    if (data.result !== 'success' || !data.conversion_rates) {
      const rates = { [key]: 1 } as Record<string, number>;
      rateCache.set(key, { rates, fetchedAt: now });
      return rates;
    }

    const rates: Record<string, number> = data.conversion_rates;
    if (rates[key] === undefined) rates[key] = 1;
    rateCache.set(key, { rates, fetchedAt: now });
    return rates;
  } catch {
    // Network/parse errors: keep dashboard alive with identity rate
    const rates = { [key]: 1 } as Record<string, number>;
    rateCache.set(key, { rates, fetchedAt: now });
    return rates;
  }
}

// --- ROUTES ---
router.get('/currencies', async (req: TenantRequest, res) => {
  try {
    const rates = await fetchExchangeRates('USD');
    const all = Object.keys(rates);
    const popular = ['USD','EUR','GBP','INR','AUD','CAD','JPY','SGD','AED','CNY'];
    const sorted = [
      ...popular.filter(c => all.includes(c)).sort()
    ];
    res.json({ currencies: sorted });
  } catch (err: any) {
    if (err?.code === 'CURRENCY_API_KEY_MISSING') {
      return res.status(412).json({
        code: 'CURRENCY_API_KEY_MISSING',
        message: 'Set exchange rate API key in Settings → Integrations',
      });
    }
    logger.error('Currencies error:', err);
    res.status(502).json({ error: 'Failed to load currencies' });
  }
});

router.get('/convert', async (req: TenantRequest, res) => {
  try {
    const { from, to, amount } = conversionSchema.parse({
      from:   req.query.from,
      to:     req.query.to,
      amount: req.query.amount
    });

    const rates = await fetchExchangeRates(from);
    const rate = rates[to];
    if (rate === undefined) {
      return res.status(400).json({ error: `Unsupported currency: ${to}` });
    }

    const converted = parseFloat((amount * rate).toFixed(2));
    res.json({ from, to, amount, rate, convertedAmount: converted });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    if (err?.code === 'CURRENCY_API_KEY_MISSING') {
      return res.status(412).json({
        code: 'CURRENCY_API_KEY_MISSING',
        message: 'Set exchange rate API key in Settings → Integrations',
      });
    }
    logger.error('Convert error:', err);
    res.status(502).json({ error: 'Conversion failed' });
  }
});

export default router;