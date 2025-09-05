import express from 'express';
import { z } from 'zod';
import { PaymentService } from '../services/paymentService';
import { EmailService } from '../services/emailService';
import { PDFService } from '../services/pdfService';
import { idempotency } from '../middleware/idempotency';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';
import { HubSpotService } from '../services/hubspotService';
import { BookingService } from '../services/bookingService';
import { PaymentDbService } from '../services/paymentDbService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();


const createOrderSchema = z.object({
  bookingId: z.string(),
  amount: z.number().min(1),
  currency: z.string().optional(),
});

const verifyPaymentSchema = z.object({
  bookingId: z.string(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

// Create Razorpay order
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

    const order = await PaymentService.createOrder(req.tenantId!, {
      amount,
      currency,
      receipt: `booking_${booking.bookingCode}`,
      notes: {
        tenantId: req.tenantId!,
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        productTitle: (booking.product as any)?.title,
      },
    });
    
    const idempKey = req.header('Idempotency-Key') || undefined;
    await PaymentDbService.upsertPayment(
      { tenantId_razorpayOrderId: { tenantId: req.tenantId!, razorpayOrderId: order.id } },
      {
        bookingId: booking.id,
        razorpayOrderId: order.id,
        amount,
        currency: booking?.currency || 'INR',
        status: 'PENDING',
        idempotencyKey: idempKey,
      },
      {
        amount,
        status: 'PENDING',
        idempotencyKey: idempKey,
      }
    );
    const publicKey = await PaymentService.getPublicKeyId(req.tenantId!);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: publicKey,
    });
  } catch (error) {
    logger.error('Razorpay create-order failed', { error, body: req.body });
    logger.error('OPS_ALERT: create-order failure');
    next(error);
  }
});

