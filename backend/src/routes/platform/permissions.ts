import express from 'express';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { prisma } from '../../utils/prisma';

const router = express.Router();

router.get('/matrix', requirePlatformPermissions('platform.permissions.read'), async (_req: PlatformAuthRequest, res, next) => {
  try {
    const roles = await prisma.platformRole.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
    const matrix = roles.map(r => ({
      role: r.code,
      permissions: r.permissions.map(p => p.permission.code),
    }));
    res.json({ matrix });
  } catch (err) {
    next(err);
  }
});

export default router;
