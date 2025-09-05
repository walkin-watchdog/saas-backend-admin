import PDFDocument from 'pdfkit';
import { Plan, Invoice, UsageRecord } from '@prisma/client';
import { BrandingConfig, BrandingScope } from '../types/tenantConfig';
import { resolveBranding, resolveTax } from './brandingResolver';

export async function generateInvoicePdf(
  invoice: Invoice,
  plan: Plan,
  usage: UsageRecord[] = [],
  options: { brandingScope?: BrandingScope } = { brandingScope: 'platform' },
): Promise<Buffer> {
  const scope = options.brandingScope ?? 'platform';
  let branding: Partial<BrandingConfig>;
  try {
    branding = await resolveBranding(scope, invoice.tenantId);
  } catch (e) {
    const err: any = new Error('Branding configuration missing');
    err.code = 'BRANDING_CONFIG_MISSING';
    throw err;
  }
  const taxCfg = await resolveTax(scope, invoice.tenantId).catch(() => null);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (branding?.companyName) doc.fontSize(16).text(branding.companyName);
  if (branding?.companyAddress) doc.fontSize(10).text(branding.companyAddress);
  if (taxCfg?.jurisdiction) doc.text(`Tax ID: ${taxCfg.jurisdiction}`);
  doc.moveDown();

  doc.fontSize(18).text(`Invoice ${invoice.number}`);
  doc.moveDown();
  doc.fontSize(12).text(`Plan: ${plan.marketingName}`);

  const baseAmount =
    (invoice.amount - (invoice.taxAmount ?? 0) - (invoice.usageAmount ?? 0)) / 100;
  const symbol = invoice.currency === 'INR' ? '₹' : '$';
  doc.text(`Currency: ${invoice.currency}`);

  doc.text(`Amount: ${symbol}${baseAmount.toFixed(2)}`);
  if (invoice.usageAmount) doc.text(`Usage: ${symbol}${(invoice.usageAmount / 100).toFixed(2)}`);
  if (invoice.taxAmount) {
    const taxPct = (invoice.taxPercent ?? 0) * 100;
    doc.text(`Tax (${taxPct}%): ${symbol}${(invoice.taxAmount / 100).toFixed(2)}`);
  }
  doc.text(`Total: ${symbol}${(invoice.amount / 100).toFixed(2)}`);
  doc.text(`Status: ${invoice.status}`);
  doc.moveDown();

  if (usage.length > 0) {
    doc.text('Usage:');
    usage.forEach((u) => doc.text(` - ${u.meter}: ${u.quantity} ${u.unit}`));
    doc.moveDown();
  }

  if (branding?.footerHtml) {
    doc.text(String(branding.footerHtml).replace(/<[^>]+>/g, ''));
  } else {
    doc.text('Thank you for your business.');
  }

  doc.end();
  return bufferPromise;
}