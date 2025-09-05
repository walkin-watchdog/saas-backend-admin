import crypto from 'crypto';
import { signAccess } from '../utils/jwt';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';
import { AuthUser } from '../middleware/auth';
import { PlatformConfigService } from './platformConfigService';

export class InvoiceAccessService {
  static async grantPdfAccess(params: {
    invoiceId: string;
    tenantId: string;
    user: AuthUser;
    baseUrl: string;
  }): Promise<{ secureUrl: string; expiresAt: Date }> {
    const { invoiceId, tenantId, user, baseUrl } = params;
    const pdfToken = signAccess(
      {
        sub: user.id,
        tenantId,
        role: user.role,
        tokenVersion: 0,
        platformAdmin: user.platformAdmin,
      },
      crypto.randomUUID(),
    );

    const accessKey = `invoice_pdf_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PlatformConfigService.setConfig(
      accessKey,
      {
        invoiceId,
        tenantId,
        userId: user.id,
        token: pdfToken,
      },
      undefined,
      { scope: 'global', encrypt: true, expiresAt },
    );

    const secureUrl = `${baseUrl}/api/billing/invoices/secure/${accessKey}`;

    PlatformEventBus.publish(PLATFORM_EVENTS.PDF_TOKEN_GRANTED, {
      tenantId,
      invoiceId,
    });

    return { secureUrl, expiresAt };
  }
}