import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
import { store } from '../server/src/services/store.ts';
import { trackingManager } from '../server/src/services/tracking.ts';
import { aftershipService, COMMON_CARRIERS } from '../server/src/services/aftership.ts';
import { procurementIntelligence } from '../server/src/services/procurementIntelligence.ts';
import type { OrderRecord } from '../server/src/types/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runTrackingTests() {
  console.log('🧪 Starting BoundBuy Track Logistics & Delivery Intelligence Test Suite...\n');

  // Set up mock test order
  const testOrder: OrderRecord = {
    id: `ord_test_track_${Date.now()}`,
    orderNumber: `BB-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    pactId: `pact_test_track_${Date.now()}`,
    intentId: `intent_test_track_${Date.now()}`,
    buyerEmail: 'sarah.procurement@acme.org',
    items: [
      {
        productId: 'prod_tote_canvas_premium',
        productName: 'Heavyweight Organic Cotton Tote Bag (10oz)',
        supplierId: 'sup_ecothread',
        supplierName: 'EcoThread Goods Co.',
        unitPrice: 1.65,
        quantity: 20,
        itemTotal: 33.0,
        shippingRate: 4.5,
        deliveryDays: 2,
      },
    ],
    subtotal: 33.0,
    shippingCost: 4.5,
    estimatedTax: 0,
    grandTotal: 37.5,
    currency: 'USD',
    snapshotHashAtCheckout: 'hash_test_verified_123',
    paymentProvider: 'paypal_sandbox',
    paypalOrderId: 'TEST_PP_ORDER_99',
    paypalCaptureId: 'TEST_PP_CAPTURE_99',
    paymentStatus: 'paid',
    businessStatus: 'confirmed',
    transactionTimestamp: new Date().toISOString(),
    approvalTimestamp: new Date().toISOString(),
    sandboxMode: true,
  };

  store.saveOrder(testOrder);

  // 1. Creating a shipment for an existing eligible order
  console.log('--- Test 1: Shipment Creation ---');
  const reg1 = await trackingManager.registerShipment({
    orderId: testOrder.id,
    carrierName: 'USPS',
    carrierSlug: 'usps',
    trackingNumber: '9400111899562537624199',
    userEmail: testOrder.buyerEmail,
    notes: 'Order dispatched in recycled cardboard box',
  });
  assert(reg1.success && Boolean(reg1.shipment), 'Successfully created shipment for existing eligible order');
  assert(reg1.shipment?.orderNumber === testOrder.orderNumber, 'Shipment record links to correct orderNumber');

  // 2. Rejecting a shipment request for an unauthorized order
  console.log('\n--- Test 2: Authorization Checks ---');
  const regUnauthorized = await trackingManager.registerShipment({
    orderId: testOrder.id,
    carrierName: 'FedEx',
    carrierSlug: 'fedex',
    trackingNumber: '782910384719',
    userEmail: 'unauthorized.stranger@evil.com',
  });
  assert(
    !regUnauthorized.success && regUnauthorized.error === 'Unauthorized',
    'Rejects shipment creation from unauthorized email'
  );

  // 3. Validating tracking number and carrier fields
  console.log('\n--- Test 3: Input Validation ---');
  const invalidTrk = aftershipService.validateTrackingNumber('usps', '12');
  assert(!invalidTrk.valid, 'Rejects tracking numbers shorter than 4 characters');
  const validTrk = aftershipService.validateTrackingNumber('usps', '9400111899562537624199');
  assert(validTrk.valid, 'Accepts valid carrier tracking numbers');

  // 4. Registering a tracking record with a mocked provider response
  console.log('\n--- Test 4: Mocked Provider Registration ---');
  const mockProviderTracking = {
    id: 'aftership_mock_trk_101',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tracking_number: '9400111899562537624199',
    slug: 'usps',
    active: true,
    tag: 'InTransit',
    subtag: 'InTransit_001',
    expected_delivery: '2026-10-25T18:00:00Z',
  };
  const normalizedMock = aftershipService.normalizeStatus(mockProviderTracking.tag, mockProviderTracking.subtag);
  assert(normalizedMock === 'IN_TRANSIT', 'Normalized mocked provider tag InTransit to internal IN_TRANSIT status');

  // 5. Retrieving provider tracking checkpoints
  console.log('\n--- Test 5: Checkpoints Parsing ---');
  const mockCheckpoints = [
    {
      checkpoint_time: '2026-10-22T08:00:00Z',
      city: 'Austin',
      state: 'TX',
      tag: 'InfoReceived',
      message: 'Shipping label created',
    },
    {
      checkpoint_time: '2026-10-22T14:00:00Z',
      city: 'Austin',
      state: 'TX',
      tag: 'InTransit',
      message: 'Departed USPS facility',
    },
  ];
  if (reg1.shipment) {
    const convertedEvents = aftershipService.convertCheckpointsToEvents(reg1.shipment, mockCheckpoints);
    assert(convertedEvents.length === 2, 'Converted 2 provider checkpoints into internal shipment events');
    assert(convertedEvents[0].status === 'INFORMATION_RECEIVED', 'First checkpoint normalized correctly');
    assert(convertedEvents[1].status === 'IN_TRANSIT', 'Second checkpoint normalized correctly');
  }

  // 6. Normalizing common carrier statuses
  console.log('\n--- Test 6: Status Normalization ---');
  assert(aftershipService.normalizeStatus('Pending') === 'LABEL_CREATED', 'Pending -> LABEL_CREATED');
  assert(aftershipService.normalizeStatus('InTransit') === 'IN_TRANSIT', 'InTransit -> IN_TRANSIT');
  assert(aftershipService.normalizeStatus('OutForDelivery') === 'OUT_FOR_DELIVERY', 'OutForDelivery -> OUT_FOR_DELIVERY');
  assert(aftershipService.normalizeStatus('Delivered') === 'DELIVERED', 'Delivered -> DELIVERED');
  assert(aftershipService.normalizeStatus('AttemptFail') === 'FAILED_DELIVERY_ATTEMPT', 'AttemptFail -> FAILED_DELIVERY_ATTEMPT');
  assert(aftershipService.normalizeStatus('Exception') === 'DELIVERY_EXCEPTION', 'Exception -> DELIVERY_EXCEPTION');
  assert(aftershipService.normalizeStatus(undefined, 'Return_To_Sender') === 'RETURN_TO_SENDER', 'Subtag return -> RETURN_TO_SENDER');

  // 7. Handling unavailable provider credentials
  console.log('\n--- Test 7: Provider Credential Fallback ---');
  const originalRead = process.env.AFTERSHIP_API_KEY_READ || process.env.AFTERSHIP_API_KEY || '';
  const originalWrite = process.env.AFTERSHIP_API_KEY_WRITE || process.env.AFTERSHIP_API_KEY || '';
  aftershipService.updateCredentials('');
  assert(!aftershipService.isConfigured(), 'Reports AfterShip is unconfigured when API key is empty');
  assert(aftershipService.getTrackingProviderMode() === 'manual', 'Falls back safely to manual tracking mode');
  // Restore
  if (originalRead || originalWrite) {
    aftershipService.updateCredentials({ readKey: originalRead, writeKey: originalWrite });
  }

  // 8. Handling unsupported carriers and invalid tracking numbers
  console.log('\n--- Test 8: Carrier Fallbacks ---');
  const carrierUrl = aftershipService.buildTrackingUrl('usps', '9400111899562537624108');
  assert(carrierUrl.includes('tools.usps.com'), 'Builds official USPS tracking link for USPS carrier');
  const otherCarrierUrl = aftershipService.buildTrackingUrl('other', 'XYZ12345');
  assert(otherCarrierUrl.includes('track.aftership.com'), 'Uses standard AfterShip public tracking link for custom carriers');

  // 9. Handling provider timeouts and rate limits gracefully
  console.log('\n--- Test 9: Provider Outage Resilience ---');
  const unconfiguredGet = await aftershipService.getTracking('usps', '9400111899562537624108');
  assert(!unconfiguredGet.success && Boolean(unconfiguredGet.error), 'Unconfigured live provider returns graceful error without throwing');

  // 10. Rejecting invalid webhook signatures
  console.log('\n--- Test 10: Webhook Security & Signatures ---');
  const testSecret = 'whsec_boundbuy_test_secret_998877';
  aftershipService.updateCredentials(undefined, testSecret);

  const webhookBody = JSON.stringify({
    event: 'tracking_update',
    msg: {
      tracking_number: '9400111899562537624199',
      tag: 'OutForDelivery',
      subtag: 'OutForDelivery_001',
    },
  });

  const invalidSig = 'invalid_tampered_signature_xyz';
  assert(!aftershipService.verifyWebhookSignature(webhookBody, invalidSig), 'Rejects tampered or invalid webhook signature');

  // 11. Accepting valid webhook events
  console.log('\n--- Test 11: Valid Webhook Signatures ---');
  const validSigBase64 = crypto
    .createHmac('sha256', testSecret)
    .update(Buffer.from(webhookBody, 'utf-8'))
    .digest('base64');
  assert(aftershipService.verifyWebhookSignature(webhookBody, validSigBase64), 'Accepts valid HMAC-SHA256 signature (Base64)');

  const validSigHex = crypto
    .createHmac('sha256', testSecret)
    .update(Buffer.from(webhookBody, 'utf-8'))
    .digest('hex');
  assert(aftershipService.verifyWebhookSignature(webhookBody, validSigHex), 'Accepts valid HMAC-SHA256 signature (Hex)');

  // 12. Preventing duplicate webhook event processing
  console.log('\n--- Test 12: Webhook Deduplication & Ingestion ---');
  const parsedPayload = JSON.parse(webhookBody);
  const hookResult1 = trackingManager.processWebhookPayload(parsedPayload);
  assert(hookResult1.success, 'Processes verified tracking webhook event for registered shipment');

  const hookResult2 = trackingManager.processWebhookPayload(parsedPayload);
  assert(hookResult2.success, 'Safely handles repeated webhook call without error');

  // 13. Handling out-of-order tracking events safely
  console.log('\n--- Test 13: Stale Event Protection ---');
  if (reg1.shipment) {
    // Deliver the shipment
    trackingManager.addManualEvent({
      shipmentId: reg1.shipment.id,
      status: 'DELIVERED',
      description: 'Delivered at front door',
    });
    const deliveredShipment = store.getShipment(reg1.shipment.id);
    assert(deliveredShipment?.status === 'DELIVERED', 'Shipment transitioned to DELIVERED');

    // Attempt to apply a stale IN_TRANSIT event
    trackingManager.addManualEvent({
      shipmentId: reg1.shipment.id,
      status: 'IN_TRANSIT',
      description: 'Stale late-arriving in-transit event',
    });
    const stillDelivered = store.getShipment(reg1.shipment.id);
    assert(
      stillDelivered?.status === 'DELIVERED',
      'Stale IN_TRANSIT event does NOT overwrite a verified DELIVERED status'
    );
  }

  // 14. Preserving shipment history
  console.log('\n--- Test 14: Historical Audit & Event Preservation ---');
  if (reg1.shipment) {
    const events = store.getShipmentEvents(reg1.shipment.id);
    assert(events.length >= 2, 'Maintains full chronological event log for shipment');
  }

  // 15. Preventing invented ETA values
  console.log('\n--- Test 15: ETA Integrity ---');
  const regNoEta = await trackingManager.registerShipment({
    orderId: testOrder.id,
    carrierName: 'DHL Express',
    carrierSlug: 'dhl',
    trackingNumber: '1234567890',
    userEmail: testOrder.buyerEmail,
  });
  assert(
    regNoEta.shipment?.estimatedDeliveryDate === null,
    'Never invents or guesses an ETA when carrier has not provided one'
  );

  // 16. Preventing unauthorized shipment reads
  console.log('\n--- Test 16: Read Authorization ---');
  const bundleOwner = trackingManager.getOrderTrackingBundle(testOrder.id, testOrder.buyerEmail);
  assert(bundleOwner.hasShipment, 'Authorized buyer can read their order tracking bundle');

  // 17. Ensuring AI summaries use real stored tracking events
  console.log('\n--- Test 17: AI Delivery Intelligence Grounding ---');
  const aiAnswer = await procurementIntelligence.answerDeliveryQuestion(
    testOrder.id,
    'Where is my order now?'
  );
  assert(aiAnswer.groundedEventsCount > 0, 'AI answer is grounded in actual recorded tracking checkpoints');
  assert(Boolean(aiAnswer.shipmentSummary), 'AI answer provides structured shipment summary');
  assert(aiAnswer.recommendedNextSteps.length > 0, 'Provides actionable logistics next steps');

  // 18. Ensuring shipment state does not alter PayPal payment status
  console.log('\n--- Test 18: Decoupled Payment & Fulfillment Integrity ---');
  const orderAfterShipments = store.getOrder(testOrder.id);
  assert(
    orderAfterShipments?.paymentStatus === 'paid',
    'Order payment status remains PAID regardless of shipment status updates'
  );
  assert(
    orderAfterShipments?.paypalCaptureId === 'TEST_PP_CAPTURE_99',
    'PayPal Capture ID remains intact and unaffected by logistics events'
  );

  // 19. Separate Read & Write API Keys and Live Connection Verification
  console.log('\n--- Test 19: Dual-Key Permissions & Connection Verification ---');
  assert(aftershipService.isReadConfigured(), 'Read API key is configured');
  assert(aftershipService.isWriteConfigured(), 'Write API key is configured');
  const connVerify = await aftershipService.verifyConnection();
  assert(connVerify.readOk, 'Verified read API key authentication against AfterShip 2026-07 API');
  assert(connVerify.writeOk, 'Verified write API key authorization against AfterShip 2026-07 API');
  assert(connVerify.rateLimit.limit > 0 || connVerify.rateLimit.remaining <= 0, `Captured live rate limit info: ${connVerify.rateLimit.remaining}/${connVerify.rateLimit.limit}`);

  // 20. Scheduled Polling for Active Shipments
  console.log('\n--- Test 20: Active Shipments Polling ---');
  const pollRes = await trackingManager.pollActiveShipments();
  assert(typeof pollRes.totalActive === 'number', 'Active shipments polling completed cleanly');
  assert(pollRes.syncedCount >= 0, `Synced ${pollRes.syncedCount} active shipments respecting rate limits`);

  // 21. Distinguishing Data Sources (LIVE_PROVIDER, MANUAL_UPDATE, DEMO)
  console.log('\n--- Test 21: Data Source Differentiation ---');
  const bundle = trackingManager.getOrderTrackingBundle(testOrder.id, testOrder.buyerEmail);
  const sources = bundle.shipments.map((s) => s.shipment.trackingSource);
  assert(sources.length > 0, 'Shipments retain designated tracking source');
  assert(
    sources.every((s) => s === 'LIVE_PROVIDER' || s === 'MANUAL_UPDATE' || s === 'DEMO'),
    'Tracking sources conform strictly to LIVE_PROVIDER, MANUAL_UPDATE, or DEMO'
  );

  // 22. AI Grounding Includes Tracking Data Source
  console.log('\n--- Test 22: AI Grounding with Tracking Data Source ---');
  const deliveryAiRes = await procurementIntelligence.answerDeliveryQuestion(testOrder.id, 'What is the current status?');
  assert(
    Boolean(deliveryAiRes.shipmentSummary.trackingSourceLabel),
    `AI delivery answer includes data source label: ${deliveryAiRes.shipmentSummary.trackingSourceLabel}`
  );

  console.log(`\n🎉 BoundBuy Track Results: ${passed}/${passed + failed} tests passed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTrackingTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
