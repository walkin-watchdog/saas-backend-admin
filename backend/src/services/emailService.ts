import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { TemplateLoader } from '../utils/templateLoader';
import { TenantConfigService } from './tenantConfigService';
import { PDFService } from '../services/pdfService';
import { logger } from '../utils/logger';
import { getTenantPrisma, getTenantId } from '../middleware/tenantMiddleware';
import { externalCall } from '../utils/externalAdapter';
import { SMTPConfig } from '../types/tenantConfig';
import { generateInvoicePdf } from './invoiceGenerator';

// Currency symbol mapping
const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'AUD': 'A$',
    'CAD': 'C$',
    'JPY': '¥',
    'SGD': 'S$',
    'AED': 'AED ',
    'CNY': '¥',
  };
  return symbols[currency?.toUpperCase()] || currency + ' ';
};

// Create transporter with tenant-specific SMTP config
// For tenant scope, environment fallbacks are not permitted. Platform scope may
// still use environment variables for backwards compatibility.
async function createTransporter(tenantId: string) {
  let smtpConfig: SMTPConfig | null = null;
  try {
    smtpConfig = await TenantConfigService.getConfig<SMTPConfig>(tenantId, 'smtp');
  } catch (error) {
    logger.warn('Failed to load tenant SMTP config', { tenantId, error });
  }

  if (smtpConfig?.host && smtpConfig.user && smtpConfig.pass && smtpConfig.from) {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });
    return { transporter, from: smtpConfig.from };
  }

  if (tenantId === 'platform') {
    const smtpPort = parseInt(process.env.EMAIL_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: smtpPort,
      secure: process.env.EMAIL_SECURE
        ? process.env.EMAIL_SECURE === 'true'
        : (process.env.EMAIL_PORT === '465' || smtpPort === 465),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    return { transporter, from: process.env.EMAIL_FROM || '' };
  }

  const err: any = new Error('SMTP configuration missing');
  err.code = 'SMTP_CONFIG_MISSING';
  throw err;
}

const sanitize = handlebars.escapeExpression;
handlebars.registerHelper('sanitize', (context: unknown) =>
  handlebars.escapeExpression(String(context ?? ''))
);

export interface EmailData {
  to: string | string[];
  subject: string;
  template?: string;
  context?: any;
  html?: string;
  text?: string;
  attachments?: any[];
  /** Optional explicit tenant context for platform emails */
  tenantId?: string;
}

export class EmailService {
  static async sendEmail(data: EmailData) {
    try {
      const tenantId = data.tenantId || getTenantId();
      if (!tenantId) {
        throw new Error('Tenant context is required for sending emails');
      }

      const { transporter, from } = await createTransporter(tenantId);
      let html = data.html;
      
      if (data.template) {
        const rendered = await TemplateLoader.renderTemplate(data.template, {
          tenantId,
          ...(data.context || {})
        });
        
        if (rendered) {
          html = rendered;
        } else {
          // Fallback to original template loading
          const templatePath = path.resolve(
            process.cwd(),
            'src',
            'templates',
            `${data.template}.hbs`
          );

          if (fs.existsSync(templatePath)) {
            const templateSource = fs.readFileSync(templatePath, 'utf8');
            const template = handlebars.compile(templateSource);
            
            // Get branding for fallback
            const branding = await TemplateLoader.getTenantBranding(tenantId);
            html = template({ ...(data.context || {}), ...branding });
          }
        }
      }

      const mailOptions = {
        from,
        to: Array.isArray(data.to) ? data.to.join(', ') : data.to,
        subject: data.subject,
        html,
        text: data.text,
        attachments: data.attachments,
      };

      const result: any = await externalCall('smtp', (_s) => transporter.sendMail(mailOptions));
      logger.info('Email sent successfully:', { messageId: result.messageId, to: data.to });
      
      return result as any;
    } catch (error: any) {
      logger.error('Error sending email:', error);
      if (error?.code) {
        throw error;
      }
      throw new Error('Failed to send email');
    }
  }

