import { logger } from '../utils/logger';
import { getTenantId } from '../middleware/tenantMiddleware';
import { PaypalCredentialResolver, PaypalScope } from './gatewayCredentialResolver';
import { TenantConfigService } from './tenantConfigService';
import { TemplateLoader } from '../utils/templateLoader';
import { externalCall } from '../utils/externalAdapter';

interface PayPalOrderData {
  amount: number;
  currency?: string;
  description?: string;
  bookingId: string;
  reference?: string;
  tenantId?: string;
}

type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  redirectUrl?: string;
  webhookId?: string;
};

interface PayPalCaptureData {
  orderId: string;
}

export class PayPalService {
  private static baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com';
  private static async loadBrandName(): Promise<string> {
    const tenantId = getTenantId();
    if (tenantId) {
      try {
        const branding = await TemplateLoader.getTenantBranding(tenantId);
        const name = branding.companyName;
        if (name) return name;
      } catch (e) {
        const err: any = new Error('Branding configuration missing');
        err.code = 'BRANDING_CONFIG_MISSING';
        throw err;
      }
      const err: any = new Error('Branding configuration missing');
      err.code = 'BRANDING_CONFIG_MISSING';
      throw err;
    }
    return process.env.COMPANY_NAME || 'Zenseeo';
  }

  private static async loadConfig(scope: PaypalScope, tenantId?: string): Promise<PayPalConfig> {
    const creds = await PaypalCredentialResolver(scope, tenantId);
    let redirectUrl: string | undefined;
    let baseUrl = creds.baseUrl || this.baseUrl;
    if (scope === 'tenant' && tenantId) {
      const tenantCfg = await TenantConfigService.getConfig<PayPalConfig>(tenantId, 'paypal').catch(() => null);
      redirectUrl = tenantCfg?.redirectUrl;
      baseUrl = tenantCfg?.baseUrl || baseUrl;
      if (!redirectUrl || !baseUrl) {
        const err: any = new Error('PayPal configuration missing');
        err.code = 'PAYPAL_CONFIG_MISSING';
        throw err;
      }
    } else {
      redirectUrl = process.env.PAYPAL_REDIRECT_URL;
    }
    return {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      baseUrl,
      redirectUrl,
      webhookId: creds.webhookId
    };
  }

