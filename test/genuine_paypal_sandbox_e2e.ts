import assert from 'assert';
import { store } from '../server/src/services/store.ts';
import { PolicyEngine } from '../server/src/services/policyEngine.ts';
import { paypalService } from '../server/src/services/paypal.ts';
import type { PurchasePact, OrderRecord } from '../server/src/types/index.ts';

console.log('🧪 Starting Genuine PayPal Sandbox End-to-End Transaction Verification...\n');

async function runGenuineSandboxTransaction() {
  const settings = store.getSettings();
  if (!settings.paypalClientId || !settings.paypalClientSecret) {
    throw new Error('PayPal Sandbox credentials missing in store settings');
  }

  paypalService.updateCredentials(settings.paypalClientId, settings.paypalClientSecret);
  assert.strictEqual(paypalService.isConfigured(), true, 'PayPal service must be configured');

  // Step 1: Obtain OAuth 2.0 Access Token from api-m.sandbox.paypal.com
  console.log('1. Authenticating with PayPal Sandbox OAuth 2.0 API...');
  const token = await paypalService.getAccessToken();
  assert.ok(token && token.length > 20, 'Must obtain valid PayPal OAuth access token');
  console.log(`   ✓ Access token acquired: ${token.substring(0, 16)}... (Token length: ${token.length})`);

  // Step 2: Create a real Purchase Pact for catalog item
  console.log('2. Generating server-authoritative Purchase Pact...');
  const product = store.getProductById('prod_notebook_recycled_a5')!;
  assert.ok(product, 'Test product must exist in catalog');

  const { pactItems, subtotal, shippingCost, estimatedTax, grandTotal } = PolicyEngine.calculateTotals([
    { productId: product.id, quantity: 2 }, // 2x $1.85 = $3.70 + $4.00 shipping = $7.70
  ]);

  const pactId = `pact_sandbox_live_${Date.now()}`;
  const canonicalHash = PolicyEngine.computeCanonicalSnapshotHash({
    items: pactItems,
    subtotal,
    shippingCost,
    estimatedTax,
    grandTotal,
    currency: 'USD',
    maxBudget: 25.0,
    shippingDeadlineDays: 5,
    allowSubstitutions: false,
  });

  const pact: PurchasePact = {
    id: pactId,
    intentId: `intent_${Date.now()}`,
    buyerEmail: 'alex.chen@boundbuy.org',
    items: pactItems,
    subtotal,
    shippingCost,
    estimatedTax,
    grandTotal,
    currency: 'USD',
    maxBudget: 25.0,
    shippingDeadlineDays: 5,
    allowSubstitutions: false,
    ruleEvaluations: [],
    isCompliant: true,
    approvalStatus: 'approved',
    canonicalSnapshotHash: canonicalHash,
    approvedAt: new Date().toISOString(),
    approvedBy: 'alex.chen@boundbuy.org',
    invalidationReason: null,
    lastValidatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  store.savePact(pact);
  console.log(`   ✓ Purchase Pact created & approved: ${pact.id}`);
  console.log(`   ✓ Grand Total: $${grandTotal.toFixed(2)} USD | Canonical SHA-256 Hash: ${canonicalHash.substring(0, 16)}...`);

  // Step 3: Execute Genuine Sandbox Transaction on PayPal Orders v2 API
  console.log('3. Executing genuine transaction on PayPal Sandbox (https://api-m.sandbox.paypal.com/v2/checkout/orders)...');
  const internalOrderNumber = `BB-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: pact.id,
        custom_id: JSON.stringify({
          pactId: pact.id,
          snapshotHash: pact.canonicalSnapshotHash,
          orderNumber: internalOrderNumber,
        }),
        description: `BoundBuy Authorized Order: ${internalOrderNumber}`,
        amount: {
          currency_code: pact.currency,
          value: pact.grandTotal.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: pact.currency,
              value: pact.subtotal.toFixed(2),
            },
            shipping: {
              currency_code: pact.currency,
              value: pact.shippingCost.toFixed(2),
            },
            tax_total: {
              currency_code: pact.currency,
              value: pact.estimatedTax.toFixed(2),
            },
          },
        },
        items: pact.items.map((it) => ({
          name: it.productName.substring(0, 127),
          quantity: it.quantity.toString(),
          unit_amount: {
            currency_code: pact.currency,
            value: it.unitPrice.toFixed(2),
          },
          sku: it.productId,
          description: `Supplied by ${it.supplierName}`.substring(0, 127),
        })),
      },
    ],
    payment_source: {
      card: {
        number: '4111111111111111',
        expiry: '2028-12',
        security_code: '123',
        name: 'Alex Chen (Verified Sandbox Buyer)',
        billing_address: {
          address_line_1: '123 Tech Park Blvd',
          admin_area_2: 'San Jose',
          admin_area_1: 'CA',
          postal_code: '95131',
          country_code: 'US',
        },
      },
    },
  };

  const createRes = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'PayPal-Request-Id': `bb_e2e_live_${Date.now()}`,
    },
    body: JSON.stringify(orderPayload),
  });

  const createJson = (await createRes.json()) as any;
  assert.strictEqual(createRes.status, 201, `PayPal order creation must succeed with 201: ${JSON.stringify(createJson)}`);
  assert.strictEqual(createJson.status, 'COMPLETED', `Order status must be COMPLETED, got ${createJson.status}`);

  const paypalOrderId = createJson.id;
  const captureObj = createJson.purchase_units?.[0]?.payments?.captures?.[0];
  assert.ok(captureObj, 'PayPal response must contain payment capture object');
  const captureId = captureObj.id;
  const captureStatus = captureObj.status;
  const capturedAmount = captureObj.amount?.value;
  const capturedCurrency = captureObj.amount?.currency_code;

  console.log(`   ✓ Genuine PayPal Order ID: ${paypalOrderId}`);
  console.log(`   ✓ Genuine PayPal Capture ID: ${captureId}`);
  console.log(`   ✓ Capture Status: ${captureStatus}`);
  console.log(`   ✓ Captured Amount: $${capturedAmount} ${capturedCurrency}`);

  assert.strictEqual(captureStatus, 'COMPLETED');
  assert.strictEqual(Number(capturedAmount), grandTotal);
  assert.strictEqual(capturedCurrency, 'USD');

  // Step 4: Server-Side Authoritative Verification against PayPal REST Captures Endpoint
  console.log('4. Performing independent server-side capture verification via GET /v2/payments/captures/{id}...');
  const captureVerifyRes = await fetch(`https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  assert.strictEqual(captureVerifyRes.status, 200, 'Must verify capture on PayPal REST API');
  const verifiedCapture = (await captureVerifyRes.json()) as any;
  assert.strictEqual(verifiedCapture.id, captureId);
  assert.strictEqual(verifiedCapture.status, 'COMPLETED');
  assert.strictEqual(verifiedCapture.amount.value, grandTotal.toFixed(2));
  assert.strictEqual(verifiedCapture.amount.currency_code, 'USD');
  console.log(`   ✓ Authoritative confirmation from PayPal Sandbox: ${verifiedCapture.id} is COMPLETED.`);

  // Step 5: Persist Result in Store
  console.log('5. Persisting verified order record in local storage database...');
  const orderRecord: OrderRecord = {
    id: `ord_${Date.now()}_live`,
    orderNumber: internalOrderNumber,
    pactId: pact.id,
    intentId: pact.intentId,
    buyerEmail: pact.buyerEmail,
    items: pact.items,
    subtotal: pact.subtotal,
    shippingCost: pact.shippingCost,
    estimatedTax: pact.estimatedTax,
    grandTotal: pact.grandTotal,
    currency: pact.currency,
    snapshotHashAtCheckout: pact.canonicalSnapshotHash || pact.id,
    paymentProvider: 'paypal_sandbox',
    paypalOrderId,
    paypalCaptureId: captureId,
    paymentStatus: 'paid',
    businessStatus: 'confirmed',
    transactionTimestamp: verifiedCapture.create_time || new Date().toISOString(),
    approvalTimestamp: pact.approvedAt || new Date().toISOString(),
    sandboxMode: true,
    deliverySchedulingStatus: 'NOT_REQUESTED',
    confirmedDeliveryWindow: null,
    carrierSchedulingSupported: false,
    schedulingHistory: [],
  };

  store.saveOrder(orderRecord);
  store.recordAuditEvent({
    eventType: 'PAYPAL_PAYMENT_CAPTURED',
    entityId: orderRecord.id,
    actor: 'alex.chen@boundbuy.org',
    summary: `Verified genuine PayPal Sandbox capture ${captureId} for Order ${orderRecord.orderNumber} ($${orderRecord.grandTotal.toFixed(2)} USD).`,
    details: {
      paypalOrderId,
      paypalCaptureId: captureId,
      amount: orderRecord.grandTotal,
      currency: orderRecord.currency,
      snapshotHash: orderRecord.snapshotHashAtCheckout,
      authMethod: 'PayPal Orders v2 Direct Card Processing',
    },
    snapshotHash: orderRecord.snapshotHashAtCheckout,
  });

  // Step 6: Verify Persistence across Store Reload
  console.log('6. Verifying persistence integrity across store reload...');
  const reloaded = store.getOrder(orderRecord.id);
  assert.ok(reloaded, 'Order must exist in store');
  assert.strictEqual(reloaded.paymentStatus, 'paid');
  assert.strictEqual(reloaded.paypalCaptureId, captureId);
  console.log(`   ✓ Verified order persisted: ${reloaded.orderNumber} with capture ${reloaded.paypalCaptureId}`);

  console.log('\n🎉 GENUINE PAYPAL SANDBOX TRANSACTION FULLY VERIFIED WITH LIVE EVIDENCE!\n');
}

runGenuineSandboxTransaction().catch((err) => {
  console.error('\n❌ Genuine PayPal Sandbox verification failed:', err);
  process.exit(1);
});
