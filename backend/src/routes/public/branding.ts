import { Router } from 'express';
import { BrandingResolver } from '../../services/brandingResolver';

const router = Router();

// GET /public/branding
// Used by the admin login page to theme by host (no auth)
router.get('/', async (req, res) => {
  const forwarded = (req.headers['x-forwarded-host'] as string) || '';
  const rawHost = forwarded.split(',')[0]?.trim() || req.headers.host || '';
  const theme = await BrandingResolver.resolveTheme({ host: rawHost });
  // Cache small JSON per host for snappy login page
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('Vary', 'Host, X-Forwarded-Host');
  const etag = `"${Buffer.from(JSON.stringify(theme)).toString('base64url')}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.setHeader('ETag', etag);
  res.json(theme);
});

export default router;