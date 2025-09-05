import express from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { prisma } from '../../utils/prisma';
import { PlatformConfigService } from '../../services/platformConfigService';
import { getTenantPrisma, TenantRequest } from '../../middleware/tenantMiddleware';
import { generateInvoicePdf } from '../../services/invoiceGenerator';
import { TenantService } from '../../services/tenantService';
import { verifyAccess } from '../../utils/jwt';
import { logger } from '../../utils/logger';
import { PlatformEventBus, PLATFORM_EVENTS } from '../../utils/platformEvents';
import { InvoiceAccessService } from '../../services/invoiceAccessService';

const router = express.Router();

const invoiceFiltersSchema = z.object({
  status: z.string().optional(),
  startDate: z.string().transform(str => new Date(str)).optional(),
  endDate: z.string().transform(str => new Date(str)).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// Get tenant invoices
router.get('/', 
  authenticate, 
  authorize(['ADMIN']),
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const filters = invoiceFiltersSchema.parse(req.query);
      const prisma = getTenantPrisma();
      
      const where: any = {};
      if (filters.status) where.status = filters.status;
      
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include: {
            subscription: {
              include: { plan: { include: { prices: true } } }
            }
          },
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.invoice.count({ where })
      ]);
      
      res.json({
        invoices,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
          total
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Secure PDF download endpoint
router.get('/secure/:accessKey', async (req, res, next) => {
  try {
    // Validate access key
    const accessConfig = await PlatformConfigService.getConfigEntry(
      req.params.accessKey,
      'global',
    );

    if (!accessConfig) {
      PlatformEventBus.publish(PLATFORM_EVENTS.PDF_TOKEN_MISS, { accessKey: req.params.accessKey });
      return res.status(404).json({ error: 'Invalid or expired access token' });
    }

    if (!accessConfig.expiresAt || new Date() > accessConfig.expiresAt) {
      // Clean up expired token
      await PlatformConfigService.deleteConfig(req.params.accessKey, undefined, 'global');
      PlatformEventBus.publish(PLATFORM_EVENTS.PDF_TOKEN_MISS, { accessKey: req.params.accessKey, reason: 'expired' });
      return res.status(404).json({ error: 'Access token expired' });
    }

    const accessData = await PlatformConfigService.getConfig<any>(
      req.params.accessKey,
      'global',
    );
    if (!accessData) {
      PlatformEventBus.publish(PLATFORM_EVENTS.PDF_TOKEN_MISS, { accessKey: req.params.accessKey, reason: 'missing-data' });
      return res.status(404).json({ error: 'Invalid or expired access token' });
    }
    // Verify the signed PDF access token that was issued for this grant
    try {
      const claims: any = verifyAccess(accessData.token);
      if (claims.sub !== accessData.userId || claims.tenantId !== accessData.tenantId) {
        return res.status(403).json({ error: 'Invalid PDF token claims' });
      }
    } catch {
      PlatformEventBus.publish(PLATFORM_EVENTS.PDF_TOKEN_MISS, { accessKey: req.params.accessKey, reason: 'signature' });
      return res.status(401).json({ error: 'Invalid or expired PDF token' });
    }

    // Verify the user still has access to this tenant
    const user = await prisma.user.findFirst({
      where: { 
        id: accessData.userId,
        tenantId: accessData.tenantId
      },
      select: { id: true, role: true }
    });

    if (!user) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get invoice with tenant context
    const invoice = await TenantService.withTenantContext(
      { id: accessData.tenantId } as any,
      async (tenantPrisma) => {
        return (tenantPrisma as typeof prisma).invoice.findUnique({
          where: { id: accessData.invoiceId },
          include: {
            subscription: {
              include: { plan: { include: { prices: true } } }
            }
          }
        });
      }
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get usage records for the invoice
    const usage = await TenantService.withTenantContext(
      { id: accessData.tenantId } as any,
      async (tenantPrisma) => {
        return (tenantPrisma as typeof prisma).usageRecord.findMany({
          where: {
            tenantId: accessData.tenantId,
            occurredAt: {
              gte: new Date(invoice.createdAt.getTime() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        });
      }
    );

    // Generate PDF
    const pdfBuffer = await generateInvoicePdf(
      invoice,
      invoice.subscription.plan,
      usage,
      { brandingScope: 'tenant' }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.number}.pdf"`);
    res.send(pdfBuffer);

    // Clean up single-use token
    await PlatformConfigService.deleteConfig(req.params.accessKey, undefined, 'global');

    logger.info('Secure invoice PDF accessed', {
      invoiceId: invoice.id,
      tenantId: accessData.tenantId,
      userId: accessData.userId
    });

  } catch (error) {
    next(error);
  }
});

// Get single invoice
router.get('/:id', 
  authenticate, 
  authorize(['ADMIN', 'EDITOR', 'VIEWER']),
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const prisma = getTenantPrisma();
      
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: {
          subscription: {
            include: { plan: { include: { prices: true } } }
          }
        }
      });
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json(invoice);
    } catch (error) {
      next(error);
    }
  }
);

// Generate secure PDF access token for invoice
router.post('/:id/pdf-token', 
  authenticate, 
  authorize(['ADMIN', 'EDITOR', 'VIEWER']),
  async (req: AuthRequest & TenantRequest, res, next) => {
    try {
      const prisma = getTenantPrisma();
      
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        select: { id: true, tenantId: true }
      });
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const { secureUrl, expiresAt } = await InvoiceAccessService.grantPdfAccess({
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        user: req.user!,
        baseUrl: `${req.protocol}://${req.get('host')}`,
      });

      res.json({ secureUrl, expiresAt });
    } catch (error) {
      next(error);
    }
  }
);

export default router;