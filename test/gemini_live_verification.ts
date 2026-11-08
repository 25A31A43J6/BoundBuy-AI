import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { procurementIntelligence } from '../server/src/services/procurementIntelligence.ts';
import { store } from '../server/src/services/store.ts';

console.log('🧪 Starting Gemini AI Integration Live Verification...\n');

async function verifyGeminiIntegration() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  console.log(`Configured Model Identifier: ${modelName}`);
  console.log(`GEMINI_API_KEY present: ${Boolean(apiKey && apiKey.trim().length > 0)}`);

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      const prompt = 'You are BoundBuy Procurement AI. Respond in JSON: {"status": "ok", "capability": "procurement_planning"}';
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      console.log('   ✓ Real Gemini API call succeeded!');
      console.log(`   ✓ Model ID: ${modelName}`);
      console.log(`   ✓ Response: ${response.text?.trim()}`);
      console.log('   ✓ Source: REAL GEMINI API');
      return {
        status: 'PASS',
        source: 'REAL_GEMINI_API',
        modelId: modelName,
        details: response.text?.trim(),
      };
    } catch (err: any) {
      console.log(`   ⚠️ Real Gemini API returned error: ${err.message}`);
      console.log('   ↳ Activating and verifying BoundBuy Deterministic Fallback Engine...');
    }
  } else {
    console.log('   ℹ️ GEMINI_API_KEY is not injected into the process environment.');
    console.log('   ↳ Verifying BoundBuy Deterministic Procurement Fallback Engine...');
  }

  // Verify Deterministic Fallback Engine
  const settings = store.getSettings();
  const testPrompt = 'Need 40 notebooks and 40 tote bags under $200 before next Friday';
  const start = performance.now();
  const plan = await procurementIntelligence.planPurchase(testPrompt, [], settings);
  const elapsed = (performance.now() - start).toFixed(2);

  console.log(`   ✓ Deterministic Fallback parsed intent in ${elapsed}ms:`);
  console.log(`     - Goal: "${plan.purchaseGoal}"`);
  console.log(`     - Budget Limit: $${plan.budgetLimit} ${plan.currency}`);
  console.log(`     - Extracted Items: ${plan.requiredItems.map((i) => `${i.quantity}x ${i.categoryOrName}`).join(', ')}`);
  console.log(`     - Deadline Days: ${plan.shippingDeadlineDays}`);
  console.log(`     - Fallback Flag: isFallbackGenerated = ${plan.isFallbackGenerated}`);
  console.log(`     - Fallback Reason: "${plan.fallbackReason}"`);

  return {
    status: apiKey ? 'FAIL_FALLBACK_ACTIVE' : 'BLOCKED_FALLBACK_VERIFIED',
    source: 'DETERMINISTIC_FALLBACK',
    modelId: modelName,
    elapsedMs: elapsed,
    plan,
  };
}

verifyGeminiIntegration()
  .then((res) => {
    console.log('\n📊 Gemini Verification Summary:', JSON.stringify(res, null, 2));
  })
  .catch((err) => {
    console.error('Fatal error during Gemini verification:', err);
    process.exit(1);
  });
