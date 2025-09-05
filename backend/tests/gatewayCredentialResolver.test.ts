jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: {
    getConfig: jest.fn().mockResolvedValue(null),
  },
}));
import { TenantConfigService } from '../src/services/tenantConfigService';

describe('GatewayCredentialResolver', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('throws when tenant scope is used without tenantId', async () => {
    process.env.ALLOW_ENV_FALLBACK = 'true';
    process.env.RAZORPAY_KEY_ID = 'k';
    process.env.RAZORPAY_KEY_SECRET = 's';
    const { GatewayCredentialResolver: resolver } = require('../src/services/gatewayCredentialResolver');
    await expect(resolver('tenant')).rejects.toThrow('CREDENTIAL_SCOPE_VIOLATION');
  });

  it('throws when platform scope is used with tenantId', async () => {
    process.env.ALLOW_ENV_FALLBACK = 'true';
    process.env.RAZORPAY_PLATFORM_KEY_ID = 'pk';
    process.env.RAZORPAY_PLATFORM_KEY_SECRET = 'ps';
    const { GatewayCredentialResolver: resolver } = require('../src/services/gatewayCredentialResolver');
    await expect(resolver('platform', 'tenant1')).rejects.toThrow('CREDENTIAL_SCOPE_VIOLATION');
  });

  it('fails fast when platform creds missing in production', async () => {
    (TenantConfigService.getConfig as jest.Mock).mockResolvedValue(null);
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_ENV_FALLBACK = 'false';
    delete process.env.RAZORPAY_PLATFORM_KEY_ID;
    delete process.env.RAZORPAY_PLATFORM_KEY_SECRET;
    const { GatewayCredentialResolver: resolver } = require('../src/services/gatewayCredentialResolver');
    await expect(resolver('platform')).rejects.toThrow('Razorpay configuration missing');
  });

  it('does not allow env fallback for tenant credentials even when enabled', async () => {
    (TenantConfigService.getConfig as jest.Mock).mockResolvedValue(null);
    process.env.ALLOW_ENV_FALLBACK = 'true';
    process.env.RAZORPAY_KEY_ID = 'k';
    process.env.RAZORPAY_KEY_SECRET = 's';
    const { GatewayCredentialResolver: resolver } = require('../src/services/gatewayCredentialResolver');
    await expect(resolver('tenant', 't1')).rejects.toThrow('Razorpay credentials missing');
  });
});
