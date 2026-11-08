import { jsPDF } from 'jspdf';
import { OrderRecord } from './types.ts';

export function generateOrderPdfReceipt(order: OrderRecord): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Primary palette: Forest green #153E2E, charcoal #1A211D, muted gray #6E7972
  const primaryColor = [21, 62, 46];
  const charcoalColor = [26, 33, 29];
  const mutedColor = [110, 121, 114];
  const lightBg = [245, 247, 245];

  // Header banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Brand title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BoundBuy AI', 16, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Cryptographically Verified Institutional Procurement', 16, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('OFFICIAL PAYMENT RECEIPT', pageWidth - 16, 17, { align: 'right' });

  // Sandbox Notice Banner
  doc.setFillColor(254, 243, 199); // Soft amber
  doc.rect(16, 34, pageWidth - 32, 10, 'F');
  doc.setDrawColor(245, 158, 11);
  doc.rect(16, 34, pageWidth - 32, 10, 'S');

  doc.setTextColor(146, 64, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(
    'PAYPAL SANDBOX TEST TRANSACTION — NO REAL-WORLD CURRENCY OR FUNDS WERE TRANSFERRED',
    pageWidth / 2,
    40.5,
    { align: 'center' }
  );

  let y = 52;

  // Order & Payment Details Grid
  doc.setTextColor(charcoalColor[0], charcoalColor[1], charcoalColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Order: ${order.orderNumber}`, 16, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text(`Transaction Time: ${new Date(order.transactionTimestamp).toLocaleString()}`, 16, y + 6);
  doc.text(`Pact Authorized: ${new Date(order.approvalTimestamp).toLocaleString()}`, 16, y + 11);

  // Right column: IDs
  doc.text(`Payment Provider: PayPal Sandbox (REST Orders v2)`, pageWidth - 16, y, { align: 'right' });
  doc.text(`PayPal Order ID: ${order.paypalOrderId}`, pageWidth - 16, y + 6, { align: 'right' });
  doc.text(`PayPal Capture ID: ${order.paypalCaptureId}`, pageWidth - 16, y + 11, { align: 'right' });
  doc.text(`Status: COMPLETED (Verified Server-Side)`, pageWidth - 16, y + 16, { align: 'right' });

  y += 24;

  // Buyer Info
  doc.setDrawColor(220, 225, 220);
  doc.line(16, y, pageWidth - 16, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(charcoalColor[0], charcoalColor[1], charcoalColor[2]);
  doc.text('Authorized Buyer:', 16, y);
  doc.setFont('helvetica', 'normal');
  doc.text(order.buyerEmail, 50, y);

  y += 10;

  // Table Header
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.rect(16, y, pageWidth - 32, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(charcoalColor[0], charcoalColor[1], charcoalColor[2]);
  doc.text('Item Description & Supplier', 20, y + 5.5);
  doc.text('Qty', 120, y + 5.5, { align: 'right' });
  doc.text('Unit Price', 150, y + 5.5, { align: 'right' });
  doc.text('Total', pageWidth - 20, y + 5.5, { align: 'right' });

  y += 8;

  // Items rows
  doc.setFont('helvetica', 'normal');
  for (const item of order.items) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(item.productName.substring(0, 50), 20, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text(`Supplier: ${item.supplierName} (${item.supplierId})`, 20, y + 4.5);

    doc.setTextColor(charcoalColor[0], charcoalColor[1], charcoalColor[2]);
    doc.text(item.quantity.toString(), 120, y, { align: 'right' });
    doc.text(`$${item.unitPrice.toFixed(2)}`, 150, y, { align: 'right' });
    doc.text(`$${item.itemTotal.toFixed(2)}`, pageWidth - 20, y, { align: 'right' });

    y += 7;
    doc.setDrawColor(240, 243, 240);
    doc.line(16, y, pageWidth - 16, y);
  }

  y += 6;

  // Totals Box
  const totalsLeft = pageWidth - 80;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);

  doc.text('Subtotal:', totalsLeft, y);
  doc.text(`$${order.subtotal.toFixed(2)} ${order.currency}`, pageWidth - 20, y, { align: 'right' });
  y += 6;

  doc.text('Consolidated Shipping:', totalsLeft, y);
  doc.text(`$${order.shippingCost.toFixed(2)} ${order.currency}`, pageWidth - 20, y, { align: 'right' });
  y += 6;

  doc.text('Estimated Taxes:', totalsLeft, y);
  doc.text(`$${order.estimatedTax.toFixed(2)} ${order.currency}`, pageWidth - 20, y, { align: 'right' });
  y += 8;

  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.rect(totalsLeft - 4, y - 5, 68, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('Grand Total:', totalsLeft, y + 2);
  doc.text(`$${order.grandTotal.toFixed(2)} ${order.currency}`, pageWidth - 20, y + 2, { align: 'right' });

  y += 20;

  // Cryptographic Audit Seal
  doc.setFillColor(250, 252, 250);
  doc.rect(16, y, pageWidth - 32, 26, 'F');
  doc.setDrawColor(200, 215, 205);
  doc.rect(16, y, pageWidth - 32, 26, 'S');

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CRYPTOGRAPHIC PURCHASE PACT AUDIT SEAL', 20, y + 6);

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(charcoalColor[0], charcoalColor[1], charcoalColor[2]);
  doc.text(`Snapshot Hash: ${order.snapshotHashAtCheckout}`, 20, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text(
    'This hash guarantees the exact SKU quantities, supplier prices, and terms were verified and unaltered at capture.',
    20,
    y + 19
  );

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text(
    'BoundBuy AI — Built for the PayPal AI Hackathon 2026. “You set the buying rules. AI finds the option. You approve. PayPal pays.”',
    pageWidth / 2,
    285,
    { align: 'center' }
  );

  doc.save(`BoundBuy_Receipt_${order.orderNumber}.pdf`);
}
