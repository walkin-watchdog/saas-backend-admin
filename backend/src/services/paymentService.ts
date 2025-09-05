import Razorpay from 'razorpay';
import { GatewayCredentialResolver } from './gatewayCredentialResolver';
import crypto from 'crypto';

export interface PaymentOrder {
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

export class PaymentService {
  private static async razorpayClient(tenantId: string) {
    const creds = await GatewayCredentialResolver('tenant', tenantId);
    return new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
  }

  static async createOrder(tenantId: string, data: PaymentOrder) {
    const client = await this.razorpayClient(tenantId);
    const options = {
      amount: Math.round(data.amount * 100),
      currency: data.currency || 'INR',
      receipt: data.receipt || `receipt_${Date.now()}`,
      notes: data.notes || {},
    };
    return client.orders.create(options);
  }

  static async getPaymentDetails(tenantId: string, paymentId: string) {
    const client = await this.razorpayClient(tenantId);
    return client.payments.fetch(paymentId);
  }

  static async capturePayment(tenantId: string, paymentId: string, amount: number, currency = 'INR') {
    const client = await this.razorpayClient(tenantId);
    return client.payments.capture(paymentId, Math.round(amount * 100), currency);
  }

  static async refundPayment(tenantId: string, paymentId: string, amount?: number) {
    const client = await this.razorpayClient(tenantId);
    const payload: any = { payment_id: paymentId };
    if (amount !== undefined) payload.amount = Math.round(amount * 100);
    return client.payments.refund(paymentId, payload);
  }

  static async getPublicKeyId(tenantId: string): Promise<string> {
    const creds = await GatewayCredentialResolver('tenant', tenantId);
    return creds.keyId;
  }

  static async verifyPaymentSignature(tenantId: string, data: VerifyPaymentData): Promise<boolean> {
    const creds = await GatewayCredentialResolver('tenant', tenantId);
    const body = `${data.razorpay_order_id}|${data.razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', creds.keySecret).update(body).digest('hex');
    return expected === data.razorpay_signature;
  }

  static async verifyWebhookSignature(
    tenantId: string,
    body: Buffer | string,
    signature: string
  ): Promise<boolean> {
    const creds = await GatewayCredentialResolver('tenant', tenantId);
    const secret = creds.webhookSecret || '';
    const payload = body instanceof Buffer ? body.toString('utf8') : body;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
  }
}