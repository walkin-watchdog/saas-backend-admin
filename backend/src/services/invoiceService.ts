import crypto from 'crypto';
import { Prisma, UsageRecord } from '@prisma/client';
import { prisma, withPlatformRole } from '../utils/prisma';
import { generateInvoicePdf } from './invoiceGenerator';
import { AuditService } from './auditService';
import { EmailService } from './emailService';
import { PlatformConfigService } from './platformConfigService';
import { hashToken } from '../utils/tokenHash';

export interface InvoiceFilters {
  tenantId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class InvoiceService {
  static async findInvoices(
    filters: InvoiceFilters = {},
  ): Promise<
    Array<
      Prisma.InvoiceGetPayload<{
        include: {
          subscription: {
            include: {
              plan: { include: { prices: true } };
              tenant: { select: { name: true } };
            };
          };
        };
      }>
    >
  > {
    const where: Prisma.InvoiceWhereInput = {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            createdAt: {
              ...(filters.startDate ? { gte: filters.startDate } : {}),
              ...(filters.endDate ? { lte: filters.endDate } : {}),
            },
          }
        : {}),
    };

    return withPlatformRole((tx) =>
      tx.invoice.findMany({
        where,
        include: {
          subscription: {
            include: {
              plan: { include: { prices: true } },
              tenant: { select: { name: true } },
            },
          },
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  static async getInvoice(
    id: string,
  ): Promise<
    Prisma.InvoiceGetPayload<{
      include: {
        subscription: {
          include: {
            plan: { include: { prices: true } };
            tenant: { select: { name: true } };
          };
        };
      };
    }> | null
  > {
    return withPlatformRole((tx) =>
      tx.invoice.findUnique({
        where: { id },
        include: {
          subscription: {
            include: {
              plan: { include: { prices: true } },
              tenant: { select: { name: true } },
            },
          },
        },
      }),
    );
  }

  static async generatePdfToken(
    invoiceId: string,
    issuedBy: string,
    baseUrl: string,
  ): Promise<{ secureUrl: string; expiresAt: Date }> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const key = `invoice_access_${tokenHash}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await PlatformConfigService.setConfig(
      key,
      { invoiceId, issuedBy },
      undefined,
      { scope: 'global', encrypt: true, expiresAt },
    );
    await AuditService.log({
      platformUserId: issuedBy,
      tenantId: invoice.tenantId,
      action: 'invoice.pdf_url_generated',
      resource: 'invoice',
      resourceId: invoice.id,
    });
    const secureUrl = `${baseUrl}/api/platform/invoices/secure/${token}`;
    return { secureUrl, expiresAt };
  }

  static async getPdfBufferByToken(token: string): Promise<Buffer> {
    const tokenHash = hashToken(token);
    const key = `invoice_access_${tokenHash}`;
    const accessConfig = await PlatformConfigService.getConfigEntry(key, 'global');
    if (!accessConfig) throw new Error('Invalid or expired token');
    if (!accessConfig.expiresAt || new Date() > accessConfig.expiresAt) {
      await PlatformConfigService.deleteConfig(key, undefined, 'global').catch(() => {});
      throw new Error('Token expired');
    }
    const accessData = await PlatformConfigService.getConfig<{ invoiceId: string; issuedBy: string }>(
      key,
      'global',
    );
    if (!accessData) {
      await PlatformConfigService.deleteConfig(key, undefined, 'global').catch(() => {});
      throw new Error('Invalid or expired token');
    }
    const invoice = await withPlatformRole((tx) =>
      tx.invoice.findUnique({
        where: { id: accessData.invoiceId },
        include: {
          subscription: { include: { plan: { include: { prices: true } } } },
        },
      }),
    );
    if (!invoice) throw new Error('Invoice not found');
    const usage: UsageRecord[] = await withPlatformRole((tx) =>
      tx.usageRecord.findMany({
        where: {
          tenantId: invoice.tenantId,
          occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    );

    const pdfBuffer = await generateInvoicePdf(
      invoice,
      invoice.subscription.plan,
      usage,
      { brandingScope: 'platform' },
    );
    await AuditService.log({
      platformUserId: accessData.issuedBy,
      tenantId: invoice.tenantId,
      action: 'invoice.pdf_accessed',
      resource: 'invoice',
      resourceId: invoice.id,
    });
    await PlatformConfigService.deleteConfig(key, undefined, 'global').catch(() => {});
    return pdfBuffer;
  }

  static async resendInvoice(
    invoiceId: string,
    platformUserId: string,
  ): Promise<void> {
    const invoice = await withPlatformRole((tx) =>
      tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { subscription: { include: { plan: { include: { prices: true } }, tenant: true } } },
      }),
    );
    if (!invoice) throw new Error('Invoice not found');
    const subscriber = await withPlatformRole((tx) =>
      tx.subscriber.findUnique({ where: { tenantId: invoice.tenantId } }),
    );
    if (!subscriber?.ownerEmail) throw new Error('Subscriber email not found');
    await EmailService.sendInvoiceEmail(invoice, subscriber.ownerEmail);
    await AuditService.log({
      platformUserId,
      tenantId: invoice.tenantId,
      action: 'invoice.email_resent',
      resource: 'invoice',
      resourceId: invoice.id,
    });
  }

  static async exportInvoicesCsv(filters: InvoiceFilters = {}): Promise<string> {
    const invoices = await this.findInvoices({ ...filters, limit: filters.limit ?? 10000, offset: filters.offset });
    const headers = [
      'Invoice ID',
      'Invoice Number',
      'Tenant ID',
      'Tenant Name',
      'Subscription ID',
      'Amount',
      'Currency',
      'Tax Amount',
      'Tax Percent',
      'Status',
      'Jurisdiction',
      'Created At',
    ];
    const escape = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = invoices.map(inv => [
      inv.id,
      inv.number,
      inv.tenantId,
      inv.subscription.tenant.name,
      inv.subscriptionId,
      inv.amount,
      inv.currency,
      inv.taxAmount ?? '',
      inv.taxPercent ?? '',
      inv.status,
      inv.jurisdiction ?? '',
      inv.createdAt.toISOString(),
    ].map(escape).join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}