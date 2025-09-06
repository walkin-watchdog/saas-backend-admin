// src/routes/tenant/branding.ts
import { Router } from 'express';
import { getTenantId } from '../../middleware/tenantMiddleware';
import { BrandingResolver } from '../../services/brandingResolver';

const router = Router();

// GET /api/tenant/branding
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId();
    const theme = await BrandingResolver.resolveTheme({ tenantId });
    res.json(theme);
  } catch (e) { next(e); }
});

export default router;