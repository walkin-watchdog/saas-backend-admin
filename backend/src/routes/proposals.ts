import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { ProposalService } from '../services/proposalService';
import { BookingService } from '../services/bookingService';
import { EmailService } from '../services/emailService';
import { PDFService } from '../services/pdfService';
import { logger } from '../utils/logger';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

// ---------- Schemas ----------
const itineraryEntry = z.object({
  date: z.string(),
  time: z.string(),
  activity: z.string().min(1),
  location: z.string().min(1),
  remarks: z.string().optional()
});

const customDetailsSchema = z.object({
  packageName: z.string().min(1),
  location: z.string().min(1),
  duration: z.string().min(1),
  durationUnit: z.enum(['hours','days']),
  selectedTimeSlot: z.string().min(1),
  pricePerPerson: z.number().min(0),
  childPricePerPerson: z.number().min(0).optional(),
  discountType: z.enum(['percentage','fixed']),
  discountValue: z.number().min(0),
  itinerary: z.array(itineraryEntry).default([])
});

const createProposalSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)).optional().nullable(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  currency: z.string().default('INR'),
  customDetails: customDetailsSchema
});

const updateProposalSchema = z.object({
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(1).optional(),
  startDate: z.string().transform(s => new Date(s)).optional(),
  endDate: z.string().transform(s => new Date(s)).optional().nullable(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  ownerId: z.string().optional().nullable(),
  status: z.enum(['DRAFT','SENT','REVISED','APPROVED','ARCHIVED']).optional(),
  customDetails: customDetailsSchema.optional(),
  version: z.number().int().min(1).optional()
});

// Helpers
const toInputJson = (
  v: Prisma.JsonValue | null | undefined
): Prisma.InputJsonValue | null =>
  v === null || v === undefined ? null : (v as Prisma.InputJsonValue);

const weakETag = (version: number) => `W/"${version}"`;
const parseIfMatch = (hdr?: string | string[] | null): number | undefined => {
  if (!hdr) return;
  const s = Array.isArray(hdr) ? hdr[0] : hdr;
  if (!s) return;
  // Accept W/"n" or "n" or bare n
  const m = s.match(/"?W?\/?"?(\d+)"?/);
  if (!m) return;
  return parseInt(m[1], 10);
};

// Compute proposal total for convenience (same logic pattern as custom manual booking)
function computeProposalTotal(cd: z.infer<typeof customDetailsSchema>, adults: number, children: number) {
  const adultTotal = cd.pricePerPerson * adults;
  const childUnit = cd.childPricePerPerson ?? cd.pricePerPerson;
  const childTotal = children > 0 ? childUnit * children : 0;
  const base = adultTotal + childTotal;
  const pct = Math.max(0, Math.min(cd.discountValue ?? 0, 100));
  const raw = cd.discountType === 'percentage'
    ? base * (1 - pct / 100)
    : base - (cd.discountValue ?? 0);
  const total = Math.max(0, raw);
  return Math.round(total * 100) / 100;
}

// ---------- Routes ----------

// List proposals (Admin/Editor/Viewer)
router.get('/', authenticate, authorize(['ADMIN','EDITOR','VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const { status, q, limit, offset } = z.object({
      status: z.enum(['DRAFT','SENT','REVISED','APPROVED','ARCHIVED']).optional(),
      q: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional()
    }).parse(req.query);
    const where: any = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { customerName:  { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q, mode: 'insensitive' } },
        { customDetails: { path: ['packageName'], string_contains: q } as any }
      ];
    }
    const proposals = await ProposalService.findManyProposals({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit ?? 100,
      skip: offset ?? 0,

      select: {
        id: true, version: true, status: true, customerName: true, customerEmail: true, customerPhone: true,
        startDate: true, endDate: true, adults: true, children: true, currency: true, customDetails: true,
        createdAt: true, updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } }
      }
    });
    res.json(proposals);
  } catch (e) { next(e); }
});

// Create proposal (DRAFT)
router.post('/', authenticate, authorize(['ADMIN','EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const data = createProposalSchema.parse(req.body);
    const created = await ProposalService.createDraftWithInitialRevision({
      tenantId: req.tenantId!,
      createdById: req.user?.id ?? null,
      data: {
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        adults: data.adults,
        children: data.children,
        currency: data.currency,
        customDetails: data.customDetails
      }
    });
    res.status(201).setHeader('ETag', weakETag(created.version)).json(created);
  } catch (e) { next(e); }
});

// Get proposal (with ETag)
router.get('/:id', authenticate, authorize(['ADMIN','EDITOR','VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    res.setHeader('ETag', weakETag(proposal.version));
    res.setHeader('Cache-Control', 'no-cache');
    res.json(proposal);
  } catch (e) { next(e); }
});