  private static async getAccessToken(scope: PaypalScope, tenantId?: string): Promise<string> {
    try {
      const cfg = await this.loadConfig(scope, tenantId);
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          signal,
        })
      );

      if (!response.ok) {
        throw new Error('Failed to get PayPal access token');
      }

      const data = await response.json();
      return data.access_token;
    } catch (error: any) {
      logger.error('Error getting PayPal access token:', error);
      if (error?.code) throw error;
      throw new Error('Failed to authenticate with PayPal');
    }
  }

  static async cancelSubscription(subscriptionId: string, reason: string, opts: { scope: PaypalScope, tenantId?: string }) {
    const cfg = await this.loadConfig(opts.scope, opts.tenantId);
    try {
      const accessToken = await this.getAccessToken(opts.scope, opts.tenantId);
      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
          signal,
        })
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`PayPal subscription cancel error: ${err}`);
      }
      return true;
    } catch (error: any) {
      logger.error('Error cancelling PayPal subscription:', error);
      if (error?.code) throw error;
      throw new Error('Failed to cancel PayPal subscription');
    }
  }

  static async activateSubscription(subscriptionId: string, opts: { scope: PaypalScope, tenantId?: string }) {
    const cfg = await this.loadConfig(opts.scope, opts.tenantId);
    try {
      const accessToken = await this.getAccessToken(opts.scope, opts.tenantId);
      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v1/billing/subscriptions/${subscriptionId}/activate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Resume by tenant admin' }),
          signal,
        })
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`PayPal subscription activate error: ${err}`);
      }
      return true;
    } catch (error: any) {
      logger.error('Error activating PayPal subscription:', error);
      if (error?.code) throw error;
      throw new Error('Failed to activate PayPal subscription');
    }
  }

  static async createSubscription(planCode: string, tenantId: string, tenantCode: string, opts: { scope: PaypalScope, tenantId?: string }) {
    const cfg = await this.loadConfig(opts.scope, opts.tenantId);
    try {
      const accessToken = await this.getAccessToken(opts.scope, opts.tenantId);
      const payload = {
        plan_id: planCode,
        custom_id: `${tenantId}::${tenantCode}`,
      };
      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v1/billing/subscriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal,
        })
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`PayPal subscription create error: ${err}`);
      }
      return await response.json();
    } catch (error: any) {
      logger.error('Error creating PayPal subscription:', error);
      if (error?.code) throw error;
      throw new Error('Failed to create PayPal subscription');
    }
  }

  static async updateSubscriptionPlan(subscriptionId: string, planCode: string, opts: { scope: PaypalScope, tenantId?: string }) {
    const cfg = await this.loadConfig(opts.scope, opts.tenantId);
    try {
      const accessToken = await this.getAccessToken(opts.scope, opts.tenantId);
      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v1/billing/subscriptions/${subscriptionId}/revise`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan_id: planCode }),
          signal,
        })
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`PayPal subscription update error: ${err}`);
      }
      return await response.json();
    } catch (error: any) {
      logger.error('Error updating PayPal subscription:', error);
      if (error?.code) throw error;
      throw new Error('Failed to update PayPal subscription');
    }
  }

  static async createOrder(orderData: PayPalOrderData) {
    const tenantId = orderData.tenantId || getTenantId();
    const cfg = await this.loadConfig('tenant', tenantId);
    try {
      const brandName  = await this.loadBrandName();
      const accessToken = await this.getAccessToken('tenant', tenantId);
      const customId =
        orderData.tenantId
          ? `${orderData.tenantId}::${orderData.bookingId}`
          : orderData.bookingId;
      const payload = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderData.reference || `order_${Date.now()}`,
            custom_id:    customId,
            description: orderData.description || `${brandName} Booking`,
            amount: {
              currency_code: orderData.currency || 'USD',
              value: orderData.amount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: brandName,
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${cfg.redirectUrl || ''}/booking/success`,
          cancel_url: `${cfg.redirectUrl || ''}/booking/cancel`,
        },
      };

      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal,
        })
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`PayPal API error: ${error.message}`);
      }

      const order = await response.json();
      logger.info('PayPal order created:', { orderId: order.id, amount: orderData.amount });
      
      return order;
    } catch (error: any) {
      logger.error('Error creating PayPal order:', error);
      if (error?.code) throw error;
      throw new Error('Failed to create PayPal order');
    }
  }

  static async captureOrder(captureData: PayPalCaptureData) {
    const tenantId = getTenantId();
    const cfg = await this.loadConfig('tenant', tenantId);
    try {
      const accessToken = await this.getAccessToken('tenant', tenantId);

      const response = await externalCall('paypal', (signal) =>
        fetch(`${cfg.baseUrl || this.baseUrl}/v2/checkout/orders/${captureData.orderId}/capture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal,
        })
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`PayPal capture error: ${error.message}`);
      }

      const captureResult = await response.json();
      logger.info('PayPal order captured:', { orderId: captureData.orderId });
      
      return captureResult;
    } catch (error: any) {
      logger.error('Error capturing PayPal order:', error);
      if (error?.code) throw error;
      throw new Error('Failed to capture PayPal payment');
    }
  }

  static async refundPayment(captureId: string, amount?: number, currency?: string) {
    const tenantId = getTenantId();
    const cfg = await this.loadConfig('tenant', tenantId);
    try {
      const brandName  = await this.loadBrandName();
      const accessToken = await this.getAccessToken('tenant', tenantId);

      const payload: any = {
        note_to_payer: `Refund from ${brandName}`,
      };

      if (amount) {
        payload.amount = {
          value: amount.toFixed(2),
          currency_code: currency || 'USD',
        };
      }

      const response = await fetch(`${cfg.baseUrl || this.baseUrl}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`PayPal refund error: ${error.message}`);
      }

      const refund = await response.json();
      logger.info('PayPal refund processed:', { refundId: refund.id, captureId });
      
      return refund;
    } catch (error: any) {
      logger.error('Error processing PayPal refund:', error);
      if (error?.code) throw error;
      throw new Error('Failed to process PayPal refund');
    }
  }

  static async getOrderDetails(orderId: string) {
    const tenantId = getTenantId();
    const cfg = await this.loadConfig('tenant', tenantId);
    try {
      const accessToken = await this.getAccessToken('tenant', tenantId);

      const response = await fetch(`${cfg.baseUrl || this.baseUrl}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`PayPal API error: ${error.message}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('Error fetching PayPal order details:', error);
      if (error?.code) throw error;
      throw new Error('Failed to fetch PayPal order details');
    }
  }
  
  static async verifyWebhookSignature(
    headers: Record<string, string>,
    body: any,
    opts: { scope: PaypalScope, tenantId?: string }
  ): Promise<boolean> {
    const cfg = await this.loadConfig(opts.scope, opts.tenantId);
    if (!cfg.webhookId) {
      const err: any = new Error('PayPal webhook id missing');
      err.code = 'PAYPAL_WEBHOOK_ID_MISSING';
      throw err;
    }
    const accessToken = await this.getAccessToken(opts.scope, opts.tenantId);
    const verifyUrl = `${cfg.baseUrl || this.baseUrl}/v1/notifications/verify-webhook-signature`;

    const payload = {
      transmission_id: headers['paypal-transmission-id'],
      transmission_time: headers['paypal-transmission-time'],
      cert_url: headers['paypal-cert-url'],
      auth_algo: headers['paypal-auth-algo'],
      transmission_sig: headers['paypal-transmission-sig'],
      webhook_id: cfg.webhookId,
      webhook_event: body
    };

    const resp = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error('PayPal webhook signature verification failed');
    }

    const json = await resp.json();
    return json.verification_status === 'SUCCESS';
  }
}