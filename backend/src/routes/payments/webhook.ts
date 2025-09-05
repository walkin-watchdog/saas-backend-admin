import express from 'express';
import { PaymentService } from '../../services/paymentService';
import { PayPalService } from '../../services/paypalService';
import { EmailService } from '../../services/emailService';
import { sendBookingVoucher } from '../payments';
import { PaymentDbService } from '../../services/paymentDbService';
import { BookingService } from '../../services/bookingService';
import { TenantService } from '../../services/tenantService';
import bodyParser from 'body-parser';
import { WebhookMonitorService } from '../../services/webhookMonitorService';
import { SubscriptionService } from '../../services/subscriptionService';

const router = express.Router();
const WEBHOOK_TOLERANCE_SEC = Number(process.env.WEBHOOK_TOLERANCE_SEC || 300); // 5 min

// Helper to resolve tenant for webhook
const resolveTenantForWebhook = async (req: express.Request): Promise<any> => {
  // Try to resolve tenant from domain or other identifiers
  const origin = req.headers.origin || req.headers.host;
  if (origin) {
    try {
      return await TenantService.fromOriginOrApiKey(req);
    } catch {
      // Fallback to default tenant for webhooks
      return await TenantService.getOrCreateDefaultTenant();
    }
  }
  
  // Fallback to default tenant
  return await TenantService.getOrCreateDefaultTenant();
};
// Razorpay webhook
router.post('/razorpay', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  try {
    
    const sig = req.headers['x-razorpay-signature'] as string | undefined;
    if (!sig) {
      res.sendStatus(400);
      return;
    }
    const tenant = await resolveTenantForWebhook(req);
    let verified = false;
    await TenantService.withTenantContext(tenant, async () => {
      verified = await PaymentService.verifyWebhookSignature(tenant.id, req.body, sig);
    });
    if (!verified) {
      res.sendStatus(400);
      return;
    }
    
    const rawPayload = req.body.toString();
    const event = JSON.parse(rawPayload);
    const rec = await WebhookMonitorService.recordDelivery('razorpay', event.id, rawPayload);
    if (rec.duplicate && rec.status === 'processed') {
      return res.sendStatus(200);
    }
    await SubscriptionService.recordWebhook('razorpay', event.id, rawPayload);
    // Timestamp tolerance (use top-level created_at or nested payment/order entity timestamps)
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const evtSec = Number(event?.created_at);
      if (Number.isFinite(evtSec)) {
        if (Math.abs(nowSec - evtSec) > WEBHOOK_TOLERANCE_SEC) {
          return res.status(400).json({ error: 'stale_webhook' });
        }
      }
    } catch {
      return res.status(400).json({ error: 'stale_webhook' });
    }
    let tenantFromMeta = null as any;
    const pNotes = event?.payload?.payment?.entity?.notes;
    const oNotes = event?.payload?.order?.entity?.notes;
    const metaTenantId = (pNotes && (pNotes.tenantId || pNotes['tenantId'])) ||
                         (oNotes && (oNotes.tenantId || oNotes['tenantId']));
    if (metaTenantId) {
      tenantFromMeta = await TenantService.getTenantById(String(metaTenantId));
    }
    const effectiveTenant = tenantFromMeta || tenant;

    if (event.event === 'payment.captured') {
      await TenantService.withTenantContext(effectiveTenant, async (tenantPrisma) => {
        const p = event.payload.payment.entity;
        await PaymentDbService.upsertPayment(
          { tenantId_razorpayOrderId: { tenantId: effectiveTenant.id, razorpayOrderId: p.order_id } },
          {
            bookingId: p.notes?.bookingId,
            razorpayOrderId: p.order_id,
            razorpayPaymentId: p.id,
            amount: p.amount / 100,
            status: 'PAID',
            paymentMethod: 'Razorpay',
            currency: p.currency || 'INR',
          },
          {
            razorpayPaymentId: p.id,
            status: 'PAID',
            paymentMethod: 'Razorpay',
          }
        );
        
        if (p.notes?.bookingId) {
          const booking = await BookingService.findBooking(
            { id: p.notes.bookingId },
            { include: { product: true } }
          );
          const isFull = (booking?.product as any)?.paymentType === 'FULL';

          const updatedBooking = await BookingService.updateBooking(p.notes.bookingId, {
            status: 'CONFIRMED',
            paymentStatus: isFull ? 'PAID' : 'PARTIAL',
            partialPaymentAmount: isFull ? undefined : (p.amount / 100)
          });
          
          const bookingWithRelations = await BookingService.findBooking(
            { id: p.notes.bookingId },
            { include: { product: true, package: true, slot: true } }
          );
          
          if (bookingWithRelations) {
            await EmailService.sendPaymentConfirmation(
              bookingWithRelations,
              { amount: p.amount / 100, paymentMethod: 'Razorpay', razorpayPaymentId: p.id },
              bookingWithRelations.product as any
            );
            await sendBookingVoucher(bookingWithRelations);
          }
        }
      });
      await WebhookMonitorService.markProcessed('razorpay', event.id);
    }
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    try {
      const event = (() => { try { return JSON.parse(req.body.toString()); } catch { return { id: 'unknown' }; } })();
      await WebhookMonitorService.markFailed('razorpay', event.id, (err as Error).message);
    } catch {}
    res.sendStatus(500);
    return;
  }
  res.sendStatus(200);
});

