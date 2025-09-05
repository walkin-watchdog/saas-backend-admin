import express from 'express';
import { z } from 'zod';
import { PayPalService } from '../services/paypalService';
import { PaymentDbService } from '../services/paymentDbService';
import { BookingService } from '../services/bookingService';
import { idempotency } from '../middleware/idempotency';
import { EmailService } from '../services/emailService';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendBookingVoucher } from './payments';
import { HubSpotService } from '../services/hubspotService';
import { TenantRequest } from '../middleware/tenantMiddleware';
import { TenantConfigService } from '../services/tenantConfigService';

const router = express.Router();


const createOrderSchema = z.object({
  bookingId: z.string(),
  amount: z.number().min(1),
  currency: z.string().optional(),
});

const captureOrderSchema = z.object({
  bookingId: z.string(),
  orderId: z.string(),
});

// Create PayPal order
router.post('/create-order', idempotency, async (req: TenantRequest, res, next) => {
  try {
    const { bookingId, amount, currency } = createOrderSchema.parse(req.body);
    
    const booking = await BookingService.findBooking(
      { id: bookingId },
      { include: { product: true } }
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Payment already completed' });
    }
    
    const brandCfg   = req.tenantId ? await TenantConfigService.getConfig<any>(req.tenantId, 'companyName').catch(()=>null) : null;
    const brandName = typeof brandCfg === 'string' ? brandCfg : brandCfg?.companyName;

    const order = await PayPalService.createOrder({
      amount,
      currency,
      description: `${brandName} - ${(booking.product as any)?.title}`,
      reference: booking.bookingCode,
      bookingId: booking.id,
      tenantId: req.tenantId!,
    });

    const idempKey = req.header('Idempotency-Key') || undefined;
    // Save order ID to payment record
    await PaymentDbService.upsertPayment(
      { tenantId_paypalOrderId: { tenantId: req.tenantId!, paypalOrderId: order.id } },
      {
        bookingId: booking.id,
        paypalOrderId: order.id,
        amount,
        currency: booking.currency,
        status: 'PENDING',
        paymentMethod: 'PayPal',
        idempotencyKey: idempKey,
      },
      {
        amount,
        status: 'PENDING',
        idempotencyKey: idempKey,
      }
    );

    res.json({
      orderId: order.id,
      approvalUrl: order.links.find((link: any) => link.rel === 'approve')?.href,
      currency,
    });
  } catch (error) {
    logger.error('PayPal create-order failed', { error, body: req.body });
    logger.error('OPS_ALERT: PayPal create-order failure');
    next(error);
  }
});

// Capture PayPal payment
router.post('/capture', idempotency, async (req: TenantRequest, res, next) => {
  try {
    const { bookingId, orderId } = captureOrderSchema.parse(req.body);
    
    const booking = await BookingService.findBooking(
      { id: bookingId },
      { include: { product: true } }
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const captureResult = await PayPalService.captureOrder({ orderId });
    
    // Check if capture was successful
    if (captureResult.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment capture failed' });
    }

    const captureId = captureResult.purchase_units[0].payments.captures[0].id;
    const idempKey = req.header('Idempotency-Key') || undefined;

    const paymentRecord = await PaymentDbService.findFirstPayment({
      where: {
        bookingId: booking.id,
        paypalOrderId: orderId,
      },
      select: { amount: true },
    });
    
    // Update payment record
    await PaymentDbService.upsertPayment(
      { tenantId_paypalOrderId: { tenantId: req.tenantId!, paypalOrderId: orderId } },
      {
        bookingId: booking.id,
        paypalOrderId: orderId,
        paypalCaptureId: captureId,
        amount: paymentRecord?.amount ?? Number(captureResult.purchase_units[0].payments.captures[0].amount.value),
        status: 'PAID',
        paymentMethod: 'PayPal',
        idempotencyKey: idempKey,
      },
      {
        paypalCaptureId: captureId,
        amount:          paymentRecord?.amount ?? Number(captureResult.purchase_units[0].payments.captures[0].amount.value),
        status: 'PAID',
        idempotencyKey: idempKey,
      }
    );

    // Update booking status
    await BookingService.updateBooking(booking.id, {
        status: 'CONFIRMED',
        paymentStatus: (booking.product as any)?.paymentType === 'FULL' ? 'PAID' : 'PARTIAL',
        partialPaymentAmount:
          (booking.product as any)?.paymentType === 'FULL' ? undefined : paymentRecord?.amount ?? 0,
    });

    const paypalPayment = await PaymentDbService.findFirstPayment({
      where: {
        bookingId:    booking.id,
        paypalOrderId: orderId
      },
      select: { amount: true }
    });
    const paidAmount = paypalPayment?.amount ?? booking.totalAmount;

    // Send confirmation emails
    await EmailService.sendPaymentConfirmation(booking, {
      amount: paidAmount,
      paymentMethod: 'PayPal',
      paypalCaptureId: captureId,
    }, booking.product);

    // Generate and send voucher
    const updatedBooking = await BookingService.findBooking(
      { id: booking.id },
      { include: { product: true, package: true, slot: true } }
    );
    if (updatedBooking) {
      await sendBookingVoucher(updatedBooking);

      try {
        const existed = !!(await HubSpotService.getContactByEmail(updatedBooking.customerEmail));
        const contact = await HubSpotService.ensureContact({
          email: updatedBooking.customerEmail,
          name:  updatedBooking.customerName,
          phone: updatedBooking.customerPhone,
        });
        await HubSpotService.createDealForContact({
          contactId:  contact.id,
          dealName:   `Closed Won – ${updatedBooking.bookingCode} – ${(updatedBooking.product as any)?.title}`,
          stageLabel: 'Closed Won',
          dealType:   existed ? 'existingbusiness' : 'newbusiness',
          amount:     updatedBooking.totalAmount,
          properties: {
            bookingCode: updatedBooking.bookingCode,
            productCode: (updatedBooking.product as any)?.productCode,
            paymentAmount: paidAmount,
            currency: updatedBooking.currency,
            paymentMethod: 'Paypal',
            bookingDate: updatedBooking.bookingDate,
            adults: updatedBooking.adults,
            children: updatedBooking.children
          }
        });
      } catch (e) {
        logger.error('HubSpot sync (paid) failed', { error: (e as Error).message });
      }
    }

    res.json({ 
      success: true, 
      message: 'Payment captured successfully',
      captureId 
    });
  } catch (error) {
    logger.error('PayPal capture failed', { error, body: req.body });
    logger.error('OPS_ALERT: PayPal capture failure');
    next(error);
  }
});

// Get PayPal order details
router.get('/order/:orderId', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const { orderId } = req.params;
    const orderDetails = await PayPalService.getOrderDetails(orderId);
    res.json(orderDetails);
  } catch (error) {
    next(error);
  }
});

