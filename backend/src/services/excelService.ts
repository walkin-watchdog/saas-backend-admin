import Excel from 'exceljs';
import { Buffer } from 'buffer';
import { logger } from '../utils/logger';

export class ExcelService {
  static async generateBookingsExcel(bookings: any[]): Promise<Buffer> {
    try {
      // Create a new Excel workbook
      const workbook = new Excel.Workbook();
      const worksheet = workbook.addWorksheet('Bookings');

      // Define columns
      worksheet.columns = [
        { header: 'Booking Code', key: 'bookingCode', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Payment Status', key: 'paymentStatus', width: 15 },
        { header: 'Booking Date', key: 'bookingDate', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 18 },
        { header: 'Customer Name', key: 'customerName', width: 20 },
        { header: 'Email', key: 'customerEmail', width: 25 },
        { header: 'Phone', key: 'customerPhone', width: 15 },
        { header: 'Product', key: 'product', width: 30 },
        { header: 'Product Code', key: 'productCode', width: 15 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Package', key: 'package', width: 20 },
        { header: 'Time Slot', key: 'timeSlot', width: 15 },
        { header: 'Adults', key: 'adults', width: 8 },
        { header: 'Children', key: 'children', width: 8 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 },
        { header: 'Notes', key: 'notes', width: 25 }
      ];

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF104C57' } // Header background color
      };
      worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }; // White text

      // Add booking data
      bookings.forEach(booking => {
        worksheet.addRow({
          bookingCode: booking.bookingCode,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          bookingDate: this.formatDate(booking.bookingDate),
          createdAt: this.formatDate(booking.createdAt),
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone,
          product: booking.product?.title || '',
          productCode: booking.product?.productCode || '',
          location: booking.product?.location || '',
          package: booking.package?.name || '',
          timeSlot: booking.slot?.Time?.[0] || '',
          adults: booking.adults,
          children: booking.children || 0,
          totalAmount: booking.totalAmount,
          paymentMethod: booking.payments?.[0]?.paymentMethod || '',
          notes: booking.notes || ''
        });
      });

      // Format number columns
      worksheet.getColumn('totalAmount').numFmt = '₹#,##0.00';
      
      // Add total row at the bottom
      const lastRow = worksheet.rowCount + 1;
      worksheet.addRow({
        bookingCode: 'TOTAL',
        adults: { formula: `SUM(N2:N${lastRow - 1})` },
        children: { formula: `SUM(O2:O${lastRow - 1})` },
        totalAmount: { formula: `SUM(P2:P${lastRow - 1})` }
      });
      
      // Style the total row
      const totalRow = worksheet.getRow(lastRow);
      totalRow.font = { bold: true };
      totalRow.getCell('totalAmount').numFmt = '₹#,##0.00';
      
      // Auto filter
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: lastRow - 1, column: 18 }
      };

      // Generate buffer
      const uint8 = await workbook.xlsx.writeBuffer();
      const nodeBuffer = Buffer.from(uint8);
      return nodeBuffer;
    } catch (error) {
      logger.error('Error generating Excel file:', error);
      throw new Error('Failed to generate Excel file');
    }
  }

  private static formatDate(dateString: string | Date): string {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}