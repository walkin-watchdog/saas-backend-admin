jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: {
    getConfig: jest.fn().mockResolvedValue({
      clientId: 'id',
      clientSecret: 'secret',
      baseUrl: 'https://api.example.com',
      redirectUrl: 'https://app.example.com'
    })
  }
}));

jest.mock('../src/services/gatewayCredentialResolver', () => ({
  PaypalCredentialResolver: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret', baseUrl: 'https://api.example.com' })
}));

jest.mock('../src/middleware/tenantMiddleware', () => ({ getTenantId: () => 't1' }));

import { PayPalService } from '../src/services/paypalService';

(PayPalService as any).getAccessToken = jest.fn().mockResolvedValue('token');

describe('PayPal webhook id requirement', () => {
  it('throws PAYPAL_WEBHOOK_ID_MISSING when tenant webhook id absent', async () => {
    await expect(
      PayPalService.verifyWebhookSignature({}, {}, { scope: 'tenant', tenantId: 't1' })
    ).rejects.toMatchObject({ code: 'PAYPAL_WEBHOOK_ID_MISSING' });
  });
});
