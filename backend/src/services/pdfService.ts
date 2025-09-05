import PDFDocument from 'pdfkit';
import { TemplateLoader } from '../utils/templateLoader';
import { getTenantId } from '../middleware/tenantMiddleware';
import { logger } from '../utils/logger';

export interface VoucherData {
  booking: any;
  product: any;
  customer: any;
  packageDetails?: any;
  timeSlot?: string;
  currency: string;
}

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

export class PDFService {
  static async generateBookingVoucher(data: VoucherData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const generatePDF = async () => {
          const tenantId = getTenantId();
          if (!tenantId) {
            const err: any = new Error('Branding configuration missing');
            err.code = 'BRANDING_CONFIG_MISSING';
            throw err;
          }
          const branding = await TemplateLoader.getTenantBranding(tenantId);
          const companyName = branding.companyName || '';
          const companyAddress = branding.companyAddress || '';
          const companyEmail = branding.companyEmail || '';
          const companyPhone = branding.companyPhone || '';
          
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        const PAGE_HEIGHT = doc.page.height;
        const MARGIN = 50;
        const LINE_HEIGHT = 15;
        const SECTION_SPACING = 20;
        const SMALL_SPACING = 10;

        // Get currency symbol
        const currencySymbol = getCurrencySymbol(data.currency);

        // Header
        doc.fontSize(24)
          .fillColor('#104c57')
          .text(companyName, 50, 50);

        let currentY = 80;
        doc.fontSize(16)
          .fillColor('#ff914d')
          .text('Booking Voucher', 50, currentY);

        currentY += 30;

        // Company Info
        doc.fontSize(10)
          .fillColor('#666666')
          .text(companyAddress, 50, currentY);
        currentY += LINE_HEIGHT;
        
        doc.text(`Email: ${companyEmail}`, 50, currentY);
        currentY += LINE_HEIGHT;
        
        doc.text(`Phone: ${companyPhone}`, 50, currentY);
        currentY += SECTION_SPACING;

        // Calculate booking details content dynamically
        const bookingDetails = [];
        bookingDetails.push(`Booking Code: ${data.booking.bookingCode || '-'}`);
        bookingDetails.push(`Tour/Experience: ${data.product?.title || data.booking?.customTitle || '-'}`);
        bookingDetails.push(`Customer Name: ${data.booking.customerName || '-'}`);
        bookingDetails.push(`Email: ${data.booking.customerEmail || '-'}`);
        bookingDetails.push(`Phone: ${data.booking.customerPhone || '-'}`);
        bookingDetails.push(`Booking Date: ${data.booking.bookingDate ? new Date(data.booking.bookingDate).toLocaleDateString() : '-'}`);
        bookingDetails.push(`Adults: ${data.booking.adults ?? '-'} | Children: ${data.booking.children ?? '-'}`);
        if (data.booking.travellerDetails && Array.isArray(data.booking.travellerDetails)) {
          bookingDetails.push('Travellers:');
          data.booking.travellerDetails.forEach((t: any, i: number) => {
            bookingDetails.push(
              `  ${i+1}. ${t.name}, Age: ${t.age}` +
              (t.dietaryRestrictions ? ` (Dietary Restrictions: ${t.dietaryRestrictions})` : '')
            );
          });
        }

        // Additional booking details
        if (data.packageDetails?.name) {
          bookingDetails.push(`Package: ${data.packageDetails.name}`);
        }
        if (data.timeSlot) {
          bookingDetails.push(`Time: ${data.timeSlot}`);
        }
        switch (data.booking.paymentStatus?.toUpperCase()) {
          case 'PAID':
            bookingDetails.push(
              `Total Amount: ${currencySymbol}${data.booking.totalAmount?.toLocaleString() || '-'}`
            );
            break;

          case 'PARTIAL': {
            const paid = data.booking.partialPaymentAmount ?? 0;
            const pending = Math.max(data.booking.totalAmount - paid, 0);
            bookingDetails.push(
              `Amount Paid: ${currencySymbol}${paid.toLocaleString()}`
            );
            bookingDetails.push(
              `Amount Pending: ${currencySymbol}${pending.toLocaleString()}`
            );
            break;
          }

          case 'PENDING':
            bookingDetails.push(
              `Amount Pending: ${currencySymbol}${data.booking.totalAmount?.toLocaleString() || '-'}`
            );
            break;

          default:
            // Fallback: treat unknown status as fully pending
            bookingDetails.push(
              `Amount Pending: ${currencySymbol}${data.booking.totalAmount?.toLocaleString() || '-'}`
            );
            break;
        }

        // Tour details
        const tourDetails = [];
        tourDetails.push(`Location: ${data.product?.location || '-'}`);
        tourDetails.push(`Duration: ${data.product?.duration || '-'}`);
        
        if (data.product?.category) {
          tourDetails.push(`Category: ${data.product.category}`);
        }
        
        if (data.product?.meetingPoint) {
          let meetingPointText = data.product.meetingPoint;
          
          // Parse JSON meeting point if it's a string
          try {
            if (typeof meetingPointText === 'string') {
              const meetingPointData = JSON.parse(meetingPointText);
              if (Array.isArray(meetingPointData) && meetingPointData.length > 0) {
                meetingPointText = meetingPointData[0].address || meetingPointText;
              }
            } else if (Array.isArray(meetingPointText) && meetingPointText.length > 0) {
              meetingPointText = meetingPointText[0].address || 'Meeting point address not available';
            }
          } catch (error) {
            meetingPointText = data.product.meetingPoint;
          }
          
          tourDetails.push(`Meeting Point: ${meetingPointText}`);
        }

        // Calculate dynamic box height
        const totalLines = bookingDetails.length + tourDetails.length + 2; // +2 for section headers
        const boxHeight = (totalLines * LINE_HEIGHT) + 60; // 60 for padding and spacing
        const boxStartY = currentY;

        // Booking Details Box with dynamic height
        doc.rect(50, boxStartY, 500, boxHeight).stroke('#104c57');
        
        currentY += 20;
        doc.fontSize(14)
          .fillColor('#104c57')
          .text('Booking Details', 70, currentY);

        currentY += 25;
        
        // Render booking details
        doc.fontSize(11).fillColor('#333333');
        bookingDetails.forEach(detail => {
          doc.text(detail, 70, currentY);
          currentY += LINE_HEIGHT;
        });

        currentY += SMALL_SPACING;

        // Tour/Experience Details header
        doc.fontSize(12)
          .fillColor('#104c57')
          .text('Tour/Experience Details:', 70, currentY);
        
        currentY += 18;
        
        // Render tour details
        doc.fontSize(11).fillColor('#333333');
        tourDetails.forEach(detail => {
          doc.text(detail, 70, currentY);
          currentY += LINE_HEIGHT;
        });

        // Move to after the box
        currentY = boxStartY + boxHeight + SECTION_SPACING;

        // Check if we need a new page
        const checkPageBreak = (neededHeight: number) => {
          if (currentY + neededHeight > PAGE_HEIGHT - 100) {
            doc.addPage();
            currentY = 50;
            return true;
          }
          return false;
        };

        // Important Notes
        checkPageBreak(100);
        
        doc.fontSize(12)
          .fillColor('#ff914d')
          .text('Important Notes:', 50, currentY);
        
        currentY += SECTION_SPACING;
        
        const importantNotes = [
          'Please arrive 15 minutes before the scheduled time',
          'Carry a valid photo ID for verification',
          'Contact us for any changes or cancellations',
          'Check weather conditions before departure'
        ];

        doc.fontSize(10).fillColor('#333333');
        importantNotes.forEach(note => {
          doc.text(`• ${note}`, 50, currentY);
          currentY += LINE_HEIGHT;
        });

        currentY += SECTION_SPACING;

        // Cancellation Policy
        if (data.product?.cancellationPolicy) {
          const policyHeight = data.product.cancellationTerms?.length > 0 ? 
            (data.product.cancellationTerms.length * LINE_HEIGHT) + 80 : 120;
          
          checkPageBreak(policyHeight);

          doc.fontSize(12)
            .fillColor('#ff914d')
            .text('Cancellation Policy:', 50, currentY);
          
          currentY += SECTION_SPACING;
          
          if (data.product.cancellationPolicyType && data.product.cancellationPolicyType !== 'custom') {
            const policyTypeLabels: Record<string, string> = {
              standard: 'Standard Policy',
              moderate: 'Moderate Policy', 
              strict: 'Strict Policy',
              no_refund: 'No Refund Policy'
            };
            doc.fontSize(10)
              .fillColor('#666666')
              .text(`Policy Type: ${policyTypeLabels[data.product.cancellationPolicyType]}`, 50, currentY);
            currentY += LINE_HEIGHT;
          }
          
          if (data.product.cancellationTerms?.length > 0) {
            doc.fontSize(10).fillColor('#333333');
            data.product.cancellationTerms.forEach((term: any) => {
              doc.text(`• ${term.timeframe}: ${term.refundPercent}% refund`, 50, currentY);
              currentY += LINE_HEIGHT;
            });
          } else {
            // Handle long text with proper wrapping
            const policyText = data.product.cancellationPolicy;
            const textHeight = doc.heightOfString(policyText, { width: 500 });
            
            checkPageBreak(textHeight + 20);
            
            doc.fontSize(10)
              .fillColor('#333333')
              .text(policyText, 50, currentY, { width: 500 });
            currentY += textHeight + SMALL_SPACING;
          }

          currentY += SECTION_SPACING;
        }

        // Additional Requirements
        const hasRequirements = data.product?.requirePhone
          || data.product?.requireId
          || data.product?.requireAge
          || data.product?.requireMedical
          || data.product?.requireDietary
          || data.product?.requireEmergencyContact
          || data.product?.requirePassportDetails
          || (data.product?.customRequirementFields?.length > 0)
          || data.product?.additionalRequirements;

        if (hasRequirements) {
          // Collect requirements
          const requirements: string[] = [];
          if (data.product.requirePhone) requirements.push('Valid phone number');
          if (data.product.requireId) requirements.push('Government-issued photo ID');
          if (data.product.requireAge) requirements.push('Age verification for all travelers');
          if (data.product.requireMedical) requirements.push('Medical information and restrictions');
          if (data.product.requireDietary) requirements.push('Dietary restrictions and preferences');
          if (data.product.requireEmergencyContact) requirements.push('Emergency contact information');
          if (data.product.requirePassportDetails) requirements.push('Passport details for international travelers');
          
          // Add custom fields
          if (data.product.customRequirementFields?.length > 0) {
            data.product.customRequirementFields.forEach((f: any) => {
              requirements.push(`${f.label}${f.required ? ' (Required)' : ' (Optional)'}`);
            });
          }
          
          if (data.product.additionalRequirements) {
            requirements.push(data.product.additionalRequirements);
          }

          const requirementsHeight = (requirements.length * LINE_HEIGHT) + 60;
          checkPageBreak(requirementsHeight);

          doc.fontSize(12)
            .fillColor('#ff914d')
            .text('Required Information from Travelers:', 50, currentY);
          
          currentY += SECTION_SPACING;
          
          doc.fontSize(10).fillColor('#333333');
          requirements.forEach(req => {
            // Handle long requirement text with wrapping
            const reqHeight = doc.heightOfString(`• ${req}`, { width: 500 });
            checkPageBreak(reqHeight + 5);
            
            doc.text(`• ${req}`, 50, currentY, { width: 500 });
            currentY += Math.max(LINE_HEIGHT, reqHeight + 2);
          });

          currentY += SECTION_SPACING;
        }

        if (data.product?.inclusions || data.product?.exclusions) {
          const incText = Array.isArray(data.product?.inclusions)
            ? data.product.inclusions.map((i: string) => `• ${i}`).join('\n')
            : data.product?.inclusions ?? '';
          const excText = Array.isArray(data.product?.exclusions)
            ? data.product.exclusions.map((e: string) => `• ${e}`).join('\n')
            : data.product?.exclusions ?? '';

          const neededHeight =
            SECTION_SPACING +
            (incText ? doc.heightOfString(incText, { width: 500 }) + SMALL_SPACING : 0) +
            (excText ? doc.heightOfString(excText, { width: 500 }) + SMALL_SPACING : 0);

          checkPageBreak(neededHeight);

          doc.fontSize(12).fillColor('#ff914d')
             .text('Inclusions & Exclusions:', 50, currentY);
          currentY += SECTION_SPACING;

          if (incText) {
            doc.fontSize(11).fillColor('#104c57').text('Inclusions:', 50, currentY);
            currentY += SECTION_SPACING;
            doc.fontSize(10).fillColor('#333333')
               .text(incText, 50, currentY, { width: 500 });
            currentY += doc.heightOfString(incText, { width: 500 }) + SECTION_SPACING;
          }

          if (excText) {
            doc.fontSize(11).fillColor('#104c57').text('Exclusions:', 50, currentY);
            currentY += SECTION_SPACING;
            doc.fontSize(10).fillColor('#333333')
               .text(excText, 50, currentY, { width: 500 });
            currentY += doc.heightOfString(excText, { width: 500 }) + SECTION_SPACING;
          }
        }

        // Footer
        checkPageBreak(40);
        
        doc.fontSize(10)
          .fillColor('#666666')
          .text(`Thank you for choosing ${companyName}!`, 50, currentY);
        currentY += LINE_HEIGHT;
        
        doc.text(`For support: ${companyEmail} | ${companyPhone}`, 50, currentY);

        doc.end();
        };
        
        generatePDF();
      } catch (error) {
        logger.error('Error generating PDF voucher:', error);
        reject(new Error('Failed to generate booking voucher'));
      }
    });
  }

  static async generateItineraryPDF(product: any, bookingCode: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc     = new PDFDocument({ margin: 50 });
        const buffers : Buffer[] = [];
        doc.on('data',  buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        
        const tenantId = getTenantId();
        if (!tenantId) {
          const err: any = new Error('Branding configuration missing');
          err.code = 'BRANDING_CONFIG_MISSING';
          throw err;
        }
        const b = await TemplateLoader.getTenantBranding(tenantId);
        const companyName = b.companyName || '';
        const companyEmail = b.companyEmail || '';
        const companyPhone = b.companyPhone || '';
        doc.fontSize(24).fillColor('#104c57').text(companyName, 50, 50);
        doc.moveDown()
           .fontSize(16).fillColor('#ff914d').text('Detailed Itinerary');
        doc.moveDown()
           .fontSize(10).fillColor('#666')
           .text(`Booking Reference: ${bookingCode}`);
        doc.moveDown(1.5);

        let itinerary: any[] = [];
        if (Array.isArray(product?.itinerary)) {
          itinerary = product.itinerary;
        } else if (Array.isArray(product?.itineraries)) {
          itinerary = product.itineraries
            .sort((a:any,b:any)=> (a.day ?? 0) - (b.day ?? 0))
            .map((d:any) => ({
              day:         d.day,
              title:       d.title,
              description: d.description,
              activities:  Array.isArray(d.activities) ? d.activities : []
            }));
        } else if (typeof product?.itinerary === 'string') {
          try {
            const parsed = JSON.parse(product.itinerary);
            if (Array.isArray(parsed)) itinerary = parsed;
          } catch {}
        }

        itinerary.forEach((item: any, idx: number) => {
          doc.fontSize(12).fillColor('#104c57')
             .text(`Day ${item.day ?? idx + 1}: ${item.title ?? ''}`, { underline: true });
          doc.moveDown(0.4);
          if (item.description || item.details) {
            doc.fontSize(10).fillColor('#333')
               .text(item.description ?? item.details ?? '', { width: 500 });
            doc.moveDown(0.6);
          }

          let stopCount = 0;
          (item.activities ?? []).forEach((act: any, aIdx: number) => {
            const isStop = !!act.isStop;
            if (isStop) stopCount += 1;

            const bulletLabel = isStop ? `${stopCount}.` : '•';

            const mainLine =
              `${bulletLabel} ${isStop ? '' : 'Pass by: '}${act.location || 'Unnamed location'}` +
              (isStop && act.stopDuration
                ? `  (${act.stopDuration}${act.durationUnit ? ' ' + act.durationUnit : ' min'})`
                : '');

            doc.fontSize(10).fillColor('#104c57').text(mainLine, { paragraphGap: 2 });

            if (isStop && act.isAdmissionIncluded !== undefined) {
              doc.fontSize(9).fillColor(act.isAdmissionIncluded ? '#666' : '#666')
                 .text(`   - Admission ${act.isAdmissionIncluded ? 'included' : 'not included'}`);
            }

            if (act.description) {
              doc.fontSize(9).fillColor('#555')
                 .text(`   ${act.description}`, { width: 480 });
            }

            doc.moveDown(0.4);
          });

          doc.moveDown();
        });

        if (itinerary.length === 0) {
          doc.fontSize(10).fillColor('#333')
             .text('Itinerary details will be shared with you shortly.');
        }

        doc.addPage();
        doc.fontSize(10).fillColor('#666')
           .text(`Thank you for choosing ${companyName}!`, 50, 50);
        doc.text(`For support: ${companyEmail} | ${companyPhone}`, 50, 65);

        doc.end();
      } catch (err) {
        logger.error('Error generating itinerary PDF:', err);
        reject(err);
      }
    });
  }

  static async generateCustomItineraryPDF(
    itinerary: { date: string; time: string; activity: string; location: string; remarks?: string }[],
    bookingCode: string,
    options?: { watermark?: string }
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        if (options?.watermark) {
          const watermark = options.watermark;
          const drawWatermark = () => {
            const { width, height } = doc.page;
            const centerX = width / 2;
            const centerY = height / 2;

            const prevX = (doc as any).x;
            const prevY = (doc as any).y;

            doc.save();
            doc.font('Helvetica-Bold')
              .fontSize(Math.min(width, height) / 4)
              .fillColor('#999999')
              .opacity(0.12)
              .rotate(-45, { origin: [centerX, centerY] })
              .text(
                watermark,
                centerX - width,
                centerY - 60,
                { width: width * 2, align: 'center', lineBreak: false }
              );
            doc.restore();

            (doc as any).x = prevX;
            (doc as any).y = prevY;
          };

          drawWatermark();
          doc.on('pageAdded', drawWatermark);
        }

        doc.fontSize(20).text('Itinerary', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Booking Reference: ${bookingCode}`);
        doc.moveDown(1.5);

        const byDate: Record<string, typeof itinerary> = {};
        for (const e of itinerary) {
          (byDate[e.date] ||= []).push(e);
        }

        const colWidths = [60, 180, 140, doc.page.width - doc.page.margins.left - doc.page.margins.right - (60 + 180 + 140)];
        const headers = ['Time', 'Activity', 'Location', 'Remarks'];

        for (const [date, rows] of Object.entries(byDate)) {
          if (doc.y + 100 > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
          }
          doc.x = doc.page.margins.left;
          doc
            .font('Helvetica-Bold')
            .fontSize(14)
            .text(date, { underline: true });
          doc.moveDown(0.3);

          const startX = doc.x;
          const headerY = doc.y;
          doc.font('Helvetica-Bold').fontSize(10);
          let cellX = startX;
          headers.forEach((h, i) => {
            doc.text(h, cellX, headerY, { width: colWidths[i], align: 'left' });
            cellX += colWidths[i];
          });
          const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
          doc.moveTo(startX, headerY + 12)
             .lineTo(startX + tableWidth, headerY + 12)
             .stroke();
          doc.y = headerY + 18;

          doc.font('Helvetica').fontSize(10);
          for (const entry of rows) {
            const cells = [entry.time, entry.activity, entry.location, entry.remarks || '–'];
            const cellHeights = cells.map((text, i) =>
              doc.heightOfString(text, { width: colWidths[i] })
            );
            const rowHeight = Math.max(...cellHeights) + 4;
            if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
              doc.addPage();
            }
            let rx = startX;
            const startY = doc.y;
            doc.font('Helvetica').fontSize(10);
            cells.forEach((text, i) => {
              doc.text(text, rx, startY, { width: colWidths[i], align: 'left' });
              rx += colWidths[i];
            });
            doc.y = startY + rowHeight;
          }
          doc.moveDown(0.5);
        }
        doc.end();
      } catch (err) {
        logger.error('Error generating custom itinerary PDF:', err);
        reject(err);
      }
    });
  }
}