// PayPal Webhook
router.post('/paypal', bodyParser.json(), async (req, res) => {
  const tenant = await resolveTenantForWebhook(req);
  let verified = false;
  try {
    await TenantService.withTenantContext(tenant, async () => {
      verified = await PayPalService.verifyWebhookSignature(
        req.headers as any,
        req.body,
        { scope: 'tenant', tenantId: tenant.id }
      );
    });
  } catch {
    return res.sendStatus(400);
  }
  if (!verified) {
    return res.sendStatus(400);
  }
  try {
    const payload = JSON.stringify(req.body);
    const rec = await WebhookMonitorService.recordDelivery('paypal', req.body.id || req.body.event_id || 'unknown', payload);
    if (rec.duplicate && rec.status === 'processed') {
      return res.sendStatus(200);
    }
    await SubscriptionService.recordWebhook('paypal', req.body.id || req.body.event_id || 'unknown', payload);
    // Timestamp tolerance from PayPal header enforced only when header present
    const hdr = (req.headers['paypal-transmission-time'] || req.headers['PayPal-Transmission-Time']) as string | undefined;
    if (hdr) {
      const ts = Date.parse(hdr);
      if (Number.isFinite(ts)) {
        const skew = Math.abs(Date.now() - ts) / 1000;
        if (skew > WEBHOOK_TOLERANCE_SEC) {
          return res.status(400).json({ error: 'stale_webhook' });
        }
      }
    }
    const event = req.body;
    // Extract tenant from resource.custom_id or purchase_units[0].custom_id
    // PayPal sample webhook shows resource.custom_id present on PAYMENT.CAPTURE.COMPLETED.
    // https://developer.paypal.com/docs/multiparty/checkout/apm/eps/orders-api/
    let matchedTenant = null as any;
    let bookingIdFromCustom: string | undefined;
    const customIdRaw =
      event?.resource?.custom_id ||
      event?.resource?.purchase_units?.[0]?.custom_id;
    if (typeof customIdRaw === 'string' && customIdRaw.includes('::')) {
      const [tenantIdPart, bookingIdPart] = customIdRaw.split('::');
      const maybeTenant = await TenantService.getTenantById(tenantIdPart);
      if (maybeTenant) {
        matchedTenant = maybeTenant;
        bookingIdFromCustom = bookingIdPart;
      }
    }
    if (!matchedTenant) {
      matchedTenant = tenant
    }

    await TenantService.withTenantContext(matchedTenant, async (tenantPrisma) => {
      if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      } else if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const cap = event.resource;
        if (bookingIdFromCustom) cap.custom_id = bookingIdFromCustom;
        const paid = Number(cap.amount.value);
        await PaymentDbService.upsertPayment(
          { tenantId_paypalOrderId: { tenantId: matchedTenant.id, paypalOrderId: cap.supplementary_data.related_ids.order_id } },
          {
            bookingId: cap.custom_id,
            paypalOrderId: cap.supplementary_data.related_ids.order_id,
            paypalCaptureId: cap.id,
            amount: paid,
            status: 'PAID',
            paymentMethod: 'PayPal',
          },
          {
            paypalCaptureId: cap.id,
            status: 'PAID',
            paymentMethod: 'PayPal',
          }
        );

        if (cap.custom_id) {
          const booking = await BookingService.findBooking(
            { id: cap.custom_id },
            { include: { product: true } }
          );
          const isFull = (booking?.product as any)?.paymentType === 'FULL';

          const updatedBooking = await BookingService.updateBooking(cap.custom_id, {
            status: 'CONFIRMED',
            paymentStatus: isFull ? 'PAID' : 'PARTIAL',
            partialPaymentAmount: isFull ? undefined : paid
          });
          
          const bookingWithRelations = await BookingService.findBooking(
            { id: cap.custom_id },
            { include: { product: true, package: true, slot: true } }
          );

          if (bookingWithRelations) {
            await EmailService.sendPaymentConfirmation(
              bookingWithRelations,
              { amount: paid, paymentMethod: 'PayPal', paypalCaptureId: cap.id },
              bookingWithRelations.product as any
            );
            await sendBookingVoucher(bookingWithRelations);
          }
        }
      }
    });
    await WebhookMonitorService.markProcessed('paypal', event.id || event.event_id);
  } catch (err) {
    console.error('PayPal webhook error:', err);
    try {
      await WebhookMonitorService.markFailed('paypal', req.body.id || req.body.event_id || 'unknown', (err as Error).message);
    } catch {}
    return res.sendStatus(500);
  }
  res.sendStatus(200);
});

export default router;