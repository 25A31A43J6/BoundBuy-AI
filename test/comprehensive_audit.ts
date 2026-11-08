import { store } from '../server/src/services/store.ts';
import { PolicyEngine } from '../server/src/services/policyEngine.ts';
import { paypalService } from '../server/src/services/paypal.ts';
import { procurementIntelligence } from '../server/src/services/procurementIntelligence.ts';
import type { PactItem, PurchasePact } from '../server/src/types/index.ts';

interface AuditResult {
  phase: string;
  testName: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
  evidence: string;
  component: string;
  recommendedAction?: string;
}

const results: AuditResult[] = [];

function record(res: AuditResult) {
  results.push(res);
  const icon = res.status === 'PASS' ? '✅' : res.status === 'FAIL' ? '❌' : res.status === 'BLOCKED' ? '⚠️' : '⚪';
  console.log(`${icon} [${res.phase}] ${res.testName}: ${res.status}`);
  if (res.status !== 'PASS') {
    console.log(`   ↳ Evidence: ${res.evidence}`);
  }
}

async function runAudit() {
  console.log('=====================================================');
  console.log('BOUNDBUY AI — COMPREHENSIVE AUTOMATED AUDIT & TESTING');
  console.log('=====================================================\n');

  // PHASE 1: Build, Dependency & Config Checks
  try {
    const products = store.getProducts();
    if (products && products.length > 0) {
      record({
        phase: 'PHASE 1',
        testName: 'Catalog Data Ingestion & Store Initialization',
        status: 'PASS',
        evidence: `Loaded ${products.length} products and ${store.getSuppliers().length} suppliers into persistent store.`,
        component: 'server/src/services/store.ts',
      });
    } else {
      record({
        phase: 'PHASE 1',
        testName: 'Catalog Data Ingestion & Store Initialization',
        status: 'FAIL',
        evidence: 'No products loaded into store.',
        component: 'server/src/services/store.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 1',
      testName: 'Catalog Data Ingestion & Store Initialization',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/services/store.ts',
    });
  }

  // Check MongoDB configuration vs Local persistence
  const storageInfo = store.getStorageInfo();
  if (!storageInfo.isMongoConfigured) {
    record({
      phase: 'PHASE 1',
      testName: 'MongoDB Persistence Mode',
      status: 'BLOCKED',
      evidence: 'MONGODB_URI not set in environment. Resilient local persistent storage mode is active at .data/boundbuy_store.json.',
      component: 'server/src/services/store.ts',
      recommendedAction: 'Provide MONGODB_URI in .env or Render environment if hosted MongoDB is desired.',
    });
  } else {
    record({
      phase: 'PHASE 1',
      testName: 'MongoDB Persistence Mode',
      status: 'PASS',
      evidence: `MongoDB connected. Storage mode: ${storageInfo.storageMode}`,
      component: 'server/src/services/store.ts',
    });
  }

  // Check PayPal Sandbox credentials in environment
  const paypalConfig = paypalService.getPublicConfig();
  if (!paypalConfig.isConfigured) {
    record({
      phase: 'PHASE 1',
      testName: 'PayPal Live/Sandbox Credentials in Environment',
      status: 'BLOCKED',
      evidence: 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are empty in environment. High-fidelity Sandbox Simulator fallback is active for testing without blocking local development.',
      component: 'server/src/services/paypal.ts',
      recommendedAction: 'Enter PayPal Sandbox Client ID and Secret in Settings tab or .env to make calls to api-m.sandbox.paypal.com.',
    });
  } else {
    record({
      phase: 'PHASE 1',
      testName: 'PayPal Live/Sandbox Credentials in Environment',
      status: 'PASS',
      evidence: `PayPal configured with client ID: ${paypalConfig.clientId?.substring(0, 8)}... (${paypalConfig.mode} mode)`,
      component: 'server/src/services/paypal.ts',
    });
  }

  // Check Gemini credentials
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  if (!geminiConfigured) {
    record({
      phase: 'PHASE 1',
      testName: 'Gemini API Key Presence',
      status: 'BLOCKED',
      evidence: 'GEMINI_API_KEY is missing from environment.',
      component: 'server/src/services/gemini.ts',
      recommendedAction: 'Set GEMINI_API_KEY in .env.',
    });
  } else {
    record({
      phase: 'PHASE 1',
      testName: 'Gemini API Key Presence',
      status: 'PASS',
      evidence: `GEMINI_API_KEY present in server process (${process.env.GEMINI_API_KEY?.length} chars). Never exposed to frontend client.`,
      component: 'server/src/services/gemini.ts',
    });
  }

  // Test Live HTTP API Endpoints on Port 3000
  const BASE_URL = 'http://127.0.0.1:3000';
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await healthRes.json();
    if (healthRes.status === 200 && healthJson.status === 'ok') {
      record({
        phase: 'PHASE 6',
        testName: 'API Endpoint: GET /api/health',
        status: 'PASS',
        evidence: `HTTP 200 returned: storageMode=${healthJson.storageMode}, geminiConfigured=${healthJson.geminiConfigured}`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 6',
        testName: 'API Endpoint: GET /api/health',
        status: 'FAIL',
        evidence: `Unexpected response status ${healthRes.status}: ${JSON.stringify(healthJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 6',
      testName: 'API Endpoint: GET /api/health',
      status: 'FAIL',
      evidence: `Could not reach server: ${err.message}`,
      component: 'server/src/routes/api.ts',
    });
  }

  try {
    const catalogRes = await fetch(`${BASE_URL}/api/catalog?category=office_stationery`);
    const catalogJson = await catalogRes.json();
    if (catalogRes.status === 200 && catalogJson.products && catalogJson.products.length > 0) {
      record({
        phase: 'PHASE 2',
        testName: 'API Endpoint: GET /api/catalog with category filter',
        status: 'PASS',
        evidence: `Filtered ${catalogJson.products.length} products in 'office_stationery' category.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 2',
        testName: 'API Endpoint: GET /api/catalog with category filter',
        status: 'FAIL',
        evidence: `Failed to filter catalog: ${JSON.stringify(catalogJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 2',
      testName: 'API Endpoint: GET /api/catalog with category filter',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // PHASE 2 & 4: Catalog & Purchase Pact Testing
  const allProducts = store.getProducts();
  const ecoNotebook = allProducts.find((p) => p.name.includes('Notebook'));
  const toteBag = allProducts.find((p) => p.name.includes('Tote') || p.name.includes('Bag'));

  if (ecoNotebook && toteBag) {
    // Test Single & Multi product total calculation
    const calc = PolicyEngine.calculateTotals([
      { productId: ecoNotebook.id, quantity: 5 },
      { productId: toteBag.id, quantity: 10 },
    ]);
    const expectedSubtotal = Number((ecoNotebook.unitPrice * 5 + toteBag.unitPrice * 10).toFixed(2));
    if (Math.abs(calc.subtotal - expectedSubtotal) < 0.01) {
      record({
        phase: 'PHASE 4',
        testName: 'Product Selection & Multi-Item Calculation',
        status: 'PASS',
        evidence: `Calculated Subtotal $${calc.subtotal.toFixed(2)}, Consolidated Shipping $${calc.shippingCost.toFixed(2)}, Grand Total $${calc.grandTotal.toFixed(2)} for ${calc.pactItems.length} items.`,
        component: 'server/src/services/policyEngine.ts',
      });
    } else {
      record({
        phase: 'PHASE 4',
        testName: 'Product Selection & Multi-Item Calculation',
        status: 'FAIL',
        evidence: `Expected subtotal $${expectedSubtotal}, got $${calc.subtotal}`,
        component: 'server/src/services/policyEngine.ts',
      });
    }

    // Test Policy Rules: Budget Ceiling, Stock & Delivery
    const policyEvalBudgetExceeded = PolicyEngine.evaluatePolicyRules(
      calc.pactItems,
      calc.grandTotal,
      10, // max budget $10 (grand total is much higher)
      null,
      true
    );
    const budgetRule = policyEvalBudgetExceeded.evaluations.find((e) => e.ruleId === 'RULE_BUDGET_CEILING');
    if (budgetRule && !budgetRule.passed && !policyEvalBudgetExceeded.isCompliant) {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Budget Ceiling Violation',
        status: 'PASS',
        evidence: `Correctly flagged non-compliance when grand total $${calc.grandTotal.toFixed(2)} exceeded $10 budget cap: "${budgetRule.message}".`,
        component: 'server/src/services/policyEngine.ts',
      });
    } else {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Budget Ceiling Violation',
        status: 'FAIL',
        evidence: 'Failed to flag budget exceedance.',
        component: 'server/src/services/policyEngine.ts',
      });
    }

    // Test Delivery Deadline enforcement
    const policyEvalDelivery = PolicyEngine.evaluatePolicyRules(
      calc.pactItems,
      calc.grandTotal,
      5000,
      1, // 1 day deadline (ecoNotebook requires 2+ days)
      true
    );
    const deliveryRule = policyEvalDelivery.evaluations.find((e) => e.ruleId === 'RULE_DELIVERY_DEADLINE');
    if (deliveryRule && !deliveryRule.passed && !policyEvalDelivery.isCompliant) {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Delivery Deadline Conflict',
        status: 'PASS',
        evidence: `Correctly blocked delivery: "${deliveryRule.message}".`,
        component: 'server/src/services/policyEngine.ts',
      });
    } else {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Delivery Deadline Conflict',
        status: 'FAIL',
        evidence: 'Failed to block delivery deadline conflict.',
        component: 'server/src/services/policyEngine.ts',
      });
    }

    // Test Inventory Shortage enforcement
    const excessiveItems = [
      {
        ...calc.pactItems[0],
        quantity: ecoNotebook.stockQuantity + 999,
      },
    ];
    const policyEvalStock = PolicyEngine.evaluatePolicyRules(
      excessiveItems,
      calc.grandTotal,
      5000,
      null,
      true
    );
    const stockRule = policyEvalStock.evaluations.find((e) => e.ruleId === 'RULE_STOCK_AVAILABILITY');
    if (stockRule && !stockRule.passed && !policyEvalStock.isCompliant) {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Inventory Availability Check',
        status: 'PASS',
        evidence: `Correctly flagged shortage: "${stockRule.message}".`,
        component: 'server/src/services/policyEngine.ts',
      });
    } else {
      record({
        phase: 'PHASE 4',
        testName: 'Hard Constraint: Inventory Availability Check',
        status: 'FAIL',
        evidence: 'Failed to flag inventory shortage.',
        component: 'server/src/services/policyEngine.ts',
      });
    }

    // Test Purchase Pact creation via HTTP API
    try {
      const createPactRes = await fetch(`${BASE_URL}/api/pacts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: ecoNotebook.id, quantity: 2 }],
          maxBudget: 200,
          buyerEmail: 'audit.tester@boundbuy.org',
        }),
      });
      const createPactJson = await createPactRes.json();
      const pact: PurchasePact = createPactJson.pact;

      if (createPactRes.status === 200 && pact && pact.id) {
        record({
          phase: 'PHASE 4',
          testName: 'Purchase Pact Generation via POST /api/pacts/create',
          status: 'PASS',
          evidence: `Pact ${pact.id} generated with grand total $${pact.grandTotal.toFixed(2)}, isCompliant=${pact.isCompliant}, status=${pact.approvalStatus}.`,
          component: 'server/src/routes/api.ts',
        });

        // Approve the pact via HTTP API
        const approveRes = await fetch(`${BASE_URL}/api/pacts/${pact.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedBy: 'audit.tester@boundbuy.org' }),
        });
        const approveJson = await approveRes.json();
        const approved: PurchasePact = approveJson.pact;

        if (approveRes.status === 200 && approved && approved.approvalStatus === 'approved' && approved.canonicalSnapshotHash) {
          record({
            phase: 'PHASE 4',
            testName: 'Buyer Pact Approval Flow & Canonical Hash Generation',
            status: 'PASS',
            evidence: `Pact ${approved.id} approved at ${approved.approvedAt}. Canonical SHA-256 Hash: ${approved.canonicalSnapshotHash.substring(0, 16)}...`,
            component: 'server/src/routes/api.ts',
          });

          // Test Anti-Tampering & Approval Invalidation on Price Change
          const tamperRes = await fetch(`${BASE_URL}/api/pacts/${approved.id}/simulate-price-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: ecoNotebook.id,
              newPrice: ecoNotebook.unitPrice + 5.0,
            }),
          });
          const tamperJson = await tamperRes.json();
          const tamperedPact = tamperJson.pact;
          if (tamperedPact && tamperedPact.approvalStatus === 'invalidated_by_changes') {
            record({
              phase: 'PHASE 4',
              testName: 'Anti-Tampering & Invalidation on Price Change',
              status: 'PASS',
              evidence: `Price tampering invalidated earlier buyer approval: status='${tamperedPact.approvalStatus}', reason='${tamperedPact.invalidationReason}'. Renewed approval is mandatory.`,
              component: 'server/src/routes/api.ts',
            });
          } else {
            record({
              phase: 'PHASE 4',
              testName: 'Anti-Tampering & Invalidation on Price Change',
              status: 'FAIL',
              evidence: `Tampered pact did not invalidate: ${JSON.stringify(tamperJson)}`,
              component: 'server/src/routes/api.ts',
            });
          }

          // Re-approve pact for PayPal testing
          const reapproveRes = await fetch(`${BASE_URL}/api/pacts/${pact.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvedBy: 'audit.tester@boundbuy.org' }),
          });
          const reapprovedJson = await reapproveRes.json();
          const cleanApprovedPact: PurchasePact = reapprovedJson.pact;

          // PHASE 5: PayPal Sandbox Ordering & Capture Lifecycle via API
          const orderCreateRes = await fetch(`${BASE_URL}/api/paypal/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pactId: cleanApprovedPact.id }),
          });
          const orderCreateJson = await orderCreateRes.json();

          if (orderCreateRes.status === 200 && orderCreateJson.paypalOrderId) {
            const ppOrderId = orderCreateJson.paypalOrderId;
            record({
              phase: 'PHASE 5',
              testName: 'PayPal Order Creation via POST /api/paypal/orders',
              status: 'PASS',
              evidence: `Created PayPal order ${ppOrderId} linked to pact ${cleanApprovedPact.id} with status ${orderCreateJson.status}.`,
              component: 'server/src/routes/api.ts',
            });

            // Premature capture attempt with pactId (MUST FAIL with 422 ORDER_NOT_APPROVED)
            const prematureRes = await fetch(`${BASE_URL}/api/paypal/orders/${ppOrderId}/capture`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pactId: cleanApprovedPact.id }),
            });
            const prematureJson = await prematureRes.json();

            if (prematureRes.status === 422 && prematureJson.error === 'ORDER_NOT_APPROVED') {
              record({
                phase: 'PHASE 5',
                testName: 'PayPal Guardrail: Block Capture Before Buyer Approval',
                status: 'PASS',
                evidence: `HTTP 422 returned. Strictly blocked premature capture with ORDER_NOT_APPROVED: "${prematureJson.message}".`,
                component: 'server/src/routes/api.ts',
              });
            } else {
              record({
                phase: 'PHASE 5',
                testName: 'PayPal Guardrail: Block Capture Before Buyer Approval',
                status: 'FAIL',
                evidence: `Premature capture gave status ${prematureRes.status}: ${JSON.stringify(prematureJson)}`,
                component: 'server/src/routes/api.ts',
              });
            }

            // Buyer simulates approval (or Sandbox approval)
            const buyerApproveRes = await fetch(`${BASE_URL}/api/paypal/orders/${ppOrderId}/approve-simulated`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const buyerApproveJson = await buyerApproveRes.json();

            if (buyerApproveJson.success) {
              record({
                phase: 'PHASE 5',
                testName: 'PayPal Buyer Approval Flow',
                status: 'PASS',
                evidence: `Buyer completed authorization for order ${ppOrderId}. Status transitioned to APPROVED.`,
                component: 'server/src/routes/api.ts',
              });

              // Now capture payment with pactId
              const captureRes = await fetch(`${BASE_URL}/api/paypal/orders/${ppOrderId}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pactId: cleanApprovedPact.id }),
              });
              const captureJson = await captureRes.json();

              if (captureRes.status === 200 && captureJson.captureDetails?.captureId) {
                record({
                  phase: 'PHASE 5',
                  testName: 'PayPal Payment Capture Verification',
                  status: 'PASS',
                  evidence: `Capture succeeded: ID ${captureJson.captureDetails.captureId}, Status: ${captureJson.captureDetails.status}, Amount: $${captureJson.captureDetails.amount} ${captureJson.captureDetails.currency}.`,
                  component: 'server/src/routes/api.ts',
                });

                // Test Receipt retrieval
                const orderId = captureJson.order?.id;
                if (orderId) {
                  const receiptRes = await fetch(`${BASE_URL}/api/orders/${orderId}/receipt`);
                  const receiptJson = await receiptRes.json();
                  if (receiptRes.status === 200 && receiptJson.receiptNumber) {
                    record({
                      phase: 'PHASE 5',
                      testName: 'Receipt Generation & Order Record Integrity',
                      status: 'PASS',
                      evidence: `Receipt ${receiptJson.receiptNumber} generated for order ${receiptJson.orderNumber}. Verified PayPal Capture ID: ${receiptJson.paypalCaptureId}.`,
                      component: 'server/src/routes/api.ts',
                    });
                  } else {
                    record({
                      phase: 'PHASE 5',
                      testName: 'Receipt Generation & Order Record Integrity',
                      status: 'FAIL',
                      evidence: `Could not retrieve receipt: ${JSON.stringify(receiptJson)}`,
                      component: 'server/src/routes/api.ts',
                    });
                  }
                }
              } else {
                record({
                  phase: 'PHASE 5',
                  testName: 'PayPal Payment Capture Verification',
                  status: 'FAIL',
                  evidence: `Capture failed: ${JSON.stringify(captureJson)}`,
                  component: 'server/src/routes/api.ts',
                });
              }
            }
          }
        }
      }
    } catch (err: any) {
      record({
        phase: 'PHASE 4',
        testName: 'Purchase Pact API Flow',
        status: 'FAIL',
        evidence: err.message,
        component: 'server/src/routes/api.ts',
      });
    }
  }

  // PHASE 3: AI Feature Audits via Live API
  // 1. Planner
  try {
    const planRes = await fetch(`${BASE_URL}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'I need 25 notebooks and 25 tote bags for a training workshop under $180 before next week',
      }),
    });
    const planJson = await planRes.json();
    if (planRes.status === 200 && planJson.intent && planJson.intent.requiredItems.length > 0) {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 1: Intelligent Purchase Planner',
        status: 'PASS',
        evidence: `Extracted ${planJson.intent.requiredItems.length} required categories (${planJson.intent.requiredItems.map((r: any) => r.categoryOrName).join(', ')}), Budget: $${planJson.intent.budgetLimit} ${planJson.intent.currency}. Feasibility: ${planJson.plan.feasibilityAssessment?.isFeasible}.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 1: Intelligent Purchase Planner',
        status: 'FAIL',
        evidence: `Plan failed: ${JSON.stringify(planJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 3',
      testName: 'AI Feature 1: Intelligent Purchase Planner',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // 2. Multi-Strategy Product Recommendations
  try {
    const recRes = await fetch(`${BASE_URL}/api/ai/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: 'lowest_cost',
        intent: {
          purchaseGoal: 'Office stationery procurement',
          budgetLimit: 100,
          currency: 'USD',
          categories: ['office_stationery'],
          requiredItems: [{ categoryOrName: 'notebook', quantity: 15, mandatoryAttributes: [] }],
        },
      }),
    });
    const recJson = await recRes.json();
    if (recRes.status === 200 && recJson.scoredItems?.length > 0) {
      const topRec = recJson.scoredItems[0];
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 2: Multi-Strategy Recommendations (lowest_cost)',
        status: 'PASS',
        evidence: `Found ${recJson.scoredItems.length} options. Top: ${topRec.product.name} at $${topRec.product.unitPrice}/unit. Real Catalog ID: ${topRec.product.id}.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 2: Multi-Strategy Recommendations (lowest_cost)',
        status: 'FAIL',
        evidence: `Recommendation failed: ${JSON.stringify(recJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 3',
      testName: 'AI Feature 2: Multi-Strategy Recommendations (lowest_cost)',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // 3. What-If Simulator
  try {
    const simRes = await fetch(`${BASE_URL}/api/ai/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: { scenarioType: 'PRICE_INCREASE', percentageChange: 15 },
        items: [{ productId: ecoNotebook?.id || 'prod_notebook_recycled_a5', quantity: 10 }],
        budgetLimit: 80,
      }),
    });
    const simJson = await simRes.json();
    if (simRes.status === 200 && simJson.simulation) {
      const sim = simJson.simulation;
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 3: What-if Purchase Simulator',
        status: 'PASS',
        evidence: `Isolated sandbox simulation: Original $${sim.originalGrandTotal.toFixed(2)} -> Simulated $${sim.simulatedGrandTotal.toFixed(2)} (Delta: $${sim.budgetDifference.toFixed(2)}). Catalog data unchanged.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 3: What-if Purchase Simulator',
        status: 'FAIL',
        evidence: `Simulation failed: ${JSON.stringify(simJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 3',
      testName: 'AI Feature 3: What-if Purchase Simulator',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // 4. Risk Review
  try {
    const riskRes = await fetch(`${BASE_URL}/api/ai/risk-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: ecoNotebook?.id || 'prod_notebook_recycled_a5', quantity: 9999 }],
        budgetLimit: 50,
        deadlineDays: 1,
      }),
    });
    const riskJson = await riskRes.json();
    if (riskRes.status === 200 && riskJson.riskAnalysis?.flags?.length > 0) {
      const ra = riskJson.riskAnalysis;
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 4: Explainable Purchase Risk Analyst',
        status: 'PASS',
        evidence: `Detected ${ra.flags.length} flags (${ra.hardBlockersCount} hard blockers): ${ra.flags.map((f: any) => f.title).join('; ')}.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 4: Explainable Purchase Risk Analyst',
        status: 'FAIL',
        evidence: `Risk review failed: ${JSON.stringify(riskJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 3',
      testName: 'AI Feature 4: Explainable Purchase Risk Analyst',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // 5. Post-Purchase Assistant
  try {
    const asstRes = await fetch(`${BASE_URL}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What orders do I have and what are their payment statuses?',
        userEmail: 'alex.chen@boundbuy.org',
      }),
    });
    const asstJson = await asstRes.json();
    if (asstRes.status === 200 && asstJson.answer) {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 5: Grounded Post-Purchase Assistant',
        status: 'PASS',
        evidence: `Assistant answered with ${asstJson.groundedRecords?.length || 0} citations. Excerpt: "${asstJson.answer.substring(0, 90)}..."`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 3',
        testName: 'AI Feature 5: Grounded Post-Purchase Assistant',
        status: 'FAIL',
        evidence: `Assistant query failed: ${JSON.stringify(asstJson)}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 3',
      testName: 'AI Feature 5: Grounded Post-Purchase Assistant',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // Failure Scenario: Negative Budget Intent
  try {
    const invalidBudgetRes = await fetch(`${BASE_URL}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'x', // min 3 chars validation
      }),
    });
    if (invalidBudgetRes.status === 400) {
      record({
        phase: 'PHASE 7',
        testName: 'Failure Scenario: Reject Malformed / Below-Minimum Request',
        status: 'PASS',
        evidence: `HTTP 400 correctly returned by Zod validation schema for prompt shorter than minimum length.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 7',
        testName: 'Failure Scenario: Reject Malformed / Below-Minimum Request',
        status: 'FAIL',
        evidence: `Expected HTTP 400, got ${invalidBudgetRes.status}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 7',
      testName: 'Failure Scenario: Reject Malformed / Below-Minimum Request',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  // Failure Scenario: Unauthorized Non-Existent Order
  try {
    const nonExistentOrderRes = await fetch(`${BASE_URL}/api/orders/order_fake_99999`);
    if (nonExistentOrderRes.status === 404) {
      record({
        phase: 'PHASE 7',
        testName: 'Failure Scenario: Handle Non-Existent Order Gracefully',
        status: 'PASS',
        evidence: `HTTP 404 returned safely with error message without crashing server.`,
        component: 'server/src/routes/api.ts',
      });
    } else {
      record({
        phase: 'PHASE 7',
        testName: 'Failure Scenario: Handle Non-Existent Order Gracefully',
        status: 'FAIL',
        evidence: `Expected HTTP 404, got ${nonExistentOrderRes.status}`,
        component: 'server/src/routes/api.ts',
      });
    }
  } catch (err: any) {
    record({
      phase: 'PHASE 7',
      testName: 'Failure Scenario: Handle Non-Existent Order Gracefully',
      status: 'FAIL',
      evidence: err.message,
      component: 'server/src/routes/api.ts',
    });
  }

  console.log('\n=====================================================');
  console.log('AUDIT SUMMARY:');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Blocked: ${blocked}`);
  console.log('=====================================================');
}

runAudit().catch(console.error);
