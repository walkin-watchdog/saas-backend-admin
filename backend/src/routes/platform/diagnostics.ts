import { Router } from 'express';
import { requirePlatformPermissions } from '../../middleware/platformAuth';
 
const router = Router();
router.use(requirePlatformPermissions('tenants.read'));

// GET /api/platform/diagnostics/prisma-cache (simple counts)
router.get('/prisma-cache', (_req, res) => {
  const { getDedicatedCacheStats } = require('../../utils/prisma');
  res.json(getDedicatedCacheStats());
});

export default router;