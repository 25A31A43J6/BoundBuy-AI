import assert from 'node:assert';
import { geminiAI } from '../server/src/services/gemini.js';
import { store } from '../server/src/services/store.js';

console.log('🧪 Running BoundBuy Example Brief Performance & Reliability Benchmark...');

async function runBenchmark() {
  const settings = store.getSettings();
  const allProducts = store.getProducts();

  const briefs = [
    {
      name: 'Brief 1 (College Event: Notebooks & Bags)',
      prompt: 'I need 30 notebooks and 30 reusable bags for a college event. Keep the total below $80 including shipping. Delivery must be before Friday. Do not substitute any products without asking me.',
      expectedBudget: 80,
      expectedItemsCount: 2,
    },
    {
      name: 'Brief 2 (Workspace Studio: LED Lamps)',
      prompt: 'Need 4 ergonomic LED desk lamps for our new workspace studio under $180 total with fast delivery.',
      expectedBudget: 180,
      expectedItemsCount: 1,
    },
    {
      name: 'Brief 3 (Department Meeting: Cups & Coffee)',
      prompt: 'Order 100 compostable cups and 2 bags of organic whole bean coffee for the department meeting under $75.',
      expectedBudget: 75,
      expectedItemsCount: 2,
    },
  ];

  console.log('\n--- 1. Testing Example Brief Intent Parsing & Caching ---');

  for (const [idx, b] of briefs.entries()) {
    // Run 1: Cold start / fresh analysis
    const t0 = Date.now();
    const result1 = await geminiAI.parsePurchaseIntent(b.prompt, [], settings);
    const coldDuration = Date.now() - t0;

    assert.ok(result1.budgetLimit <= b.expectedBudget, `Budget should be <= ${b.expectedBudget}, got ${result1.budgetLimit}`);
    assert.ok(result1.requiredItems.length >= b.expectedItemsCount, `Should have at least ${b.expectedItemsCount} required items, got ${result1.requiredItems.length}`);
    assert.ok(result1.purchaseGoal, 'Purchase goal must be populated');

    // Run 2: Cache Hit Verification
    const t1 = Date.now();
    const result2 = await geminiAI.parsePurchaseIntent(b.prompt, [], settings);
    const warmDuration = Date.now() - t1;

    console.log(`  ✓ ${b.name}:`);
    console.log(`     Cold parse: ${coldDuration}ms | Warm (Cache Hit): ${warmDuration}ms`);
    console.log(`     Goal: "${result2.purchaseGoal}" | Budget: $${result2.budgetLimit} | Items: ${result2.requiredItems.length}`);
    console.log(`     Strategy: ${result2.isFallbackGenerated ? 'Deterministic Policy' : 'Gemini AI Model'}`);

    assert.ok(warmDuration < 50, `Warm cache hit should be under 50ms, was ${warmDuration}ms`);
    assert.strictEqual(result1.purchaseGoal, result2.purchaseGoal, 'Cached result must match cold result');
  }

  console.log('\n--- 2. Testing Deterministic Policy Fallback Under Gemini 429 Quota Exhaustion ---');

  const deterministicBrief1 = geminiAI.parsePurchaseIntentDeterministic(
    briefs[0].prompt,
    settings,
    'Simulated 429 quota exhaustion'
  );

  assert.strictEqual(deterministicBrief1.isFallbackGenerated, true);
  assert.strictEqual(deterministicBrief1.budgetLimit, 80);
  assert.strictEqual(deterministicBrief1.allowSubstitutions, false);
  assert.strictEqual(deterministicBrief1.requiredItems.length, 2);
  assert.strictEqual(deterministicBrief1.requiredItems[0].quantity, 30);
  assert.strictEqual(deterministicBrief1.requiredItems[1].quantity, 30);
  console.log('  ✓ Deterministic Brief 1 correctly mapped notebooks (30) and reusable bags (30) under $80');

  const deterministicBrief2 = geminiAI.parsePurchaseIntentDeterministic(
    briefs[1].prompt,
    settings,
    'Simulated 429 quota exhaustion'
  );
  assert.strictEqual(deterministicBrief2.isFallbackGenerated, true);
  assert.strictEqual(deterministicBrief2.budgetLimit, 180);
  assert.strictEqual(deterministicBrief2.requiredItems.length, 1);
  assert.strictEqual(deterministicBrief2.requiredItems[0].quantity, 4);
  console.log('  ✓ Deterministic Brief 2 correctly mapped LED lamps (4) under $180');

  const deterministicBrief3 = geminiAI.parsePurchaseIntentDeterministic(
    briefs[2].prompt,
    settings,
    'Simulated 429 quota exhaustion'
  );
  assert.strictEqual(deterministicBrief3.isFallbackGenerated, true);
  assert.strictEqual(deterministicBrief3.budgetLimit, 75);
  assert.strictEqual(deterministicBrief3.requiredItems.length, 2);
  assert.strictEqual(deterministicBrief3.requiredItems[0].quantity, 100);
  assert.strictEqual(deterministicBrief3.requiredItems[1].quantity, 2);
  console.log('  ✓ Deterministic Brief 3 correctly mapped compostable cups (100) and coffee (2) under $75');

  console.log('\n--- 3. Testing Token-Optimized Product Recommendation Explanation ---');

  const mockIntent = {
    id: 'test_intent_perf',
    rawPrompt: briefs[0].prompt,
    purchaseGoal: 'College event notebooks and bags',
    budgetLimit: 80,
    currency: 'USD',
    categories: ['office_stationery', 'shipping_packaging'],
    requiredItems: [
      { categoryOrName: 'notebook', quantity: 30, mandatoryAttributes: ['recycled'] },
      { categoryOrName: 'bag', quantity: 30, mandatoryAttributes: ['reusable'] },
    ],
    optionalPreferences: [],
    shippingDeadlineDays: 4,
    shippingDeadlineDate: null,
    allowSubstitutions: false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    isFallbackGenerated: false,
    createdAt: new Date().toISOString(),
  };

  const candidateNotebook = allProducts.find((p) => p.id === 'prod_notebook_recycled_a5') || allProducts[0];
  const candidateBag = allProducts.find((p) => p.id === 'prod_tote_canvas_premium') || allProducts[1];

  const candidateProducts = [
    { product: candidateNotebook, quantity: 30 },
    { product: candidateBag, quantity: 30 },
  ];

  // Token-optimized filtered catalog: pass only candidates + top 4 alternatives
  const filteredProducts = [candidateNotebook, candidateBag, ...allProducts.slice(0, 4)];

  const tRec0 = Date.now();
  const explanation1 = await geminiAI.explainProductRecommendations(
    mockIntent,
    filteredProducts,
    candidateProducts
  );
  const recColdDuration = Date.now() - tRec0;

  assert.ok(explanation1, 'Explanation should not be null');
  assert.ok(explanation1.executiveSummary, 'Executive summary must be present');
  assert.ok(explanation1.productExplanations.length > 0, 'Must have product explanations');

  // Verify caching of explanation
  const tRec1 = Date.now();
  const explanation2 = await geminiAI.explainProductRecommendations(
    mockIntent,
    filteredProducts,
    candidateProducts
  );
  const recWarmDuration = Date.now() - tRec1;

  console.log(`  ✓ Cold recommendation duration: ${recColdDuration}ms`);
  console.log(`  ✓ Warm recommendation duration (Cache Hit): ${recWarmDuration}ms`);
  assert.ok(recWarmDuration < 20, `Warm recommendation should be under 20ms, was ${recWarmDuration}ms`);

  console.log('\n🎉 ALL PERFORMANCE & RELIABILITY BENCHMARK TESTS PASSED!\n');
}

runBenchmark().catch((err) => {
  console.error('❌ Benchmark failed:', err);
  process.exit(1);
});