// Verify payment
router.post('/verify', idempotency, async (req: TenantRequest, res, next) => {
  try {
    const paymentData = verifyPaymentSchema.parse(req.body);
    
    const isValidSignature = await PaymentService.verifyPaymentSignature(req.tenantId!, paymentData);
    
    if (!isValidSignature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const booking = await BookingService.findBooking(
      { id: paymentData.bookingId },
      { include: { product: true } }
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const fetched = await PaymentService.getPaymentDetails(req.tenantId!, paymentData.razorpay_payment_id);
    const idempKey = req.header('Idempotency-Key') || undefined;
    await PaymentDbService.upsertPayment(
      { tenantId_razorpayOrderId: { tenantId: req.tenantId!, razorpayOrderId: paymentData.razorpay_order_id } },
      {
        bookingId: booking.id,
        razorpayOrderId: paymentData.razorpay_order_id,
        razorpayPaymentId: paymentData.razorpay_payment_id,
        amount: Number(fetched.amount) / 100,
        status: 'PAID',
        paymentMethod: 'Razorpay',
        idempotencyKey: idempKey,
      },
      {
        razorpayPaymentId: paymentData.razorpay_payment_id,
        amount: Number(fetched.amount) / 100,
        status: 'PAID',
        idempotencyKey: idempKey,
      }
    );

    await PaymentDbService.updatePaymentByRazorpayOrderId(paymentData.razorpay_order_id, {
        razorpayPaymentId: paymentData.razorpay_payment_id,
        status: 'PAID',
        amount: Number(fetched.amount) / 100,
    });

    const paymentRecord = await PaymentDbService.findFirstPayment({
      where: {
        bookingId: booking.id,
        razorpayOrderId: paymentData.razorpay_order_id,
      },
      select: { amount: true },
    });

    const product = booking.product as any;
    const isPartialPayment = product?.paymentType !== 'FULL';

    // Update booking status
    const updatedBooking = await BookingService.updateBooking(booking.id, {
        status: 'CONFIRMED',
        paymentStatus: isPartialPayment ? 'PARTIAL' : 'PAID',
        partialPaymentAmount: isPartialPayment ? paymentRecord?.amount ?? 0 : undefined,
    });

    const bookingWithRelations = await BookingService.findBooking(
      { id: booking.id },
      {
        include: {
        product: true,
        package: true,
        slot: true
        }
      }
    );

    // Send confirmation emails
    const paidAmount = paymentRecord?.amount ?? updatedBooking.totalAmount;
    if (bookingWithRelations) {
      await EmailService.sendPaymentConfirmation(bookingWithRelations, {
        amount: paidAmount,
        paymentMethod: 'Razorpay',
        razorpayPaymentId: paymentData.razorpay_payment_id,
      }, bookingWithRelations.product as any);
    }

    // Generate and send voucher
    if (bookingWithRelations) {
      await sendBookingVoucher(bookingWithRelations);
      try {
        const existed = !!(await HubSpotService.getContactByEmail(bookingWithRelations.customerEmail));
        const contact = await HubSpotService.ensureContact({
          email: bookingWithRelations.customerEmail,
          name:  bookingWithRelations.customerName,
          phone: bookingWithRelations.customerPhone,
        });
        const productRelation = bookingWithRelations.product as any;
        await HubSpotService.createDealForContact({
          contactId:  contact.id,
          dealName:   `Closed Won – ${bookingWithRelations.bookingCode} – ${productRelation?.title}`,
          stageLabel: 'Closed Won',
          dealType:   existed ? 'existingbusiness' : 'newbusiness',
          amount:     bookingWithRelations.totalAmount,
          properties: {
            bookingCode: bookingWithRelations.bookingCode,
            productCode: productRelation?.productCode,
            paymentId: paymentData.razorpay_payment_id,
            paymentAmount: paidAmount,
            currency: bookingWithRelations.currency,
            paymentMethod: 'Razorpay',
            bookingDate: bookingWithRelations.bookingDate,
            adults: bookingWithRelations.adults,
            children: bookingWithRelations.children
          }
        });
      } catch (e) {
        logger.error('HubSpot sync (paid) failed', { error: (e as Error).message });
      }
    }

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    logger.error('Payment verification failed', { error, body: req.body });
    logger.error('OPS_ALERT: payment verify failure');
    next(error);
  }
});

// Get payment details
router.get('/:paymentId', authenticate, authorize(['ADMIN', 'EDITOR', 'VIEWER']), async (req: TenantRequest, res, next) => {
  try {
    const payment = await PaymentDbService.findPayment(
      { id: req.params.paymentId },
      {
        booking: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                productCode: true,
              },
            },
          },
        },
      }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

// Process refund
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
            product: true
          }
        }
      }
    );

    if (!payment || !payment.razorpayPaymentId) {
      return res.status(404).json({ error: 'Payment not found or not processed' });
    }

    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    // Calculate refund amount based on cancellation policy if not specified
    let refundAmount = amount || payment.amount;
    
    if (!amount && payment.booking && (payment.booking as any).product) {
      const product = (payment.booking as any).product;
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
      if (product.cancellationPolicyType && Array.isArray(product.cancellationTerms)) {
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
      await BookingService.updateBooking(payment.bookingId, {
        status: 'CANCELLED'
      });
      return res.json({ success: true, calculatedAmount: 0 });
    }

    const refund = await PaymentService.refundPayment(
      req.tenantId!,
      payment.razorpayPaymentId,
      refundAmount
    );

    // Update payment status
    await PaymentDbService.updatePayment(payment.id, { 
        status: 'REFUNDED'
    });

    // Update booking status
    await BookingService.updateBooking(payment.bookingId, { 
        status: 'CANCELLED'
    });

    logger.info('Refund processed successfully', {
      paymentId: payment.id,
      refundId: refund.id,
      amount: refund.amount,
      reason: reason || 'Manual refund',
      calculatedAmount: refundAmount,
      policyType: (payment.booking as any)?.product?.cancellationPolicyType
    });

    res.json({ success: true, refund, calculatedAmount: refundAmount });
  } catch (error) {
    logger.error('Refund processing failed', { error, paymentId: req.params.paymentId });
    logger.error('OPS_ALERT: refund failure');
    next(error);
  }
});

// Helper function to send booking voucher
export const sendBookingVoucher = async (booking: any) => {
  // Generate PDF voucher
  const voucherPDF = await PDFService.generateBookingVoucher({
    booking,
    product: booking.product,
    customer: {
      name: booking.customerName,
      email: booking.customerEmail,
      phone: booking.customerPhone,
    },
    packageDetails: booking.package,
    timeSlot: booking.selectedTimeSlot,
    currency: booking.package?.currency || booking.currency || 'INR',
  });

  // Send email with voucher attachment
  await EmailService.sendEmail({
    to: booking.customerEmail,
    subject: `Booking Voucher - ${booking.bookingCode}`,
    template: 'voucher',
    context: {
      customerName: booking.customerName,
      bookingCode: booking.bookingCode,
      productTitle: booking.product.title,
      bookingDate: new Date(booking.bookingDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      adults: booking.adults,
      children: booking.children,
      packageName: booking.package?.name || 'Standard Package',
      amountPaid: (booking.paymentStatus === 'PAID'
                   ? booking.totalAmount
                   : booking.paymentStatus === 'PARTIAL'
                     ? booking.partialPaymentAmount
                     : null),
      timeSlot: booking.selectedTimeSlot || 'As per confirmation'
    },
    attachments: [
      {
        filename: `voucher-${booking.bookingCode}.pdf`,
        content: voucherPDF,
        contentType: 'application/pdf',
      },
    ],
  });

  logger.info(`Voucher sent successfully for booking ${booking.id}`);
  return true;
};

export default router;