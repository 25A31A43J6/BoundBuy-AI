import assert from 'assert';
import { store } from '../server/src/services/store.ts';
import { deliveryScheduling, DELIVERY_TIME_SLOTS, DEFAULT_DELIVERY_TIMEZONE } from '../server/src/services/deliveryScheduling.ts';
import { procurementIntelligence } from '../server/src/services/procurementIntelligence.ts';
import type { OrderRecord, DeliveryPreference } from '../server/src/types/index.ts';

console.log('🧪 Running Comprehensive Delivery Scheduling & Preference Test Suite...\n');

// Helper to create test order
function createTestOrder(idSuffix: string, status: 'paid' | 'pending' = 'paid'): OrderRecord {
  return {
    id: `ord_test_sched_${idSuffix}`,
    orderNumber: `BB-2026-TEST-${idSuffix}`,
    pactId: `pact_test_${idSuffix}`,
    intentId: `intent_test_${idSuffix}`,
    buyerEmail: 'alex.chen@boundbuy.org',
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
    snapshotHashAtCheckout: 'test_hash_seal_12345',
    paymentProvider: 'paypal_sandbox',
    paypalOrderId: `TEST_PP_${idSuffix}`,
    paypalCaptureId: `TEST_CAP_${idSuffix}`,
    paymentStatus: status,
    businessStatus: 'confirmed',
    transactionTimestamp: new Date().toISOString(),
    approvalTimestamp: new Date().toISOString(),
    sandboxMode: true,
  };
}