  static async sendInvoiceEmail(invoice: any, recipient: string) {
    if (!recipient) {
      throw new Error('Recipient email required for invoice email');
    }
    const tenantId = invoice.tenantId || getTenantId();
    if (!tenantId) throw new Error('Tenant context is required for sending invoices');

    const pdf = await generateInvoicePdf(invoice, invoice.subscription?.plan);

    await this.sendEmail({
      to: recipient,
      subject: `Invoice ${invoice.number}`,
      text: 'Please find your invoice attached.',
      attachments: [
        {
          filename: `invoice-${invoice.number}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
      tenantId,
    });
  }

  static async sendBookingConfirmation(booking: any, product: any) {
    const currency = booking.package?.currency || booking.currency || 'INR';
    const currencySymbol = getCurrencySymbol(currency);
    const tenantId = getTenantId();
    
    if (!tenantId) {
      throw new Error('Tenant context is required for sending booking confirmation');
    }

    let productForItinerary = product;
     if (
       (product.type === 'TOUR' || product.type === 'tour') &&
       !booking.customDetails &&
       (!Array.isArray(product.itineraries) || product.itineraries.length === 0)
     ) {
       try {
         const prisma = getTenantPrisma();
         const withItin = await prisma.product.findUnique({
           where: { id: product.id },
           include: {
             itineraries: {
               orderBy: { day: 'asc' },
               include: { activities: true }
             }
           },
         });
         if (withItin) productForItinerary = withItin as any;
       } catch {}
     }
 
     let itineraryAttachments: any[] = [];
      if (
       productForItinerary &&
       (productForItinerary.type === 'TOUR' || productForItinerary.type === 'tour') &&
       Array.isArray(productForItinerary.itineraries) &&
       productForItinerary.itineraries.length > 0
      ) {
        try {
          const itineraryPDF = await PDFService.generateItineraryPDF(
            productForItinerary,
            booking.bookingCode
          );
          itineraryAttachments.push({
            filename: `itinerary-${booking.bookingCode}.pdf`,
            content: itineraryPDF,
            contentType: 'application/pdf',
          });
        } catch (err) {
          logger.error('Itinerary PDF generation failed', err);
        }
      }
    
    const emailData: EmailData = {
      to: booking.customerEmail,
      subject: `Booking Confirmation - ${product.title}`,
      template: 'booking-confirmation',
      context: {
        tenantId,
        customerName: sanitize(booking.customerName),
        bookingCode: sanitize(booking.bookingCode),
        productTitle: sanitize(product.title),
        bookingDate: new Date(booking.bookingDate).toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        adults: booking.adults,
        children: booking.children,
        amountPaid: (booking.paymentStatus === 'PAID'
                     ? booking.totalAmount
                     : booking.paymentStatus === 'PARTIAL'
                       ? booking.partialPaymentAmount
                       : null),
        currency: currency,
        currencySymbol: currencySymbol,
        packageName: booking.package?.name || 'Custom Package',
        timeSlot: booking.selectedTimeSlot || 'As per confirmation',
      },
      attachments: itineraryAttachments.length ? itineraryAttachments : undefined,
    };

    return this.sendEmail(emailData);
  }

  static async sendItineraryDraft(
    proposal: any,
    pdfBuffer: Buffer,
    opts?: { reviewLink?: string; personalMessage?: string }
  ) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending itinerary draft');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    const cd = proposal.customDetails || {};
    const subject = `Itinerary Proposal - ${cd.packageName || 'Your Trip'} (v${proposal.version})`;
    const startDateStr = new Date(proposal.startDate).toLocaleDateString();
    const endDateStr   = proposal.endDate ? new Date(proposal.endDate).toLocaleDateString() : null;
    const personalMessageHtml = opts?.personalMessage
      ? handlebars.escapeExpression(String(opts.personalMessage)).replace(/\n/g, '<br/>')
      : null;
    return this.sendEmail({
      to: proposal.customerEmail,
      subject,
      template: 'itinerary-proposal',
      context: {
        tenantId,
        customerName: proposal.customerName,
        packageName : cd.packageName || 'Your Trip',
        startDate   : startDateStr,
        endDate     : endDateStr,
        adults      : proposal.adults,
        children    : proposal.children,
        location    : cd.location || '',
        reviewLink  : opts?.reviewLink || null,
        personalMessageHtml
      },
      attachments: [
        { filename: `proposal-${proposal.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
      ]
    });
  }

  static async sendBookingVoucher(booking: any) {
    const currency = booking.package?.currency || booking.currency || 'INR';
    const currencySymbol = getCurrencySymbol(currency);
    const tenantId = getTenantId();
    
    if (!tenantId) {
      throw new Error('Tenant context is required for sending booking voucher');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    
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
      currency: currency,
    });

    let amountPaid: number;
    let amountPending: number;

    switch (booking.paymentStatus?.toUpperCase()) {
      case 'PAID':
        amountPaid    = booking.totalAmount;
        amountPending = 0;
        break;
      case 'PARTIAL':
        amountPaid    = booking.partialPaymentAmount ?? 0;
        amountPending = Math.max(booking.totalAmount - amountPaid, 0);
        break;
      case 'PENDING':
        amountPaid    = 0;
        amountPending = booking.totalAmount;
        break;
      default:
        amountPaid    = 0;
        amountPending = booking.totalAmount;
    }
    const emailData: EmailData = {
      to: booking.customerEmail,
      subject: `Booking Voucher - ${booking.bookingCode}`,
      template: 'voucher',
      context: {
        tenantId,
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
        packageName: booking.package?.name || null,
        amountPaid,
        amountPending,
        currency: currency,
        currencySymbol: currencySymbol,
        timeSlot: booking.selectedTimeSlot || 'As per confirmation',
      },
      attachments: [
        {
          filename: `voucher-${booking.bookingCode}.pdf`,
          content: voucherPDF,
          contentType: 'application/pdf',
        },
        ...(booking.customDetails?.itinerary
          ? [
              {
                filename: `itinerary-${booking.bookingCode}.pdf`,
                content: await PDFService.generateCustomItineraryPDF(
                  booking.customDetails.itinerary,
                  booking.bookingCode
                ),
                contentType: 'application/pdf'
              }
            ]
          : []
        )
      ],
    };
    return this.sendEmail(emailData);
  }

  static async sendPaymentConfirmation(booking: any, payment: any, product: any) {
    const currency = booking.package?.currency || booking.currency || payment.currency || 'INR';
    const currencySymbol = getCurrencySymbol(currency);
    const tenantId = getTenantId();
    
    if (!tenantId) {
      throw new Error('Tenant context is required for sending payment confirmation');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);

    let productForItinerary = product;
     if (
       (product.type === 'TOUR' || product.type === 'tour') &&
       !booking.customDetails &&
       (!Array.isArray(product.itineraries) || product.itineraries.length === 0)
     ) {
       try {
         const prisma = getTenantPrisma();
         const withItin = await prisma.product.findUnique({
           where: { id: product.id },
           include: {
             itineraries: {
               orderBy: { day: 'asc' },
               include: { activities: true }
             }
           },
         });
         if (withItin) productForItinerary = withItin as any;
       } catch {}
     }
 
     let itineraryAttachments: any[] = [];
     if (
       productForItinerary &&
       (productForItinerary.type === 'TOUR' || productForItinerary.type === 'tour') &&
       Array.isArray(productForItinerary.itineraries) &&
       productForItinerary.itineraries.length > 0
    ) {
      try {
        const itineraryPDF = await PDFService.generateItineraryPDF(
          productForItinerary,
          booking.bookingCode
        );
        itineraryAttachments.push({
          filename: `itinerary-${booking.bookingCode}.pdf`,
          content: itineraryPDF,
          contentType: 'application/pdf',
        });
      } catch (err) {
        logger.error('Itinerary PDF generation failed', err);
      }
    }
    
    const emailData: EmailData = {
      to: booking.customerEmail,
      subject: `Payment Received - ${booking.bookingCode}`,
      template: 'payment-confirmation',
      context: {
        tenantId,
        customerName: sanitize(booking.customerName),
        bookingCode: sanitize(booking.bookingCode),
        productTitle: sanitize(product.title),
        paymentAmount: payment.amount,
        currency: currency,
        currencySymbol: currencySymbol,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.razorpayPaymentId,
      },
      attachments: itineraryAttachments.length ? itineraryAttachments : undefined,
    };

    return this.sendEmail(emailData);
  }

  static async sendAbandonedCartReminder(cart: any, product: any) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending abandoned cart reminder');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    
    const emailData: EmailData = {
      to: cart.email,
      subject: `Complete Your Booking - ${product.title}`,
      template: 'abandoned-cart',
      context: {
        tenantId,
        customerName: sanitize(cart.customerData.customerName),
        productTitle: sanitize(product.title),
        productImage: sanitize(product.images[0]),
        bookingUrl: `${process.env.FRONTEND_URL}/book/${product.id}?recoverToken=${cart.recoverToken}`,
        companyName: branding.companyName,
        companyEmail: branding.companyEmail,
        companyPhone: branding.companyPhone,
      },
    };

    return this.sendEmail(emailData);
  }