// Process PayPal refund
router.post('/:paymentId/refund', authenticate, authorize(['ADMIN']), idempotency, async (req: TenantRequest, res, next) => {
  try {
    const { amount, reason } = z.object({
      amount: z.number().min(1).optional(),
      reason: z.string().optional()
    }).parse(req.body);

    const payment = await PaymentDbService.findPayment(
      { id: req.params.paymentId },
      { 
        booking: {
          include: {
            product: true,
            package: true
          }
        }
      }
    );

    if (!payment || !payment.paypalCaptureId || payment.paymentMethod !== 'PayPal') {
      return res.status(404).json({ error: 'PayPal payment not found' });
    }

    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    // Calculate refund amount based on cancellation policy if not specified
    let refundAmount = amount || payment.amount;
    const product = (payment.booking as any)?.product;
    
    if (!amount && product) {
      const bookingDate = new Date((payment.booking as any).bookingDate);
      const now = new Date();
      const hoursUntilBooking = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Define type for cancellation term
      type CancellationTerm = {
        timeframe: string;
        refundPercent: number;
        [key: string]: any;
      };

      // Apply cancellation policy logic
      if (product.cancellationPolicyType && product.cancellationTerms) {
        // Find applicable cancellation term
        const applicableTerm = (product.cancellationTerms as CancellationTerm[]).find((term) => {
          // This is simplified - you'd want more sophisticated time parsing
          if (typeof term.timeframe === 'string' && term.timeframe.includes('24+ hours') && hoursUntilBooking >= 24) return true;
          if (typeof term.timeframe === 'string' && term.timeframe.includes('7+ days') && hoursUntilBooking >= 168) return true;
          if (typeof term.timeframe === 'string' && term.timeframe.includes('4+ days') && hoursUntilBooking >= 96) return true;
          if (typeof term.timeframe === 'string' && term.timeframe.includes('3-6 days') && hoursUntilBooking >= 72 && hoursUntilBooking < 144) return true;
          return false;
        });
        
        if (applicableTerm && typeof applicableTerm.refundPercent === 'number') {
          refundAmount = payment.amount * (applicableTerm.refundPercent / 100);
        }
      } else {
        // Fallback to simple policy
        if (product.freeCancellationHours && hoursUntilBooking >= product.freeCancellationHours) {
          refundAmount = payment.amount; // Full refund
        } else if (product.noRefundAfterHours && hoursUntilBooking < product.noRefundAfterHours) {
          refundAmount = 0; // No refund
        } else if (product.partialRefundPercent) {
          refundAmount = payment.amount * (product.partialRefundPercent / 100);
        }
      }
    }

    if (refundAmount === 0) {
      await BookingService.updateBooking(payment.bookingId, { status: 'CANCELLED' });
      return res.json({ success: true, calculatedAmount: 0 });
    }

    const refund = await PayPalService.refundPayment(
      payment.paypalCaptureId,
      refundAmount,
      (payment.booking as any)?.package?.currency || (payment.booking as any)?.currency || 'USD'
    );

    // Update payment status
    await PaymentDbService.updatePayment(payment.id, { 
        status: refundAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    });

    // Update booking status
    await BookingService.updateBooking(payment.bookingId, { 
        status: refundAmount >= payment.amount ? 'CANCELLED' : 'PARTIALLY_REFUNDED'
    });

    logger.info('PayPal refund processed successfully', {
      paymentId: payment.id,
      refundId: refund.id,
      amount: refund.amount,
      reason: reason || 'Manual refund',
      calculatedAmount: refundAmount,
      policyType: (payment.booking as any)?.product?.cancellationPolicyType
    });

    res.json({ success: true, refund, calculatedAmount: refundAmount });
  } catch (error) {
    logger.error('PayPal refund failed', { error, paymentId: req.params.paymentId });
    logger.error('OPS_ALERT: PayPal refund failure');
    next(error);
  }
});

export default router;