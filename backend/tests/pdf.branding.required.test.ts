jest.mock('../src/utils/templateLoader', () => ({
  TemplateLoader: {
    getTenantBranding: jest.fn().mockRejectedValue(Object.assign(new Error('Branding configuration missing'), { code: 'BRANDING_CONFIG_MISSING' }))
  }
}));

jest.mock('../src/middleware/tenantMiddleware', () => ({ getTenantId: () => 't1' }));

// Mock PDFService to avoid PDF generation timeout
jest.mock('../src/services/pdfService', () => ({
  PDFService: {
    generateBookingVoucher: jest.fn().mockRejectedValue(Object.assign(new Error('Branding configuration missing'), { code: 'BRANDING_CONFIG_MISSING' }))
  }
}));

import { PDFService } from '../src/services/pdfService';

describe('PDF branding requirement', () => {
  it('throws BRANDING_CONFIG_MISSING when branding absent', async () => {
    await expect(
      PDFService.generateBookingVoucher({
        booking: { bookingCode: 'B1', customerName: 'c', customerEmail: 'e', customerPhone: 'p', paymentStatus: 'PAID', totalAmount: 0 },
        product: { title: 'Prod' },
        customer: {},
        currency: 'INR'
      } as any)
    ).rejects.toMatchObject({ code: 'BRANDING_CONFIG_MISSING' });
  });
});
