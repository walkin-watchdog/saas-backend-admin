import express from 'express';
import { prisma } from '../../utils/prisma';
import { withTenantContext } from '../../middleware/tenantMiddleware';

const router = express.Router();

router.get('/:token', async (req, res, next) => {
  try {
    const raw = req.params.token;
    // Token format: "<tenantId>.<opaque>"
    const firstDot = raw.indexOf('.');
    if (firstDot <= 0) {
      return res.status(400).json({ error: 'INVALID_TOKEN' });
    }
    const tenantId = raw.slice(0, firstDot);
    const token = raw;

    const updated = await withTenantContext({ id: tenantId } as any, async (tenantPrisma) => {
      const found = await (tenantPrisma as typeof prisma).user.findFirst({
        where: {
          verificationToken: token,
          verificationTokenExpiry: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!found) return null;
      await (tenantPrisma as typeof prisma).user.update({
        where: { id: found.id },
        data: { emailVerified: true, verificationToken: null, verificationTokenExpiry: null },
      });
      return true;
    });

    if (!updated) return res.status(400).json({ error: 'INVALID_TOKEN' });
    return res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});

export default router;