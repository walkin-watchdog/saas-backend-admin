import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getTenantId } from '../middleware/tenantMiddleware';
import { externalCall } from '../utils/externalAdapter';
import { GatewayCredentialResolver } from './gatewayCredentialResolver';

type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret?: string };

export interface CreateOrderData {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: any;
}

export interface VerifyPaymentData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export class RazorpayService {
  private static async loadConfig(): Promise<RazorpayConfig> {
    const tenantId = getTenantId();
    const scope = tenantId ? 'tenant' : 'platform';
    const creds = await GatewayCredentialResolver(scope as any, tenantId);
    return {
      keyId: creds.keyId,
      keySecret: creds.keySecret,
      webhookSecret: creds.webhookSecret
    };
  }

  private static async getClient() {
    const cfg = await this.loadConfig();
    return new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  }

  static async getPublicKeyId(): Promise<string | undefined> {
    const cfg = await this.loadConfig();
    return cfg.keyId;
  }

  static async createOrder(data: CreateOrderData) {
    try {
      const razorpay = await this.getClient();
      const options = {
        amount: Math.round(data.amount * 100),
        currency: data.currency || 'INR',
        receipt: data.receipt || `receipt_${Date.now()}`,
        notes: data.notes || {},
      };

      const order = await externalCall('razorpay', (_s) => razorpay.orders.create(options));
      logger.info('Razorpay order created:', { orderId: order.id, amount: order.amount });
      
      return order;
    } catch (error) {
      logger.error('Error creating Razorpay order:', error);
      throw new Error('Failed to create payment order');
    }
  }

  static async getPaymentDetails(paymentId: string) {
    try {
      const razorpay = await this.getClient();
      const payment = await externalCall('razorpay', (_s) => razorpay.payments.fetch(paymentId));
      return payment;
    } catch (error) {
      logger.error('Error fetching payment details:', error);
      throw new Error('Failed to fetch payment details');
    }
  }

  static async refundPayment(paymentId: string, amount?: number) {
    try {
      const razorpay = await this.getClient();
      const refundData: any = { payment_id: paymentId };
      if (amount !== undefined) {
        refundData.amount = Math.round(amount * 100);
      }

      const refund = await externalCall('razorpay', (_s) => razorpay.payments.refund(paymentId, refundData));
      logger.info('Refund processed:', { refundId: refund.id, paymentId });
      
      return refund;
    } catch (error) {
      logger.error('Error processing refund:', error);
      throw new Error('Failed to process refund');
    }
  }

  static async verifyPaymentSignatureAsync(data: VerifyPaymentData): Promise<boolean> {
    const cfg = await this.loadConfig();
    const body = data.razorpay_order_id + '|' + data.razorpay_payment_id;
    const expected = crypto.createHmac('sha256', cfg.keySecret).update(body).digest('hex');
    return expected === data.razorpay_signature;
  }


  static verifyWebhookSignature(body: Buffer | string, signature: string): boolean {
    try {
      const secret = process.env.RAZORPAY_PLATFORM_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET!;
      const payload = body instanceof Buffer ? body.toString('utf8') : body
      const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      return expected === signature
    } catch (err) {
      logger.error('Error verifying webhook signature:', err)
      return false
    }
  }

  static async verifyWebhookSignatureAsync(body: Buffer | string, signature: string): Promise<boolean> {
    const cfg = await this.loadConfig();
    const secret = cfg.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const payload = body instanceof Buffer ? body.toString('utf8') : body;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
  }
}