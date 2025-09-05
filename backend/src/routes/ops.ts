import { Router } from 'express';
import { opMetrics } from '../utils/opMetrics';
import { authenticatePlatform, requirePlatformPermissions } from '../middleware/platformAuth';

const router = Router();

router.get(
  '/metrics',
  authenticatePlatform,
  requirePlatformPermissions('metrics.read'),
  (_req, res) => {
    res.json(opMetrics.snapshot());
  }
);

export default router;