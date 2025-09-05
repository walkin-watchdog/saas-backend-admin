import { prisma } from '../utils/prisma';
import { CreditNoteData } from '../types/platform';
import { AuditService } from './auditService';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

export class CreditNoteService {
  static async create(data: CreditNoteData, platformUserId: string) {
    // Do validation + mutation in a single transaction for atomicity.
    const creditNote = await prisma.$transaction(async (tx: any) => {
      let currency = data.currency;
      if (data.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
        if (!invoice) {
          const e: any = new Error('INVOICE_NOT_FOUND');
          e.status = 404;
          throw e;
        }
        const expectedCurrency = ((invoice as any).currency as string | undefined) ?? 'USD';
        if (currency && currency !== expectedCurrency) {
          const e: any = new Error('INVALID_CURRENCY');
          e.status = 400;
          throw e;
        }
        currency = currency ?? expectedCurrency;
        const outstanding = Math.max(invoice.amount ?? 0, 0);
        if (data.amount > outstanding) {
          const e: any = new Error('CREDIT_EXCEEDS_OUTSTANDING');
          e.status = 400;
          throw e;
        }
      } else {
        const sub = await tx.subscription.findFirst({ where: { tenantId: data.tenantId } });
        const expectedCurrency = sub?.currency ?? 'USD';
        if (currency && currency !== expectedCurrency) {
          const e: any = new Error('INVALID_CURRENCY');
          e.status = 400;
          throw e;
        }
        currency = currency ?? expectedCurrency;
      }

      const created = await tx.creditNote.create({
        data: {
          tenantId: data.tenantId,
          amount: data.amount,
          currency,
          reason: data.reason,
          invoiceId: data.invoiceId,
          note: data.note,
          issuedById: platformUserId,
        },
      });

      if (created.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: created.invoiceId } });
        if (inv) {
          const newAmount = Math.max((inv.amount ?? 0) - created.amount, 0);
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              amount: newAmount,
              status: newAmount === 0 ? 'paid' : inv.status,
            },
          });
        }
      }

      return created;
    });
    await AuditService.log({
      platformUserId,
      tenantId: data.tenantId,
      action: 'credit_note.created',
      resource: 'credit_note',
      resourceId: creditNote.id,
      changes: { ...data, currency: creditNote.currency },
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.CREDIT_NOTE_CREATED, {
      creditNoteId: creditNote.id,
      tenantId: data.tenantId,
      amount: creditNote.amount,
      currency: creditNote.currency,
    });
    return creditNote;
  }

  static async findMany(filters: { tenantId?: string; invoiceId?: string; limit?: number; offset?: number } = {}) {
    const where: any = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    return prisma.creditNote.findMany({
      where,
      take: filters.limit,
      skip: filters.offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  static async apply(id: string, platformUserId: string) {
    const existing = await prisma.creditNote.findUnique({ where: { id } });
    if (!existing) {
      const err: any = new Error('CREDIT_NOTE_NOT_FOUND');
      err.status = 404;
      throw err;
    }
    const note = await prisma.creditNote.update({
      where: { id },
      data: { status: 'applied', appliedAt: new Date() }
    });
    await AuditService.log({
      platformUserId,
      tenantId: note.tenantId,
      action: 'credit_note.applied',
      resource: 'credit_note',
      resourceId: id
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.CREDIT_NOTE_APPLIED, {
      creditNoteId: note.id,
      tenantId: note.tenantId,
      amount: note.amount,
      currency: note.currency,
    });
    return note;
  }

  static async cancel(id: string, platformUserId: string) {
    const existing = await prisma.creditNote.findUnique({ where: { id } });
    if (!existing) {
      const err: any = new Error('CREDIT_NOTE_NOT_FOUND');
      err.status = 404;
      throw err;
    }
    const note = await prisma.creditNote.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() }
    });
    await AuditService.log({
      platformUserId,
      tenantId: note.tenantId,
      action: 'credit_note.cancelled',
      resource: 'credit_note',
      resourceId: id
    });
    PlatformEventBus.publish(PLATFORM_EVENTS.CREDIT_NOTE_CANCELLED, {
      creditNoteId: note.id,
      tenantId: note.tenantId,
      amount: note.amount,
      currency: note.currency,
    });
    return note;
  }
}