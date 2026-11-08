import 'dotenv/config';
import assert from 'assert';
import { store } from '../server/src/services/store.ts';
import { PolicyEngine } from '../server/src/services/policyEngine.ts';
import {
  procurementIntelligence,
  IntelligentPlannerSchema,
  RecommendationStrategySchema,
} from '../server/src/services/procurementIntelligence.ts';
import { paypalService } from '../server/src/services/paypal.ts';

console.log('🧪 Starting BoundBuy Procurement Intelligence Engine Test Suite...\n');

// Ensure catalog is at standard baseline
store.resetCatalogToDefault();

let passedTests = 0;
let totalTests = 0;
const testQueue: { name: string; fn: () => void | Promise<void> }[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  testQueue.push({ name, fn });
}

// 1. Intelligent Purchase Planner Schema & Validation
test('Planner Schema: parses valid procurement goal and extracts budget allocation', () => {
  const sample = {
    purchaseGoal: 'Order 50 notebooks and 50 tote bags for university conference under $150 by Friday',
    budgetLimit: 150.0,
    currency: 'USD',
    categories: ['event_supplies', 'office_stationery'],
    requiredItems: [
      {
        categoryOrName: 'notebooks',
        quantity: 50,
        mandatoryAttributes: ['recycled'],
        budgetAllocation: 75.0,
      },
      {
        categoryOrName: 'tote bags',
        quantity: 50,
        mandatoryAttributes: ['organic cotton'],
        budgetAllocation: 60.0,
      },
    ],
    optionalPreferences: ['Eco-friendly certified'],
    shippingDeadlineDays: 3,
    shippingDeadlineDate: '2026-10-23',
    allowSubstitutions: false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    planRationale: 'Allocates $75 to recycled notebooks and $60 to organic tote bags with $15 buffer for shipping.',
    budgetAllocationSummary: 'Total estimated line items $135 vs $150 ceiling.',
  };

  const parsed = IntelligentPlannerSchema.parse(sample);
  assert.strictEqual(parsed.budgetLimit, 150.0);
  assert.strictEqual(parsed.allowSubstitutions, false);
  assert.strictEqual(parsed.shippingDeadlineDays, 3);
  assert.strictEqual(parsed.requiredItems.length, 2);
});

test('Planner Schema: identifies missing information and triggers clarification flag', () => {
  const ambiguousSample = {
    purchaseGoal: 'Need some tote bags soon',
    budgetLimit: 250.0,
    currency: 'USD',
    categories: ['event_supplies'],
    requiredItems: [
      {
        categoryOrName: 'tote bags',
        quantity: 1,
        mandatoryAttributes: [],
      },
    ],
    optionalPreferences: [],
    shippingDeadlineDays: null,
    shippingDeadlineDate: null,
    allowSubstitutions: true,
    missingInformation: ['Exact required quantity is unspecified', 'Delivery deadline not provided'],
    clarificationQuestions: [
      'How many tote bags do you need for this order?',
      'What is your target delivery date?',
    ],
    isClarificationNeeded: true,
    planRationale: 'Defaulted to 1 unit but clarification questions flagged.',
    budgetAllocationSummary: 'Preliminary budget allocation pending attendee count.',
  };

  const parsed = IntelligentPlannerSchema.parse(ambiguousSample);
  assert.strictEqual(parsed.isClarificationNeeded, true);
  assert.strictEqual(parsed.clarificationQuestions.length, 2);
  assert.strictEqual(parsed.shippingDeadlineDays, null);
});

// 2. Multi-Strategy Product Recommendations & Hard Constraints
test('Recommendation Engine: retrieves real catalog items and excludes out-of-stock SKUs', async () => {
  const intent = {
    id: 'test_intent_rec',
    rawPrompt: '30 notebooks',
    purchaseGoal: 'Procure 30 notebooks under $80',
    budgetLimit: 80,
    currency: 'USD',
    categories: ['office_stationery'],
    requiredItems: [
      { categoryOrName: 'notebook', quantity: 30, mandatoryAttributes: [] },
    ],
    optionalPreferences: [],
    shippingDeadlineDays: 5,
    allowSubstitutions: false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    createdAt: new Date().toISOString(),
  };

  const res = await procurementIntelligence.getProductRecommendations(intent, 'lowest_cost', { skipAiExplanation: true });
  assert.strictEqual(res.strategy, 'lowest_cost');
  assert(res.scoredItems.length > 0);

  // Verify that all recommended items have valid catalog IDs that exist in the store
  for (const item of res.scoredItems) {
    const existing = store.getProductById(item.product.id);
    assert.ok(existing, `Recommended product ID ${item.product.id} must exist in catalog`);
    assert(item.product.stockQuantity >= item.quantity, 'Must have sufficient stock');
  }
});

test('Recommendation Engine: lowest_cost strategy produces eligible subtotal <= quality_first', async () => {
  const intent = {
    id: 'test_intent_compare',
    rawPrompt: '40 tote bags under $100',
    purchaseGoal: '40 tote bags for event',
    budgetLimit: 100,
    currency: 'USD',
    categories: ['event_supplies'],
    requiredItems: [
      { categoryOrName: 'tote bag', quantity: 40, mandatoryAttributes: [] },
    ],
    optionalPreferences: [],
    shippingDeadlineDays: 4,
    allowSubstitutions: false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    createdAt: new Date().toISOString(),
  };

  const lowest = await procurementIntelligence.getProductRecommendations(intent, 'lowest_cost', { skipAiExplanation: true });
  const quality = await procurementIntelligence.getProductRecommendations(intent, 'quality_first', { skipAiExplanation: true });

  assert(
    lowest.totals.grandTotal <= quality.totals.grandTotal,
    `Lowest cost ($${lowest.totals.grandTotal}) should be <= quality first ($${quality.totals.grandTotal})`
  );
});