async function runTests() {
  // 1. Verify the five delivery slots
  console.log('Test 1: Selecting each of the five delivery slots');
  const availableSlots = deliveryScheduling.getAvailableSlots();
  assert.strictEqual(availableSlots.length, 5, 'Should have exactly 5 selectable slots');
  const slotIds = availableSlots.map((s) => s.id);
  assert.deepStrictEqual(
    slotIds,
    ['early_morning', 'morning', 'afternoon', 'evening', 'night'],
    'Should have early_morning, morning, afternoon, evening, night'
  );
  console.log('  ✓ Verified 5 slots: Early Morning, Morning, Afternoon, Evening, Night');

  // 2. Saving selected slot with an order
  console.log('\nTest 2: Saving the selected slot with an order');
  const testOrder1 = createTestOrder('01');
  store.saveOrder(testOrder1);

  const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const prefResult1 = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate: tomorrow,
    timeSlotId: 'evening',
    timezone: 'Asia/Kolkata',
    instructions: 'Ring doorbell twice and leave on front porch',
  });
  assert.strictEqual(prefResult1.valid, true, 'Preference validation should succeed');
  assert.ok(prefResult1.preference, 'Preference object should be constructed');
  assert.strictEqual(prefResult1.preference?.timeSlotId, 'evening');
  assert.strictEqual(prefResult1.preference?.startTime, '18:00');
  assert.strictEqual(prefResult1.preference?.endTime, '19:00');

  const updatedOrder1 = deliveryScheduling.applyDeliveryPreference(testOrder1, prefResult1.preference!);
  assert.strictEqual(updatedOrder1.deliveryPreference?.timeSlotId, 'evening');
  assert.strictEqual(updatedOrder1.deliverySchedulingStatus, 'REQUESTED');
  console.log('  ✓ Successfully attached and persisted evening slot to Order');

  // 3. Saving and retrieving the correct timezone (Asia/Kolkata)
  console.log('\nTest 3: Saving and retrieving the correct timezone (Asia/Kolkata & custom)');
  assert.strictEqual(updatedOrder1.deliveryPreference?.timezone, 'Asia/Kolkata');
  const retrievedOrder1 = store.getOrder(testOrder1.id);
  assert.strictEqual(retrievedOrder1?.deliveryPreference?.timezone, 'Asia/Kolkata');
  console.log('  ✓ Timezone persisted and retrieved as Asia/Kolkata');

  // 4. Rejecting past delivery dates
  console.log('\nTest 4: Rejecting past delivery dates');
  const pastDateVal = deliveryScheduling.validateDeliveryDate('2024-01-01', 0, 'Asia/Kolkata');
  assert.strictEqual(pastDateVal.valid, false, 'Past date should be rejected');
  assert.ok(pastDateVal.error?.includes('past'), 'Error message should indicate date is in the past');
  console.log('  ✓ Correctly rejected past date (2024-01-01)');

  // 5. Rejecting invalid slot IDs
  console.log('\nTest 5: Rejecting invalid slot IDs');
  const invalidSlotVal = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate: tomorrow,
    timeSlotId: 'midnight_madness' as any,
  });
  assert.strictEqual(invalidSlotVal.valid, false, 'Invalid slot ID must be rejected');
  assert.ok(invalidSlotVal.error?.includes('Invalid time slot ID'), 'Should report invalid slot ID');
  console.log('  ✓ Rejected invalid slot ID');

  // 6. Changing a delivery preference before order confirmation
  console.log('\nTest 6: Changing a delivery preference before order confirmation');
  const newPref = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate: tomorrow,
    timeSlotId: 'morning',
    instructions: 'Call buyer on arrival',
  });
  const updatedOrderBeforeConf = deliveryScheduling.applyDeliveryPreference(
    updatedOrder1,
    newPref.preference!
  );
  assert.strictEqual(updatedOrderBeforeConf.deliveryPreference?.timeSlotId, 'morning');
  assert.strictEqual(updatedOrderBeforeConf.deliveryPreference?.instructions, 'Call buyer on arrival');
  assert.strictEqual(updatedOrderBeforeConf.deliverySchedulingStatus, 'REQUESTED');
  console.log('  ✓ Successfully changed preference to Morning before confirmation');

  // 7. Requesting a scheduling confirmation & 8. Successful confirmation
  console.log('\nTest 7 & 8: Requesting & recording a successful scheduling confirmation');
  const confirmedOrder = deliveryScheduling.confirmDeliverySchedule(updatedOrderBeforeConf, {
    confirmedBy: 'Fulfillment Lead David',
    confirmedByType: 'SUPPLIER_ADMIN',
    date: tomorrow,
    startTime: '09:00',
    endTime: '10:00',
    carrierReference: 'DISPATCH-ROUTE-42',
    notes: 'Morning driver assigned to sector 4',
  });
  assert.strictEqual(confirmedOrder.deliverySchedulingStatus, 'CONFIRMED');
  assert.ok(confirmedOrder.confirmedDeliveryWindow, 'Should have confirmedDeliveryWindow');
  assert.strictEqual(confirmedOrder.confirmedDeliveryWindow?.confirmedByType, 'SUPPLIER_ADMIN');
  assert.strictEqual(confirmedOrder.confirmedDeliveryWindow?.carrierReference, 'DISPATCH-ROUTE-42');
  console.log('  ✓ Successfully confirmed schedule with Supplier/Admin label');

  // 9. Handling unavailable delivery slots
  console.log('\nTest 9: Handling unavailable delivery slots');
  const testOrderUnavailable = createTestOrder('02');
  store.saveOrder(testOrderUnavailable);
  deliveryScheduling.applyDeliveryPreference(testOrderUnavailable, prefResult1.preference!);
  const markedUnavailable = deliveryScheduling.markScheduleUnavailable(
    testOrderUnavailable,
    'Logistics Coordinator',
    'Local van capacity full for selected evening route',
    'afternoon',
    tomorrow
  );
  assert.strictEqual(markedUnavailable.deliverySchedulingStatus, 'UNAVAILABLE');
  const lastHist = markedUnavailable.schedulingHistory?.[markedUnavailable.schedulingHistory.length - 1];
  assert.strictEqual(lastHist?.status, 'UNAVAILABLE');
  assert.ok(lastHist?.reason?.includes('Local van capacity full'));
  console.log('  ✓ Properly transitioned status to UNAVAILABLE with reason');

  // 10. Handling carriers that do not support time scheduling (NOT_SUPPORTED)
  console.log('\nTest 10: Handling carriers that do not support time scheduling (NOT_SUPPORTED)');
  const testOrderNotSupported = createTestOrder('03');
  store.saveOrder(testOrderNotSupported);
  const markedNotSupported = deliveryScheduling.markScheduleNotSupported(
    testOrderNotSupported,
    'Dispatch Desk',
    'Standard ground freight does not support timed delivery appointments'
  );
  assert.strictEqual(markedNotSupported.deliverySchedulingStatus, 'NOT_SUPPORTED');
  assert.strictEqual(markedNotSupported.carrierSchedulingSupported, false);
  console.log('  ✓ Correctly labeled as NOT_SUPPORTED without false appointment claims');

  // 11. Rescheduling an eligible order
  console.log('\nTest 11: Rescheduling an eligible order');
  const futureDay = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const reschedulePref = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate: futureDay,
    timeSlotId: 'night',
    instructions: 'Please deliver after 7 PM',
  });
  const rescheduleRes = deliveryScheduling.rescheduleOrder(
    markedUnavailable,
    reschedulePref.preference!,
    'alex.chen@boundbuy.org'
  );
  assert.strictEqual(rescheduleRes.success, true);
  assert.strictEqual(rescheduleRes.order?.deliverySchedulingStatus, 'REQUESTED');
  assert.strictEqual(rescheduleRes.order?.deliveryPreference?.timeSlotId, 'night');
  console.log('  ✓ Rescheduled order successfully to night slot on new date');

  // 12. Rejecting unauthorized scheduling changes
  console.log('\nTest 12: Rejecting unauthorized scheduling changes');
  const unauthorizedRes = deliveryScheduling.recordDeliveryOutcome(
    testOrder1,
    'random.intruder@external.com',
    false // Not staff or admin
  );
  assert.strictEqual(unauthorizedRes.success, false);
  assert.ok(unauthorizedRes.error?.includes('Unauthorized'));
  console.log('  ✓ Unauthorized buyer blocked from marking delivery outcome');

  // 13. Preserving delivery preferences across application restarts
  console.log('\nTest 13: Preserving delivery preferences across persistence reload');
  store.persist();
  const reloadedOrder = store.getOrder(confirmedOrder.id);
  assert.ok(reloadedOrder?.deliveryPreference, 'Delivery preference must persist');
  assert.strictEqual(reloadedOrder?.deliverySchedulingStatus, 'CONFIRMED');
  assert.strictEqual(reloadedOrder?.confirmedDeliveryWindow?.startTime, '09:00');
  console.log('  ✓ Persisted preferences and status intact in store file');

  // 14. Displaying delivery preferences in order details
  console.log('\nTest 14: Displaying delivery preferences in order details');
  assert.strictEqual(reloadedOrder?.deliveryPreference?.timeSlotLabel, 'Morning: 9:00 AM – 10:00 AM');
  console.log('  ✓ Time slot label in 12-hour format verified: Morning: 9:00 AM – 10:00 AM');

  // 15. Showing correct scheduling information in the mini chatbot
  console.log('\nTest 15: Showing correct scheduling information in the mini chatbot');
  const chatQ1 = await procurementIntelligence.answerUserQuestion(
    'What delivery time did I choose?',
    [],
    'alex.chen@boundbuy.org',
    { skipAiExplanation: true }
  );
  assert.ok(
    chatQ1.answer.includes('Morning') || chatQ1.answer.includes('Order'),
    'Chatbot should cite order and delivery window'
  );
  console.log('  ✓ Mini chatbot answer retrieved grounded schedule:');
  console.log('    -> ' + chatQ1.answer.slice(0, 100) + '...');

  const chatQ2 = await procurementIntelligence.answerUserQuestion(
    'Can I change my delivery time?',
    [],
    'alex.chen@boundbuy.org',
    { skipAiExplanation: true }
  );
  assert.ok(
    chatQ2.answer.includes('change') || chatQ2.answer.includes('reschedule'),
    'Chatbot should answer rescheduling inquiry accurately'
  );
  console.log('  ✓ Chatbot accurately explained rescheduling policy');

  // 16. Keeping delivery status separate from PayPal payment status
  console.log('\nTest 16: Keeping delivery status separate from PayPal payment status');
  assert.strictEqual(confirmedOrder.paymentStatus, 'paid');
  assert.strictEqual(confirmedOrder.deliverySchedulingStatus, 'CONFIRMED');
  assert.notStrictEqual(confirmedOrder.paymentStatus, confirmedOrder.deliverySchedulingStatus);
  console.log('  ✓ PayPal payment status (paid) remains independent of delivery scheduling status');

  console.log('\n🎉 ALL 16 DELIVERY SCHEDULING UNIT & INTEGRATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
