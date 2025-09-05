import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { CreditNoteService } from '../../services/creditNoteService';

const router = express.Router();

const filterSchema = z.object({
  tenantId: z.string().optional(),
  invoiceId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

router.get('/',
  requirePlatformPermissions('credit_notes.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = filterSchema.parse(req.query);
      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;
      const notes = await CreditNoteService.findMany({ ...filters, limit, offset });
      res.json({
        creditNotes: notes,
        pagination: { limit, offset },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/',
  requirePlatformPermissions('credit_notes.issue'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = z.object({
        tenantId: z.string(),
        amount: z.number().positive(),
        currency: z.string().optional().default('USD'),
        reason: z.string(),
        invoiceId: z.string().optional(),
        note: z.string().optional(),
      }).parse(req.body);
      const note = await CreditNoteService.create(data, req.platformUser!.id);
      res.status(201).json(note);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/apply',
  requirePlatformPermissions('credit_notes.issue'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const note = await CreditNoteService.apply(req.params.id, req.platformUser!.id);
      res.json(note);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/cancel',
  requirePlatformPermissions('credit_notes.issue'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const note = await CreditNoteService.cancel(req.params.id, req.platformUser!.id);
      res.json(note);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/tenant/:tenantId',
  requirePlatformPermissions('credit_notes.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { limit, offset } = z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }).parse(req.query);
      const effectiveLimit = limit ?? 50;
      const effectiveOffset = offset ?? 0;
      const notes = await CreditNoteService.findMany({
        tenantId: req.params.tenantId,
        limit: effectiveLimit,
        offset: effectiveOffset,
      });
      res.json({
        creditNotes: notes,
        pagination: { limit: effectiveLimit, offset: effectiveOffset },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/export/csv',
  requirePlatformPermissions('credit_notes.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = filterSchema.parse(req.query);
      const notes = await CreditNoteService.findMany(filters);
      const rows = ['id,tenantId,amount,currency,reason,invoiceId,status,createdAt'];
      for (const n of notes) {
        rows.push(`${n.id},${n.tenantId},${n.amount},${n.currency},${n.reason},${n.invoiceId || ''},${n.status},${n.createdAt.toISOString()}`);
      }
      res.header('Content-Type', 'text/csv');
      res.send(rows.join('\n'));
    } catch (err) {
      next(err);
    }
  }
);

export default router;