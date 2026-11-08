import 'dotenv/config';
import assert from 'assert';
import { store } from '../server/src/services/store.ts';
import { PolicyEngine } from '../server/src/services/policyEngine.ts';
import { procurementIntelligence } from '../server/src/services/procurementIntelligence.ts';
import type { AppSettings, StructuredPurchaseIntent } from '../server/src/types/index.ts';

console.log('🧪 Starting BoundBuy AI Regression Tests for Bug 1 and Bug 2...\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ↳ Error: ${err.message}`);
    throw err;
  }
}

const mockSettings: AppSettings = {
  defaultCurrency: 'USD',
  defaultSpendingLimit: 250,
  strictApprovalMode: true,
  preferredCategories: ['office_stationery', 'event_supplies'],
  preferredSuppliers: ['sup_verdantcraft', 'sup_ecothread'],
  enableEmailAlerts: false,
};

async function executeSuite() {
  // ==========================================
  // REGRESSION SUITE 1: Purchase Planner (Bug 1)
  // ==========================================
  console.log('--- Suite 1: Purchase Planner Resilience & Fallback Tests ---');

  const origEnsureClient = (procurementIntelligence as any).ensureClient;
  const transientMock = () => ({
    models: {
      generateContent: async () => {
        const err = new Error('Resource has been exhausted (e.g. check quota).');
        (err as any).status = 429;
        throw err;
      },
    },
  });
  if (!process.env.GEMINI_API_KEY) {
    (procurementIntelligence as any).ensureClient = transientMock;
  }

  // Test 1: Example prompt extracts budget, quantities and categories accurately
  await runTest('Fallback extracts budget 150 and quantities of 25 from example prompt', async () => {
    // Force fallback by testing a simulated transient outage
    const prompt = 'Need 25 notebooks and 25 tote bags under $150.';
    // Call planPurchase: if upstream quota is exhausted or transient error occurs, fallback executes
    const plan = await procurementIntelligence.planPurchase(prompt, [], mockSettings);

    assert.ok(plan, 'Plan must be returned');
    assert.strictEqual(plan.budgetLimit, 150, 'Budget must be extracted as 150');
    assert.strictEqual(plan.currency, 'USD', 'Currency must be USD');

    // Verify notebooks and bags are extracted with qty 25
    const notebookItem = plan.requiredItems.find((i) => i.categoryOrName.toLowerCase().includes('notebook'));
    const toteItem = plan.requiredItems.find((i) => i.categoryOrName.toLowerCase().includes('tote') || i.categoryOrName.toLowerCase().includes('bag'));

    assert.ok(notebookItem, 'Notebooks must be extracted');
    assert.strictEqual(notebookItem.quantity, 25, 'Notebooks quantity must be 25');
    assert.ok(toteItem, 'Tote bags must be extracted');
    assert.strictEqual(toteItem.quantity, 25, 'Tote bags quantity must be 25');
  });

  // Test 2: Gemini 429 quota exhaustion simulation triggers fallback
  await runTest('Gemini 429 quota exhaustion triggers deterministic fallback with isFallbackGenerated=true', async () => {
    const origEnsureClient = (procurementIntelligence as any).ensureClient;
    try {
      // Mock client that throws 429 RESOURCE_EXHAUSTED
      (procurementIntelligence as any).ensureClient = () => ({
        models: {
          generateContent: async () => {
            const err = new Error('Resource has been exhausted (e.g. check quota).');
            (err as any).status = 429;
            throw err;
          },
        },
      });

      const plan = await procurementIntelligence.planPurchase('Need 10 pens under $50', [], mockSettings);
      assert.strictEqual(plan.isFallbackGenerated, true, 'isFallbackGenerated must be true');
      assert.strictEqual(plan.budgetLimit, 50);
      assert.ok(plan.planRationale.includes('[Deterministic Fallback Engine]'));
    } finally {
      (procurementIntelligence as any).ensureClient = origEnsureClient;
    }
  });

  // Test 3: Gemini 503 high demand triggers fallback
  await runTest('Gemini 503 high demand triggers deterministic fallback', async () => {
    const origEnsureClient = (procurementIntelligence as any).ensureClient;
    try {
      (procurementIntelligence as any).ensureClient = () => ({
        models: {
          generateContent: async () => {
            const err = new Error('The model is currently overloaded. Please try again later.');
            (err as any).status = 503;
            throw err;
          },
        },
      });

      const plan = await procurementIntelligence.planPurchase('Need 30 notebooks before Friday', [], mockSettings);
      assert.strictEqual(plan.isFallbackGenerated, true);
      assert.ok(plan.requiredItems.length > 0);
      assert.ok(plan.shippingDeadlineDays !== null && plan.shippingDeadlineDays > 0);
    } finally {
      (procurementIntelligence as any).ensureClient = origEnsureClient;
    }
  });

  // Test 4: Transient network timeout / fetch failed triggers fallback
  await runTest('Transient network error triggers deterministic fallback', async () => {
    const origEnsureClient = (procurementIntelligence as any).ensureClient;
    try {
      (procurementIntelligence as any).ensureClient = () => ({
        models: {
          generateContent: async () => {
            const err = new Error('TypeError: fetch failed - ECONNRESET');
            throw err;
          },
        },
      });

      const plan = await procurementIntelligence.planPurchase('Need 5 desk lamps under $120', [], mockSettings);
      assert.strictEqual(plan.isFallbackGenerated, true);
      assert.strictEqual(plan.budgetLimit, 120);
    } finally {
      (procurementIntelligence as any).ensureClient = origEnsureClient;
    }
  });

  // Test 5: Invalid API Key / Auth failure is NOT disguised as fallback
  await runTest('Invalid API Key throws an authentication error instead of masking as success', async () => {
    const origEnsureClient = (procurementIntelligence as any).ensureClient;
    try {
      (procurementIntelligence as any).ensureClient = () => ({
        models: {
          generateContent: async () => {
            const err = new Error('API_KEY_INVALID: API key not valid. Please pass a valid API key.');
            (err as any).status = 400;
            throw err;
          },
        },
      });

      await assert.rejects(
        async () => {
          await procurementIntelligence.planPurchase('Need notebooks', [], mockSettings);
        },
        (err: Error) => {
          return err.message.includes('Gemini API Authentication Error');
        },
        'Must throw authentication error'
      );
    } finally {
      (procurementIntelligence as any).ensureClient = !process.env.GEMINI_API_KEY ? transientMock : origEnsureClient;
    }
  });

  // Test 6: Fallback does not invent fictitious products or arbitrary prices
  await runTest('Fallback extracts requirements without inventing fake catalog products or prices', async () => {
    const plan = await procurementIntelligence.planPurchase('Need 40 notebooks', [], mockSettings);
    // Requirements must be category-level descriptions, not fake SKU IDs
    for (const item of plan.requiredItems) {
      assert.ok(typeof item.categoryOrName === 'string');
      assert.ok(item.quantity > 0);
      // Ensure it does not have invented product IDs
      assert.strictEqual((item as any).productId, undefined);
      assert.strictEqual((item as any).unitPrice, undefined);
    }
  });

  // Test 7: Resulting intent can proceed into the Purchase Pact workflow
  await runTest('Intent generated by fallback proceeds cleanly into Purchase Pact workflow', async () => {
    const plan = await procurementIntelligence.planPurchase('Need 10 notebooks under $100', [], mockSettings);
    const intent: StructuredPurchaseIntent = {
      id: `intent_test_${Date.now()}`,
      rawPrompt: 'Need 10 notebooks under $100',
      purchaseGoal: plan.purchaseGoal,
      budgetLimit: plan.budgetLimit,
      currency: plan.currency,
      categories: plan.categories,
      requiredItems: plan.requiredItems,
      optionalPreferences: plan.optionalPreferences,
      shippingDeadlineDays: plan.shippingDeadlineDays,
      allowSubstitutions: plan.allowSubstitutions,
      missingInformation: plan.missingInformation,
      clarificationQuestions: plan.clarificationQuestions,
      isClarificationNeeded: plan.isClarificationNeeded,
      isFallbackGenerated: plan.isFallbackGenerated,
      createdAt: new Date().toISOString(),
    };

    store.saveIntent(intent);

    // Get real catalog product
    const product = store.getProducts().find((p) => p.category === 'office_stationery');
    assert.ok(product, 'Stationery product must exist in catalog');

    // Create Pact using the intent
    const { pactItems, subtotal, shippingCost, estimatedTax, grandTotal } = PolicyEngine.calculateTotals([
      { productId: product.id, quantity: 10 },
    ]);

    const { evaluations, isCompliant } = PolicyEngine.evaluatePolicyRules(
      pactItems,
      grandTotal,
      intent.budgetLimit,
      intent.shippingDeadlineDays,
      intent.allowSubstitutions,
      intent
    );

    assert.strictEqual(typeof isCompliant, 'boolean');
    assert.ok(evaluations.length >= 3);
  });

  // Test 8: Fallback-generated intent never authorizes payment automatically
  await runTest('Fallback-generated intent never approves a pact or authorizes payment automatically', async () => {
    const plan = await procurementIntelligence.planPurchase('Need 25 bags under $150', [], mockSettings);
    // Neither the plan nor intent may contain approval flags or capture tokens
    assert.strictEqual((plan as any).isApproved, undefined);
    assert.strictEqual((plan as any).paymentAuthorized, undefined);
    assert.strictEqual((plan as any).paypalCaptureId, undefined);
  });

  // ==========================================
  // REGRESSION SUITE 2: Express Error Handler (Bug 2)
  // ==========================================
  console.log('\n--- Suite 2: Express Error Handler Tests ---');

  const BASE_URL = 'http://127.0.0.1:3000';

  // Test 9: Malformed prompt {"prompt":"x"} returns HTTP 400 with readable details
  await runTest('Malformed prompt {"prompt":"x"} returns HTTP 400 with field details', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'x' }),
    });

    assert.strictEqual(res.status, 400, 'Must return HTTP 400 Bad Request');
    const json = await res.json();
    assert.strictEqual(json.error, 'Validation Error');
    assert.ok(Array.isArray(json.details), 'Must include field-level details');
    assert.ok(json.message.includes('prompt'), 'Message must reference the failing field');
    // Ensure no stack trace leakage
    assert.strictEqual(json.stack, undefined);
  });

  // Test 10: Missing body parameters on pacts creation returns HTTP 400
  await runTest('Zod schema validation on POST /api/pacts/create returns HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/pacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // empty body
    });

    assert.strictEqual(res.status, 400, 'Must return HTTP 400 Bad Request');
    const json = await res.json();
    assert.strictEqual(json.error, 'Validation Error');
    assert.ok(json.details.some((d: any) => d.field.includes('items') || d.field.includes('maxBudget')));
  });

  // Test 11: Missing order returns HTTP 404
  await runTest('Missing order ID returns HTTP 404', async () => {
    const res = await fetch(`${BASE_URL}/api/orders/non_existent_order_id_12345`);
    assert.strictEqual(res.status, 404, 'Must return HTTP 404 Not Found');
    const json = await res.json();
    assert.ok(json.error || json.message);
  });

  // Test 12: Premature PayPal capture preserves HTTP 422 ORDER_NOT_APPROVED
  await runTest('Premature PayPal capture preserves HTTP 422 ORDER_NOT_APPROVED', async () => {
    // 1. Create a dummy order
    const product = store.getProducts()[0];
    const pactCreateRes = await fetch(`${BASE_URL}/api/pacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: product.id, quantity: 1 }],
        maxBudget: 100,
        buyerEmail: 'regtest@boundbuy.org',
      }),
    });
    const pactCreateJson = await pactCreateRes.json();
    const pactId = pactCreateJson.pact.id;

    // Approve pact
    await fetch(`${BASE_URL}/api/pacts/${pactId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy: 'regtest@boundbuy.org' }),
    });

    // Create PayPal order
    const orderCreateRes = await fetch(`${BASE_URL}/api/paypal/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pactId }),
    });
    const orderCreateJson = await orderCreateRes.json();
    const ppOrderId = orderCreateJson.paypalOrderId;

    // Attempt capture BEFORE buyer approval
    const captureRes = await fetch(`${BASE_URL}/api/paypal/orders/${ppOrderId}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pactId }),
    });

    assert.strictEqual(captureRes.status, 422, 'Must return HTTP 422 Unprocessable Entity');
    const captureJson = await captureRes.json();
    assert.strictEqual(captureJson.error, 'ORDER_NOT_APPROVED');
  });

  // Test 13: Malformed JSON syntax returns HTTP 400
  await runTest('Malformed raw JSON in request returns HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"prompt": incomplete json',
    });

    assert.strictEqual(res.status, 400, 'Must return HTTP 400 for malformed JSON');
    const json = await res.json();
    assert.strictEqual(json.error, 'Malformed JSON');
  });

  console.log(`\n🎉 Regression Tests Complete: ${passedTests}/${totalTests} passed.`);
}

executeSuite().catch((err) => {
  console.error('Regression suite failed:', err);
  process.exit(1);
});
