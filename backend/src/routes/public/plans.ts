import express from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { PublicPlan } from '../../types/public';
const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { public: true, active: true },
      include: { prices: true },
    });
    const getPrice = (p: any, currency: string, period: string) =>
      p.prices.find((pr: any) => pr.currency === currency && pr.period === period)?.amountInt ?? 0;
    plans.sort(
      (a, b) => getPrice(a, 'USD', 'monthly') - getPrice(b, 'USD', 'monthly')
    );
    const data: PublicPlan[] = plans.map(p => ({
      id: p.id,
      marketingName: p.marketingName,
      marketingDescription: p.marketingDescription,
      featureHighlights: p.featureHighlights,
      billingFrequency: p.billingFrequency,
      prices: {
        USD: { monthly: getPrice(p, 'USD', 'monthly'), yearly: getPrice(p, 'USD', 'yearly') },
        INR: { monthly: getPrice(p, 'INR', 'monthly'), yearly: getPrice(p, 'INR', 'yearly') },
      },
    }));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/select', async (req, res, next) => {
  try {
    const { planId } = z.object({ planId: z.string() }).parse(req.body);
    const plan = await prisma.plan.findFirst({
      where: { id: planId, public: true, active: true },
      include: { prices: true },
    });
    if (!plan) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    const getPrice = (currency: string, period: string) =>
      plan.prices.find(pr => pr.currency === currency && pr.period === period)?.amountInt ?? 0;
    const data: PublicPlan = {
      id: plan.id,
      marketingName: plan.marketingName,
      marketingDescription: plan.marketingDescription,
      featureHighlights: plan.featureHighlights,
      billingFrequency: plan.billingFrequency,
      prices: {
        USD: { monthly: getPrice('USD', 'monthly'), yearly: getPrice('USD', 'yearly') },
        INR: { monthly: getPrice('INR', 'monthly'), yearly: getPrice('INR', 'yearly') },
      },
    };
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
