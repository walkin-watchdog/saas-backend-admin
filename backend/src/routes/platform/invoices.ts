import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { InvoiceService } from '../../services/invoiceService';

const router = express.Router();
export const secureInvoiceRouter = express.Router();

const invoiceFiltersSchema = z.object({
  tenantId: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().transform(str => new Date(str)).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// Get all invoices
router.get('/',
  requirePlatformPermissions('invoices.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = invoiceFiltersSchema.parse(req.query);
      
      const invoices = await InvoiceService.findInvoices(filters);
      
      res.json({
        invoices,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Export invoices CSV
router.get('/export/csv',
  requirePlatformPermissions('invoices.export'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = invoiceFiltersSchema.parse(req.query);
      const csv = await InvoiceService.exportInvoicesCsv(filters);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="invoices-export.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

// Secure PDF download endpoint
secureInvoiceRouter.get('/:token', async (req, res, next) => {
  try {
    const pdfBuffer = await InvoiceService.getPdfBufferByToken(req.params.token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    const msg = ((error as Error).message || '').toLowerCase();
    if (msg.includes('token')) {
      return res.status(404).json({ error: (error as Error).message });
    }
    next(error);
  }
});

// Get single invoice
router.get('/:id',
  requirePlatformPermissions('invoices.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const invoice = await InvoiceService.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json(invoice);
    } catch (error) {
      next(error);
    }
  }
);

// Generate secure PDF URL for invoice
router.post('/:id/pdf-url', 
  requirePlatformPermissions('invoices.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const result = await InvoiceService.generatePdfToken(req.params.id, req.platformUser!.id, baseUrl);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Resend invoice email
router.post('/:id/resend', 
  requirePlatformPermissions('invoices.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      await InvoiceService.resendInvoice(req.params.id, req.platformUser!.id);
      res.json({ message: 'Invoice email resent successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;