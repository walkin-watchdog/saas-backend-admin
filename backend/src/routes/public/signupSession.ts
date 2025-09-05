import express from 'express';
import { prisma } from '../../utils/prisma';
import { SignupSessionPing } from '../../types/public';
import { eventBus, PUBLIC_EVENTS } from '../../utils/eventBus';
import { z } from 'zod';

const router = express.Router();

const schema = z.object({
  sessionId: z.string().min(1),
  email: z.string().email().optional(),
  planId: z.string().optional(),
  tenantCode: z.string().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  currency: z.enum(['USD', 'INR']).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', issues: parsed.error.issues });
    }
    const body: SignupSessionPing = parsed.data;
    const existing = await prisma.platformAbandonedCart.findUnique({ where: { sessionId: body.sessionId } });
    if (!existing) {
      await prisma.platformAbandonedCart.create({
        data: {
          sessionId: body.sessionId,
          email: body.email,
          planId: body.planId,
          tenantCode: body.tenantCode,
          utm: body.utm,
          currency: body.currency,
        },
      });
      eventBus.publish(PUBLIC_EVENTS.ABANDONED_CART_OPENED, { sessionId: body.sessionId, email: body.email });
    } else {
      await prisma.platformAbandonedCart.update({
        where: { sessionId: body.sessionId },
        data: {
          email: body.email ?? existing.email,
          planId: body.planId ?? existing.planId,
          tenantCode: body.tenantCode ?? existing.tenantCode,
          utm: (body.utm as any) ?? (existing.utm as any),
          currency: body.currency ?? existing.currency,
          lastSeenAt: new Date(),
          status: 'open',
        },
      });
      eventBus.publish(PUBLIC_EVENTS.ABANDONED_CART_UPDATED, { sessionId: body.sessionId, email: body.email });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;