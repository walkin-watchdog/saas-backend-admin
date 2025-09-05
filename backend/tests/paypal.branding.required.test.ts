jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: {
    getConfig: jest.fn().mockImplementation((tenantId: string, key: string) => {
      if (key === 'paypal') {
        return Promise.resolve({
          clientId: 'id',
          clientSecret: 'secret',
          baseUrl: 'https://api.example.com',
          redirectUrl: 'https://app.example.com',
          webhookId: 'wh'
        });
      }
      return Promise.resolve(null);
    }),
    getBrandingConfig: jest.fn().mockRejectedValue(Object.assign(new Error('Branding configuration missing'), { code: 'BRANDING_CONFIG_MISSING' }))
  }
}));

jest.mock('../src/services/gatewayCredentialResolver', () => ({
  PaypalCredentialResolver: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret', webhookId: 'wh', baseUrl: 'https://api.example.com' })
}));

jest.mock('../src/utils/externalAdapter', () => ({ externalCall: (_:any, fn:any) => fn() }));

jest.mock('../src/middleware/tenantMiddleware', () => ({ getTenantId: () => 't1' }));

import { PayPalService } from '../src/services/paypalService';

describe('PayPal branding requirement', () => {
  it('throws BRANDING_CONFIG_MISSING when tenant branding absent', async () => {
    await expect(PayPalService.createOrder({ amount: 10, bookingId: 'b1' })).rejects.toMatchObject({ code: 'BRANDING_CONFIG_MISSING' });
  });
});