// Patch proposal (optimistic concurrency via If-Match or body.version)
router.patch('/:id', authenticate, authorize(['ADMIN','EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const parsed = updateProposalSchema.parse(req.body);
    const current = await ProposalService.findProposal({ id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Not found' });

    const expectedVersion = parsed.version ?? parseIfMatch(req.headers['if-match']);
    if (!expectedVersion || expectedVersion !== current.version) {
      // Per HTTP semantics, 412 on version/ETag mismatch
      return res.status(412).json({ error: 'Precondition Failed (version mismatch)' });
    }

    const mutableKeys = [
      'customerName','customerEmail','customerPhone','startDate','endDate',
      'adults','children','currency','ownerId','status','customDetails'
    ] as const;
    const hasUpdates = mutableKeys.some((k) => (parsed as any)[k] !== undefined);

    if (!hasUpdates) {
      res.setHeader('ETag', weakETag(current.version));
      return res.json({ ...current, _revisionCreated: false });
    }

    const newVersion = current.version + 1;

    // If customDetails changed, we must record a revision and update atomically.
    if (parsed.customDetails) {
      const updateWithRevision: any = {
        ...parsed,
        version: newVersion,
        status: parsed.status ?? current.status
      };
      const updated = await ProposalService.createRevisionAndUpdate({
        tenantId: req.tenantId!,
        proposal: { id: current.id, version: current.version },
        snapshot: parsed.customDetails,
        createdById: req.user?.id ?? null,
        changeNote: 'Edited via PATCH',
        updateData: updateWithRevision
      });
      res.setHeader('ETag', weakETag(updated.version));
      return res.json({ ...updated, _revisionCreated: true });
    }

    // Otherwise, plain update without creating a revision.
    const updateOnly: any = { ...parsed, version: newVersion };
    const updated = await ProposalService.updateProposal(current.id, updateOnly);
    res.setHeader('ETag', weakETag(updated.version));
    res.json({ ...updated, _revisionCreated: false });
  } catch (e) { next(e); }
});

router.post('/:id/revisions', authenticate, authorize(['ADMIN','EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const body = z.object({
      customerName:   z.string().min(1).optional(),
      customerEmail:  z.string().email().optional(),
      customerPhone:  z.string().min(1).optional(),
      startDate:      z.string().transform(s => new Date(s)).optional(),
      endDate:        z.string().transform(s => new Date(s)).optional().nullable(),
      adults:         z.number().int().min(1).optional(),
      children:       z.number().int().min(0).optional(),
      currency:       z.string().optional(),
      customDetails: customDetailsSchema,
      changeNote: z.string().optional(),
      version: z.number().int().min(1).optional()
    }).parse(req.body);

    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });

    // Optional optimistic concurrency
    const expectedVersion = body.version ?? parseIfMatch(req.headers['if-match']);
    if (expectedVersion && expectedVersion !== proposal.version) {
      return res.status(412).json({ error: 'Precondition Failed (version mismatch)' });
    }

    const newVersion = proposal.version + 1;
    const snapshot = {
      customerName:  body.customerName  ?? proposal.customerName,
      customerEmail: body.customerEmail ?? proposal.customerEmail,
      customerPhone: body.customerPhone ?? proposal.customerPhone,
      startDate:     body.startDate     ?? proposal.startDate,
      endDate:       body.endDate       ?? proposal.endDate,
      adults:        body.adults        ?? proposal.adults,
      children:      body.children      ?? proposal.children,
      currency:      body.currency      ?? proposal.currency,
      ...body.customDetails
    };
    const updateData: any = {
      customDetails: body.customDetails,
      version:       newVersion,
      status:        'REVISED'
    };
    if ('customerName' in body)  updateData.customerName  = body.customerName;
    if ('customerEmail' in body) updateData.customerEmail = body.customerEmail;
    if ('customerPhone' in body) updateData.customerPhone = body.customerPhone;
    if ('startDate' in body)     updateData.startDate     = body.startDate;
    if ('endDate' in body)       updateData.endDate       = body.endDate;
    if ('adults' in body)        updateData.adults        = body.adults;
    if ('children' in body)      updateData.children      = body.children;
    if ('currency' in body)      updateData.currency      = body.currency;

    const updated = await ProposalService.createRevisionAndUpdate({
      tenantId:  req.tenantId!,
      proposal:  { id: proposal.id, version: proposal.version },
      snapshot,
      createdById: req.user?.id ?? null,
      changeNote:  body.changeNote,
      updateData
    });
    res.setHeader('ETag', weakETag(updated.version));
    res.json(updated);
  } catch (e) { next(e); }
});