  static async sendNewAbandonedCartNotification(cart: any) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending abandoned cart notification');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    
    const emailData: EmailData = {
      to: branding.companyEmail || process.env.COMPANY_EMAIL!,
      subject:`[Alert] New Abandoned Cart`,
      template: 'abandoned-cart-notification',
      context: {
        tenantId,
        customerName:    sanitize(cart.customerData.customerName),
        customerPhone:    sanitize(cart.customerData.customerPhone),
        customerEmail:   sanitize(cart.email),
        companyName: branding.companyName
      }
    };
    return this.sendEmail(emailData);
  }

  static async sendNewsletter(subscribers: string[], subject: string, content: string) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending newsletter');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);

    const unsubscribeUrl = `${process.env.FRONTEND_URL}/unsubscribe`;
    const fallbackHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.5;">
        <h2 style="margin:0 0 12px 0;">${branding.companyName || 'Our Newsletter'}</h2>
        <div>${content}</div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #eee;">
        <p style="color:#666;font-size:12px;">
          You received this email from ${branding.companyEmail || 'us'}.
          If you no longer wish to receive these emails,
          <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer">unsubscribe here</a>.
        </p>
      </div>
    `;
    
    const emailData: EmailData = {
      to: subscribers,
      subject,
      template: 'newsletter',
      context: {
        tenantId,
        content,
        companyName: branding.companyName,
        unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe`,
      },
      html: fallbackHtml
    };

    return this.sendEmail(emailData);
  }

  static async sendTripRequestNotification(request: any) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending trip request notification');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    
    const emailData: EmailData = {
      to: branding.companyEmail || process.env.COMPANY_EMAIL!,
      subject: `[Alert] New Trip Request - ${request.destination}`,
      template: 'trip-request-notification',
      context: {
        tenantId,
        ...request,
        email: request.email,
        startDate: request.startDate.toISOString().split('T')[0],
        endDate:   request.endDate.toISOString().split('T')[0],
        interests: (request.interests || []).join(', '),
        companyName: branding.companyName,
      },
    };

    return this.sendEmail(emailData);
  }

  static async sendTripRequestConfirmation(request: any) {
     const tenantId = getTenantId();
     if (!tenantId) {
       throw new Error('Tenant context is required for sending trip request confirmation');
     }
     
     const branding = await TemplateLoader.getTenantBranding(tenantId);
     
     const emailData: EmailData = {
       to: request.email,
       subject: 'We’ve received your trip request!',
       template: 'trip-request-confirmation',
       context: {
         tenantId,
         ...request,
         startDate: request.startDate.toISOString().split('T')[0],
         endDate:   request.endDate.toISOString().split('T')[0],
         interests: (request.interests || []).join(', '),
         companyName: branding.companyName,
         companyPhone: branding.companyPhone,
         companyEmail: branding.companyEmail,
       },
     };
     return this.sendEmail(emailData);
   }

  static async sendPartnershipRequest(request: any) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending partnership request');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    
    const emailData: EmailData = {
      to: branding.companyEmail || process.env.COMPANY_EMAIL!,
      subject: `New Partnership Request`,
      template: 'partnership-request',
      context: {
        tenantId,
        companyName: request.companyName,
        contactPerson: request.contactPerson,
        email: request.email,
        phone: request.phone,
        message: request.message,
        partnershipType: request.partnershipType,
        website: request.website,
      },
    };
    return this.sendEmail(emailData);
  }

  static async sendPaymentPendingNotice(
    booking: any,
    product: any,
  ) {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required for sending payment pending notice');
    }
    
    const branding = await TemplateLoader.getTenantBranding(tenantId);
    const currency = booking.package?.currency || booking.currency || 'INR';
    const currencySymbol = getCurrencySymbol(currency);
    
    const emailData: EmailData = {
      to: booking.customerEmail,
      subject: `Gentle Reminder – Secure your reservation for ${product.title}`,
      template: 'payment-pending',
      context: {
        tenantId,
        customerName: sanitize(booking.customerName),
        bookingCode:  sanitize(booking.bookingCode),
        productTitle: sanitize(product.title),
        adults:       booking.adults,
        children:     booking.children,
        totalAmount:  booking.totalAmount,
        currency: currency,
        currencySymbol: currencySymbol,
        companyName: branding.companyName,
        companyEmail: branding.companyEmail,
        companyPhone: branding.companyPhone,
      },
    };
    return this.sendEmail(emailData);
  }
}