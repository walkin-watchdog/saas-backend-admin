import { Router } from 'express';
import { z } from 'zod';
import { DomainService, normalizeDomain } from '../../services/domainService';
import { authenticate, authorize, requirePlatformAdmin } from '../../middleware/auth';
import { retryInteractiveTx } from '../../utils/txRetry';

const router = Router();

// Validators
const createSchema = z.object({
  domain: z.string().min(1).transform(normalizeDomain),
  isActive: z.boolean().optional(),
  isAdminHost: z.boolean().optional(),
});

const updateSchema = z.object({
  domain: z.string().min(1).transform(normalizeDomain).optional(),
  isActive: z.boolean().optional(),
  isAdminHost: z.boolean().optional(),
}).refine(v => v.domain !== undefined || v.isActive !== undefined, {
  message: 'At least one of domain or isActive must be provided',
});

router.get('/', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const rows = await DomainService.list();
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const row = await retryInteractiveTx(() => DomainService.create(body));
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Domain already exists' });
    if (e?.status === 409) return res.status(409).json({ error: e.message });
    if (e?.name === 'ZodError') return res.status(400).json({ error: e.issues });
    next(e);
  }
});

router.patch('/:id', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const row = await DomainService.update(req.params.id, body);
    res.json(row);
  } catch (e: any) {
    if (e?.status === 409) return res.status(409).json({ error: e.message });
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Domain not found' });
    if (e?.name === 'ZodError') return res.status(400).json({ error: e.issues });
    next(e);
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    await retryInteractiveTx(() =>
      DomainService.remove(req.params.id)
    );
    res.status(204).end();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Domain not found' });
    next(e);
  }
});

// Start domain verification (issues TXT token)
router.post('/:id/verify/start', authenticate, authorize(['ADMIN']), async (req, res) => {
  const { id } = req.params;
  const info = await DomainService.startVerification(id);
  res.status(201).json(info);
});

// Attempt verification now (checks DNS TXT)
router.post('/:id/verify', authenticate, authorize(['ADMIN']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await DomainService.verify(id);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