// Render proposal PDF (inline); watermark "DRAFT" for non-approved
router.get('/:id/pdf', authenticate, authorize(['ADMIN','EDITOR','VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    const cd: any = proposal.customDetails || {};
    const showDraftWatermark = !(proposal.status === 'APPROVED' || proposal.status === 'ARCHIVED');
    const wm = showDraftWatermark ? 'DRAFT' : undefined;
    const pdf = await PDFService.generateCustomItineraryPDF(
      Array.isArray(cd.itinerary) ? cd.itinerary : [],
      `PROPOSAL-${proposal.id.slice(-6).toUpperCase()}`,
      { watermark: wm }
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="proposal-${proposal.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// Create/refresh a public share token
router.post('/:id/share', authenticate, authorize(['ADMIN','EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const { ttlHours = 336 } = z.object({ ttlHours: z.number().int().min(1).max(720).optional() }).parse(req.body || {});
    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + ttlHours * 3600 * 1000);
    const share = await ProposalService.createShare({
      tenantId: req.tenantId!,
      proposalId: proposal.id, 
      token, 
      expiresAt: expires 
    });
    const appUrl = process.env.FRONTEND_URL;
    const baseUrl = process.env.API_BASE || `${req.protocol}://${req.get('host')}`;
    res.json({
      token: share.token,
      expiresAt: share.expiresAt,
      publicUrl: appUrl ? `${appUrl}/proposal/${share.token}` : null,
      pdfUrl: `${baseUrl}/proposals/share/${share.token}/pdf`
    });
  } catch (e) { next(e); }
});

router.post('/:id/send', authenticate, authorize(['ADMIN','EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const parsed = z.object({
      ttlHours: z.number().int().min(1).max(720).optional(),
      changeNote: z.string().optional(),
      personalMessage: z.string().max(2000).optional()
    }).parse(req.body || {});
    const ttlHours = parsed.ttlHours ?? 336;
    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    const cd: any = proposal.customDetails || {};
    const pdf = await PDFService.generateCustomItineraryPDF(
      Array.isArray(cd.itinerary) ? cd.itinerary : [],
      `PROPOSAL-${proposal.id.slice(-6).toUpperCase()}`,
      { watermark: 'DRAFT' }
    );
    // Ensure share link exists
    const expires = new Date(Date.now() + ttlHours * 3600 * 1000);
    const token = crypto.randomBytes(32).toString('base64url');
    const share = await ProposalService.createShare({
      tenantId: req.tenantId!,
      proposalId: proposal.id, 
      token, 
      expiresAt: expires 
    });

    const baseUrl = process.env.API_BASE || `${req.protocol}://${req.get('host')}`;
    const frontend = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;
    const reviewLink = frontend
      ? `${frontend}/proposal/${share.token}`
      : `${baseUrl}/api/proposals/share/${share.token}/pdf`;
    
    await EmailService.sendItineraryDraft(proposal, pdf, { reviewLink, personalMessage: parsed.personalMessage });
    const updated = await ProposalService.updateProposal(proposal.id, { status: 'SENT' });
    if (parsed.changeNote) {
      await ProposalService.createRevision({
          tenantId: req.tenantId!,
          proposalId: proposal.id,
          version: updated.version,
          snapshot: cd,
          createdById: (req as AuthRequest).user?.id ?? null,
          changeNote: parsed.changeNote
      });
    }
    res.json({ message: 'Sent', proposal: updated });
  } catch (e) { next(e); }
});

// Change APPROVED → DRAFT (Admins only)
router.post('/:id/change-to-draft', authenticate, authorize(['ADMIN']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const current = await ProposalService.findProposal({ id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Not found' });
    if (current.status !== 'APPROVED') return res.status(400).json({ error: 'Only APPROVED proposals can be changed to DRAFT' });
    const expected = parseIfMatch(req.headers['if-match']);
    if (expected && expected !== current.version) return res.status(412).json({ error: 'Precondition Failed (version mismatch)' });
    const updated = await ProposalService.updateProposal(current.id, { 
      status: 'DRAFT', 
      version: current.version + 1 
    });
    res.setHeader('ETag', weakETag(updated.version));
    res.json(updated);
  } catch (e) { next(e); }
});

// Clone a proposal → new DRAFT
router.post('/:id/clone', authenticate, authorize(['ADMIN','EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const original = await ProposalService.findProposal({ id: req.params.id });
    if (!original) return res.status(404).json({ error: 'Not found' });
    const created = await ProposalService.cloneToDraft({
      tenantId: req.tenantId!,
      createdById: req.user?.id ?? null,
      from: {
        id: original.id,
        customerName: original.customerName,
        customerEmail: original.customerEmail,
        customerPhone: original.customerPhone,
        startDate: original.startDate,
        endDate: original.endDate,
        adults: original.adults,
        children: original.children,
        currency: original.currency,
        customDetails: toInputJson(original.customDetails)
      }
    });
    res.status(201).setHeader('ETag', weakETag(created.version)).json(created);
  } catch (e) { next(e); }
});

// Approve
router.post('/:id/approve', authenticate, authorize(['ADMIN','EDITOR']), async (req: TenantRequest, res, next) => {
  try {
    const current = await ProposalService.findProposal({ id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Not found' });
    const updated = await ProposalService.updateProposal(req.params.id, {
      status: 'APPROVED',
      version: current.version + 1
    });
    res.setHeader('ETag', weakETag(updated.version));
    res.json(updated);
  } catch (e) { next(e); }
});

// List revisions (Admin/Editor)
router.get(
  '/:id/revisions',
  authenticate,
  authorize(['ADMIN','EDITOR']),
  async (req: TenantRequest, res, next) => {
    try {
      const revisions = await ProposalService.findManyRevisions(
        { proposalId: req.params.id },
        {
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          changeNote: true,
          snapshot: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, email: true } }
        }
        }
      );
      res.json(revisions);
    } catch (e) { next(e); }
  }
);

// Convert to booking (manual booking using proposal's customDetails)
router.post('/:id/convert-to-booking', authenticate, authorize(['ADMIN','EDITOR']), async (req: AuthRequest & TenantRequest, res, next) => {
  try {
    const body = z.object({
      status: z.enum(['PENDING','CONFIRMED','CANCELLED','COMPLETED']).default('CONFIRMED'),
      paymentStatus: z.enum(['PENDING','PARTIAL','PAID','FAILED','REFUNDED']).default('PENDING'),
      partialPaymentAmount: z.number().min(0).optional(),
      sendVoucher: z.boolean().default(true)
    }).parse(req.body || {});

    const proposal = await ProposalService.findProposal({ id: req.params.id });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    if (proposal.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only APPROVED proposals can be converted to booking' });
    }
    const cd: any = proposal.customDetails || {};
    const bookingCode = `LT${Date.now()}${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    const totalAmount = computeProposalTotal(cd, proposal.adults, proposal.children);

    const booking = await BookingService.createBooking({
        tenantId: req.tenantId,
        bookingCode,
        currency: proposal.currency,
        isManual: true,
        createdById: req.user?.id ?? null,
        customerName: proposal.customerName,
        customerEmail: proposal.customerEmail,
        customerPhone: proposal.customerPhone,
        adults: proposal.adults,
        children: proposal.children,
        totalAmount,
        partialPaymentAmount: body.partialPaymentAmount ?? 0,
        status: body.status,
        paymentStatus: body.paymentStatus,
        bookingDate: proposal.startDate,
        selectedTimeSlot: cd.selectedTimeSlot ?? '',
        notes: `Proposal ${proposal.id} → Booking`,
        customDetails: cd
    });
    await ProposalService.updateProposal(proposal.id, { 
      bookingId: booking.id, 
      status: 'ARCHIVED' 
    });
    await EmailService.sendBookingConfirmation(booking, { title: cd.packageName });
    if (body.sendVoucher) {
      await EmailService.sendBookingVoucher({
        ...booking,
        product: { title: cd.packageName, location: cd.location, duration: `${cd.duration} ${cd.durationUnit}` }
      });
    }
    res.status(201).json({ bookingId: booking.id, bookingCode: booking.bookingCode });
  } catch (e) {
    next(e);
  }
});

// --------- Public (read-only) share endpoints ----------

// View JSON summary (optional; helpful for future public UIs)
router.get('/share/:token', async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const share = await ProposalService.findShare({ token: req.params.token, tenantId: req.tenantId! });
    if (!share || share.expiresAt < new Date()) return res.status(404).json({ error: 'Link expired' });
    const proposal = await ProposalService.findProposal({ id: share.proposalId });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    res.json({
      proposal: {
        customerName: proposal.customerName,
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        adults: proposal.adults,
        children: proposal.children,
        currency: proposal.currency,
        customDetails: proposal.customDetails,
        version: proposal.version,
        status: proposal.status
      }
    });
  } catch (e) { next(e); }
});

// Inline PDF (public)
router.get('/share/:token/pdf', async (req: TenantRequest, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const share = await ProposalService.findShare({ token: req.params.token, tenantId: req.tenantId! });
    if (!share || share.expiresAt < new Date()) return res.status(404).json({ error: 'Link expired' });
    const proposal = await ProposalService.findProposal({ id: share.proposalId });
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    const cd: any = proposal.customDetails || {};
    const pdf = await PDFService.generateCustomItineraryPDF(
      Array.isArray(cd.itinerary) ? cd.itinerary : [],
      `PROPOSAL-${proposal.id.slice(-6).toUpperCase()}`,
      { watermark: (proposal.status === 'APPROVED' || proposal.status === 'ARCHIVED') ? undefined : 'DRAFT' }
    );
    await ProposalService.updateShare(share.id, { accessedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="proposal-${proposal.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

export default router;