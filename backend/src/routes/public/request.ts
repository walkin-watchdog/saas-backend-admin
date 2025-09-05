import express from 'express';
import { prisma } from '../../utils/prisma';
import { PublicRequestSubmission, PublicRequestResponse } from '../../types/public';
import { eventBus, PUBLIC_EVENTS } from '../../utils/eventBus';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../utils/platformEvents';
import { publicSensitiveLimiter } from '../../middleware/rateLimit';
import { z } from 'zod';
import { verifyPublicCaptcha } from '../../utils/publicCaptcha';

const router = express.Router();

const schema = z.object({
  kind: z.enum(['contact', 'trial', 'enterprise']),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().optional(),
  utm: z.record(z.string(), z.string()).optional(),
  captcha: z.string().optional(),
});

router.post('/', publicSensitiveLimiter, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', issues: parsed.error.issues });
    }
    const body = parsed.data as PublicRequestSubmission & { captcha?: string };

    const captchaOk = await verifyPublicCaptcha(body.captcha);
    if (!captchaOk) return res.status(400).json({ error: 'CAPTCHA_FAILED' });
    const row = await prisma.requestFormSubmission.create({
      data: {
        kind: body.kind,
        email: body.email,
        company: body.company,
        message: body.message,
        utm: body.utm,
      },
    });
    eventBus.publish(PUBLIC_EVENTS.REQUEST_CREATED, { id: row.id, kind: row.kind, email: row.email, company: row.company });
    PlatformEventBus.publish(PLATFORM_EVENTS.REQUEST_CREATED, { id: row.id, kind: row.kind, email: row.email, company: row.company });
    const resp: PublicRequestResponse = { id: row.id };
    res.status(202).json(resp);
  } catch (err) {
    next(err);
  }
});

export default router;