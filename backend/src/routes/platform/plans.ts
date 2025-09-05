import express from 'express';
import { z } from 'zod';
import { getPrismaClient } from '../../utils/prisma';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';


const prisma = getPrismaClient({ bypassRls: true });
const router = express.Router();

const planSchema = z.object({
  code: z.string(),
  priceMonthlyUsd: z.number().int().nonnegative(),
  priceYearlyUsd: z.number().int().nonnegative(),
  priceMonthlyInr: z.number().int().nonnegative(),
  priceYearlyInr: z.number().int().nonnegative(),
  billingFrequency: z.string(),
  marketingName: z.string(),
  marketingDescription: z.string().default(''),
  featureHighlights: z.array(z.string()).default([]),
  public: z.boolean().default(true),
});

router.get('/', requirePlatformPermissions('plans.read'), async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { code: 'asc' }, include: { prices: true } });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePlatformPermissions('plans.read'), async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: req.params.id }, include: { prices: true } });
    if (!plan) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePlatformPermissions('plans.write'), async (req: PlatformAuthRequest, res, next) => {
  try {
    const data = planSchema.parse(req.body);
    const { priceMonthlyUsd, priceYearlyUsd, priceMonthlyInr, priceYearlyInr, ...rest } = data;
    if (rest.public && [priceMonthlyUsd, priceYearlyUsd, priceMonthlyInr, priceYearlyInr].some(v => v === 0)) {
      return res.status(422).json({ error: 'INVALID_PUBLIC_PRICE' });
    }
    const created = await prisma.plan.create({
      data: {
        ...rest,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: priceMonthlyUsd },
            { currency: 'USD', period: 'yearly', amountInt: priceYearlyUsd },
            { currency: 'INR', period: 'monthly', amountInt: priceMonthlyInr },
            { currency: 'INR', period: 'yearly', amountInt: priceYearlyInr },
          ],
        },
      },
      include: { prices: true },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const planUpdateSchema = planSchema.partial().omit({ code: true });

router.put('/:id', requirePlatformPermissions('plans.write'), async (req, res, next) => {
  try {
    const existing = await prisma.plan.findUnique({ where: { id: req.params.id }, include: { prices: true } });
    if (!existing) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    const updates = planUpdateSchema.parse(req.body);
    const findPrice = (currency: string, period: string) =>
      existing.prices.find(p => p.currency === currency && p.period === period)?.amountInt ?? 0;
    const priceMonthlyUsd = updates.priceMonthlyUsd ?? findPrice('USD', 'monthly');
    const priceYearlyUsd = updates.priceYearlyUsd ?? findPrice('USD', 'yearly');
    const priceMonthlyInr = updates.priceMonthlyInr ?? findPrice('INR', 'monthly');
    const priceYearlyInr = updates.priceYearlyInr ?? findPrice('INR', 'yearly');
    const makePublic = updates.public ?? existing.public;
    if (makePublic && [priceMonthlyUsd, priceYearlyUsd, priceMonthlyInr, priceYearlyInr].some(v => v === 0)) {
      return res.status(422).json({ error: 'INVALID_PUBLIC_PRICE' });
    }
    // In-place version bump to avoid unique(code) conflicts
    const updated = await prisma.plan.update({
      where: { id: existing.id },
      data: {
        billingFrequency: updates.billingFrequency ?? existing.billingFrequency,
        marketingName: updates.marketingName ?? existing.marketingName,
        marketingDescription: updates.marketingDescription ?? existing.marketingDescription,
        featureHighlights: updates.featureHighlights ?? existing.featureHighlights,
        public: makePublic,
        prices: {
          upsert: [
            {
              where: { planId_currency_period: { planId: existing.id, currency: 'USD', period: 'monthly' } },
              update: { amountInt: priceMonthlyUsd },
              create: { currency: 'USD', period: 'monthly', amountInt: priceMonthlyUsd },
            },
            {
              where: { planId_currency_period: { planId: existing.id, currency: 'USD', period: 'yearly' } },
              update: { amountInt: priceYearlyUsd },
              create: { currency: 'USD', period: 'yearly', amountInt: priceYearlyUsd },
            },
            {
              where: { planId_currency_period: { planId: existing.id, currency: 'INR', period: 'monthly' } },
              update: { amountInt: priceMonthlyInr },
              create: { currency: 'INR', period: 'monthly', amountInt: priceMonthlyInr },
            },
            {
              where: { planId_currency_period: { planId: existing.id, currency: 'INR', period: 'yearly' } },
              update: { amountInt: priceYearlyInr },
              create: { currency: 'INR', period: 'yearly', amountInt: priceYearlyInr },
            },
          ],
        },
        version: { increment: 1 },
        active: true,
      },
      include: { prices: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePlatformPermissions('plans.write'), async (req, res, next) => {
  try {
    await prisma.plan.update({ where: { id: req.params.id }, data: { active: false } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const toggleSchema = z.object({ value: z.boolean() });

router.post('/:id/public', requirePlatformPermissions('plans.write'), async (req, res, next) => {
  try {
    const { value } = toggleSchema.parse({ value: req.body.public ?? req.body.value });
    const existing = await prisma.plan.findUnique({ where: { id: req.params.id }, include: { prices: true } });
    if (!existing) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    if (value) {
      const required = [
        existing.prices.find(p => p.currency === 'USD' && p.period === 'monthly')?.amountInt ?? 0,
        existing.prices.find(p => p.currency === 'USD' && p.period === 'yearly')?.amountInt ?? 0,
        existing.prices.find(p => p.currency === 'INR' && p.period === 'monthly')?.amountInt ?? 0,
        existing.prices.find(p => p.currency === 'INR' && p.period === 'yearly')?.amountInt ?? 0,
      ];
      if (required.some(v => v === 0)) {
        return res.status(422).json({ error: 'INVALID_PUBLIC_PRICE' });
      }
    }
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: { public: value } });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/active', requirePlatformPermissions('plans.write'), async (req, res, next) => {
  try {
    const { value } = toggleSchema.parse({ value: req.body.active ?? req.body.value });
    const existing = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: { active: value } });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
