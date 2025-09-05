import { TenantConfigService } from './tenantConfigService';
import { GlobalConfigService } from './globalConfigService';

export type GatewayScope = 'platform' | 'tenant';

export interface GatewayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

const ENV_FALLBACK_ALLOWED = process.env.ALLOW_ENV_FALLBACK === 'true';

export async function GatewayCredentialResolver(scope: GatewayScope, tenantId?: string): Promise<GatewayCredentials> {
  if (scope === 'tenant') {
    if (!tenantId) throw new Error('CREDENTIAL_SCOPE_VIOLATION');
    const cfg = await TenantConfigService.getConfig<any>(tenantId, 'razorpay');
    if (cfg?.keyId && cfg?.keySecret) {
      return { keyId: cfg.keyId, keySecret: cfg.keySecret, webhookSecret: cfg.webhookSecret };
    }
    const err: any = new Error('Razorpay credentials missing');
    err.code = 'CONFIG_MISSING_TENANT';
    throw err;
  }

  if (tenantId) throw new Error('CREDENTIAL_SCOPE_VIOLATION');
  const cfg = await GlobalConfigService.get<any>('razorpay');
  if (cfg?.keyId && cfg?.keySecret) {
    return { keyId: cfg.keyId, keySecret: cfg.keySecret, webhookSecret: cfg.webhookSecret };
  }
  if (process.env.NODE_ENV === 'production' && !ENV_FALLBACK_ALLOWED) {
    const err: any = new Error('Razorpay configuration missing');
    err.code = 'CONFIG_MISSING_PLATFORM';
    throw err;
  }
  if (!process.env.RAZORPAY_PLATFORM_KEY_ID || !process.env.RAZORPAY_PLATFORM_KEY_SECRET) {
    const err: any = new Error('Razorpay configuration missing');
    err.code = 'CONFIG_MISSING_PLATFORM';
    throw err;
  }
  return {
    keyId: process.env.RAZORPAY_PLATFORM_KEY_ID,
    keySecret: process.env.RAZORPAY_PLATFORM_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_PLATFORM_WEBHOOK_SECRET,
  };
}

// PayPal credentials resolver (explicit platform/tenant separation)
export type PaypalScope = 'platform' | 'tenant';
export interface PaypalCredentials {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  baseUrl?: string; // allow overriding sandbox/live for tests
}

export async function PaypalCredentialResolver(scope: PaypalScope, tenantId?: string): Promise<PaypalCredentials> {
  if (scope === 'tenant') {
    if (!tenantId) throw new Error('CREDENTIAL_SCOPE_VIOLATION');
    const cfg = await TenantConfigService.getConfig<any>(tenantId, 'paypal');
    if (cfg?.clientId && cfg?.clientSecret) {
      return { clientId: cfg.clientId, clientSecret: cfg.clientSecret, webhookId: cfg.webhookId, baseUrl: cfg.baseUrl };
    }
    const err: any = new Error('PayPal credentials missing');
    err.code = 'CONFIG_MISSING_TENANT';
    throw err;
  }

  if (tenantId) throw new Error('CREDENTIAL_SCOPE_VIOLATION');
  const cfg = await GlobalConfigService.get<any>('paypal');
  if (cfg?.clientId && cfg?.clientSecret) {
    return { clientId: cfg.clientId, clientSecret: cfg.clientSecret, webhookId: cfg.webhookId, baseUrl: cfg.baseUrl };
  }
  if (process.env.NODE_ENV === 'production' && !ENV_FALLBACK_ALLOWED) {
    const err: any = new Error('PayPal configuration missing');
    err.code = 'CONFIG_MISSING_PLATFORM';
    throw err;
  }
  if (!process.env.PAYPAL_PLATFORM_CLIENT_ID || !process.env.PAYPAL_PLATFORM_CLIENT_SECRET) {
    const err: any = new Error('PayPal configuration missing');
    err.code = 'CONFIG_MISSING_PLATFORM';
    throw err;
  }
  return {
    clientId: process.env.PAYPAL_PLATFORM_CLIENT_ID,
    clientSecret: process.env.PAYPAL_PLATFORM_CLIENT_SECRET,
    webhookId: process.env.PAYPAL_PLATFORM_WEBHOOK_ID,
    baseUrl: process.env.PAYPAL_PLATFORM_BASE_URL,
  };
}