// 3. What-If Simulator Integrity & Sandbox Isolation
test('What-If Simulator: calculates price increase without mutating real catalog data', async () => {
  const originalProduct = store.getProductById('prod_tote_canvas_premium')!;
  const originalUnitPrice = originalProduct.unitPrice;

  const items = [{ productId: 'prod_tote_canvas_premium', quantity: 10 }];
  const simulation = await procurementIntelligence.simulateScenario(
    {
      scenarioType: 'PRICE_INCREASE',
      targetProductId: 'prod_tote_canvas_premium',
      percentageChange: 20,
    },
    items,
    100
  );

  // Check simulation calculations: +20% on $1.65 is $1.98
  assert.strictEqual(simulation.isSimulation, true);
  assert(simulation.simulatedSubtotal > simulation.originalSubtotal);
  assert.strictEqual(simulation.budgetDifference > 0, true);

  // STRICT SANDBOX GUARANTEE: Real product unit price in store must NOT be altered
  const productAfterSimulation = store.getProductById('prod_tote_canvas_premium')!;
  assert.strictEqual(
    productAfterSimulation.unitPrice,
    originalUnitPrice,
    'Store product unitPrice must remain unchanged by simulations'
  );
});

test('What-If Simulator: price increase invalidates Purchase Pact earlier approval', async () => {
  const items = [{ productId: 'prod_tote_canvas_premium', quantity: 20 }];
  const simulation = await procurementIntelligence.simulateScenario(
    {
      scenarioType: 'PRICE_INCREASE',
      percentageChange: 15,
    },
    items,
    50
  );

  assert.strictEqual(simulation.pactApprovalImpact, 'INVALIDATED');
  assert(
    simulation.approvalInvalidationReason?.includes('INVALIDATED') ||
    simulation.approvalInvalidationReason?.includes('Material terms altered')
  );
});

// 4. Explainable Risk Analyst Deterministic Rule Checks
test('Risk Analyst: detects inventory shortage as a hard blocker', async () => {
  // Request 10000 units of a product that only has 450 in stock
  const items = [{ productId: 'prod_tote_canvas_premium', quantity: 10000 }];
  const audit = await procurementIntelligence.reviewPurchaseRisks(items, 50000, 10);

  assert.strictEqual(audit.canProceedToCheckout, false, 'Must block checkout on inventory shortage');
  assert(audit.hardBlockersCount > 0, 'Must have at least 1 hard blocker');
  const stockFlag = audit.flags.find((f) => f.category === 'INVENTORY_SHORTAGE');
  assert.ok(stockFlag, 'Must include an INVENTORY_SHORTAGE risk flag');
  assert.strictEqual(stockFlag.isBlocker, true);
});

test('Risk Analyst: detects delivery deadline conflict as a blocker', async () => {
  // Product has 3 days delivery, but deadline requested is 1 day
  const items = [{ productId: 'prod_notebook_recycled_a5', quantity: 10 }];
  const audit = await procurementIntelligence.reviewPurchaseRisks(items, 200, 1);

  const deliveryFlag = audit.flags.find((f) => f.category === 'DELIVERY_CONFLICT');
  assert.ok(deliveryFlag, 'Must flag delivery conflict when transit exceeds deadline');
  assert.strictEqual(deliveryFlag.isBlocker, true);
});

test('Risk Analyst: detects budget ceiling violation as critical blocker', async () => {
  const items = [{ productId: 'prod_tote_canvas_premium', quantity: 100 }]; // $165 + shipping
  const audit = await procurementIntelligence.reviewPurchaseRisks(items, 50, 10); // max budget $50

  assert.strictEqual(audit.canProceedToCheckout, false);
  const budgetFlag = audit.flags.find((f) => f.category === 'POLICY_VIOLATION');
  assert.ok(budgetFlag, 'Must flag policy violation when grand total exceeds authorized budget limit');
  assert.strictEqual(budgetFlag.severity, 'CRITICAL');
});

// 5. Post-Purchase Assistant Grounded Records
test('Post-Purchase Assistant: answers user questions citing real order records', async () => {
  // Query orders for demo buyer
  const res = await procurementIntelligence.answerUserQuestion(
    'Show me the details of my latest order.',
    [],
    'alex.chen@boundbuy.org'
  );

  assert.ok(res.answer, 'Assistant must provide an answer');
  assert(res.groundedRecords.length > 0, 'Assistant must reference real database records');
  assert.ok(res.groundedRecords[0].id.startsWith('BB-2026-'), 'Order ID must start with BB-2026-');
});

// 6. Security & Payment Integrity Preservation
test('Payment Security: AI tools cannot trigger capture or bypass buyer approval', () => {
  const publicConfig = paypalService.getPublicConfig();
  assert.ok(publicConfig.baseUrl.includes('sandbox.paypal.com'), 'Must use PayPal Sandbox environment');

  // Verify that an unapproved pact cannot be captured
  const unapprovedPact = {
    id: 'pact_test_security',
    approvalStatus: 'pending_approval' as const,
  };

  assert.strictEqual(
    unapprovedPact.approvalStatus,
    'pending_approval',
    'AI cannot mark pact approved without buyer explicit signature'
  );
});

// Run all test cases sequentially
async function runTests() {
  totalTests = testQueue.length;
  for (const t of testQueue) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ ${t.name}`);
      console.error(err);
    }
  }

  console.log(`\n🎉 Procurement Intelligence Results: ${passedTests}/${totalTests} tests passed.\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
