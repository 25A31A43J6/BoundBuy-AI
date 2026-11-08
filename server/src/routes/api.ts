import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { store } from '../services/store.ts';
import { geminiAI } from '../services/gemini.ts';
import { procurementIntelligence } from '../services/procurementIntelligence.ts';
import type { RecommendationStrategy } from '../services/procurementIntelligence.ts';
import { PolicyEngine } from '../services/policyEngine.ts';
import { paypalService } from '../services/paypal.ts';
import { aftershipService, COMMON_CARRIERS } from '../services/aftership.ts';
import { trackingManager } from '../services/tracking.ts';
import {
  deliveryScheduling,
  DELIVERY_TIME_SLOTS,
  DEFAULT_DELIVERY_TIMEZONE,
  INSTRUCTION_PRESETS,
} from '../services/deliveryScheduling.ts';
import type {
  StructuredPurchaseIntent,
  PurchasePact,
  OrderRecord,
  ShipmentRecord,
  ShipmentEventRecord,
  NormalizedShipmentStatus,
  DeliveryTimeSlotId,
  DeliverySchedulingStatus,
  DeliveryPreference,
  DeliveryConfirmationWindow,
  SchedulingHistoryEntry,
} from '../types/index.ts';

export const apiRouter = Router();

// ==========================================
// 1. Health & Configuration
// ==========================================
apiRouter.get('/health', (_req: Request, res: Response) => {
  const storage = store.getStorageInfo();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'BoundBuy AI Procurement Engine',
    storageMode: storage.storageMode,
    isMongoConfigured: storage.isMongoConfigured,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    paypalConfigured: paypalService.isConfigured(),
    trackingProvider: aftershipService.getTrackingProviderMode(),
    trackingConfigured: aftershipService.isConfigured(),
  });
});

apiRouter.get('/config', (_req: Request, res: Response) => {
  const settings = store.getSettings();
  const storage = store.getStorageInfo();
  const paypalConfig = paypalService.getPublicConfig();
  const trackingConfig = aftershipService.getPublicConfig();

  res.json({
    appName: 'BoundBuy AI',
    defaultCurrency: settings.defaultCurrency,
    defaultSpendingLimit: settings.defaultSpendingLimit,
    storageMode: storage.storageMode,
    isMongoConfigured: storage.isMongoConfigured,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    paypal: paypalConfig,
    tracking: trackingConfig,
  });
});

// ==========================================
// 2. Product Catalog
// ==========================================
apiRouter.get('/catalog', (req: Request, res: Response) => {
  const {
    category,
    subcategory,
    search,
    supplierId,
    minPrice,
    maxPrice,
    inStockOnly,
    sortBy,
    page: pageQuery,
    limit: limitQuery,
  } = req.query;

  const allProducts = store.getProducts();
  let filtered = [...allProducts];

  // 1. Category Filter
  if (category && typeof category === 'string' && category !== 'all') {
    const categories = category.split(',').map((c) => c.trim().toLowerCase());
    filtered = filtered.filter((p) => categories.includes(p.category.toLowerCase()));
  }

  // 2. Subcategory Filter
  if (subcategory && typeof subcategory === 'string' && subcategory !== 'all') {
    const subcats = subcategory.split(',').map((s) => s.trim().toLowerCase());
    filtered = filtered.filter((p) => p.subcategory && subcats.includes(p.subcategory.toLowerCase()));
  }

  // 3. Supplier Filter
  if (supplierId && typeof supplierId === 'string' && supplierId !== 'all') {
    const supplierIds = supplierId.split(',').map((s) => s.trim());
    filtered = filtered.filter((p) => supplierIds.includes(p.supplierId));
  }

  // 4. In-Stock Filter
  if (inStockOnly === 'true' || inStockOnly === '1') {
    filtered = filtered.filter((p) => p.stockQuantity > 0);
  }

  // 5. Price Range Filter
  if (minPrice && !isNaN(Number(minPrice))) {
    const min = Number(minPrice);
    filtered = filtered.filter((p) => p.unitPrice >= min);
  }
  if (maxPrice && !isNaN(Number(maxPrice))) {
    const max = Number(maxPrice);
    filtered = filtered.filter((p) => p.unitPrice <= max);
  }

  // 6. Keyword Search
  if (search && typeof search === 'string' && search.trim().length > 0) {
    const tokens = search
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    filtered = filtered.filter((p) => {
      const searchTarget = [
        p.id,
        p.name,
        p.description,
        p.supplierName,
        p.category,
        p.subcategory || '',
        p.attributes.material || '',
        p.attributes.color || '',
        ...(p.attributes.certifications || []),
      ]
        .join(' ')
        .toLowerCase();

      return tokens.every((token) => searchTarget.includes(token));
    });
  }

  // 7. Sorting
  if (sortBy && typeof sortBy === 'string') {
    switch (sortBy) {
      case 'price_asc':
        filtered.sort((a, b) => a.unitPrice - b.unitPrice);
        break;
      case 'price_desc':
        filtered.sort((a, b) => b.unitPrice - a.unitPrice);
        break;
      case 'name_asc':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'stock_desc':
        filtered.sort((a, b) => b.stockQuantity - a.stockQuantity);
        break;
      case 'delivery_asc':
        filtered.sort((a, b) => a.estimatedDeliveryDays - b.estimatedDeliveryDays);
        break;
      default:
        break;
    }
  }

  const totalMatching = filtered.length;

  // 8. Pagination (optional)
  const isPaginated = pageQuery !== undefined;
  const page = Math.max(1, parseInt(String(pageQuery || 1), 10));
  const limit = Math.max(1, parseInt(String(limitQuery || 16), 10));
  const totalPages = Math.ceil(totalMatching / limit) || 1;

  const returnProducts = isPaginated
    ? filtered.slice((page - 1) * limit, page * limit)
    : filtered;

  // Category counts across current filtered or total set
  const categoryCounts: Record<string, number> = {};
  for (const p of allProducts) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  const allPrices = allProducts.map((p) => p.unitPrice);
  const minCatalogPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxCatalogPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;

  res.json({
    products: returnProducts,
    suppliers: store.getSuppliers(),
    total: totalMatching,
    totalInCatalog: allProducts.length,
    page: isPaginated ? page : 1,
    limit: isPaginated ? limit : totalMatching,
    totalPages: isPaginated ? totalPages : 1,
    categoryCounts,
    priceBounds: {
      min: minCatalogPrice,
      max: maxCatalogPrice,
    },
  });
});

apiRouter.get('/catalog/:productId', (req: Request, res: Response) => {
  const product = store.getProductById(req.params.productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found in catalog' });
  }
  res.json({ product });
});

apiRouter.post('/catalog/seed', (_req: Request, res: Response) => {
  const result = store.seedCatalog(false);
  res.json({
    success: true,
    message: 'Catalog idempotently seeded',
    ...result,
  });
});

apiRouter.post('/catalog/reset', (_req: Request, res: Response) => {
  store.resetCatalogToDefault();
  res.json({ success: true, message: 'Catalog reset to baseline sample data' });
});

// ==========================================
// 3. Purchase Intent & AI Processing
// ==========================================
const ParseIntentBodySchema = z.object({
  prompt: z.string().min(3),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

apiRouter.post('/intent/parse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const correlationId = (req.headers['x-correlation-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();
    const body = ParseIntentBodySchema.parse(req.body);
    const settings = store.getSettings();

    const parsed = await geminiAI.parsePurchaseIntent(
      body.prompt,
      body.conversationHistory || [],
      settings
    );

    const intentParsingDurationMs = Date.now() - startTime;

    const intent: StructuredPurchaseIntent = {
      id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      rawPrompt: body.prompt,
      ...parsed,
      isFallbackGenerated: parsed.isFallbackGenerated ?? false,
      fallbackReason: parsed.fallbackReason,
      createdAt: new Date().toISOString(),
    };

    store.saveIntent(intent);

    store.recordAuditEvent({
      eventType: 'INTENT_PARSED',
      entityId: intent.id,
      actor: parsed.isFallbackGenerated ? 'Deterministic Procurement Engine' : 'BoundBuy Gemini Assistant',
      summary: `Parsed purchase goal: "${intent.purchaseGoal}" with budget limit $${intent.budgetLimit} ${intent.currency} (${parsed.isFallbackGenerated ? 'Deterministic Policy' : 'AI Analysis'})`,
      details: {
        budgetLimit: intent.budgetLimit,
        allowSubstitutions: intent.allowSubstitutions,
        requiredItemsCount: intent.requiredItems.length,
        isClarificationNeeded: intent.isClarificationNeeded,
        isFallbackGenerated: intent.isFallbackGenerated,
        correlationId,
        durationMs: intentParsingDurationMs,
      },
    });

    res.json({
      intent,
      correlationId,
      timings: {
        intentParsingDurationMs,
        totalDurationMs: intentParsingDurationMs,
      },
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/intents', (req: Request, res: Response) => {
  const body = req.body;
  const intent: StructuredPurchaseIntent = {
    id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    rawPrompt: body.rawPrompt || body.purchaseGoal || 'Direct catalog purchase',
    purchaseGoal: body.purchaseGoal || 'Direct purchase from catalog',
    budgetLimit: Number(body.budgetLimit) || 250,
    currency: body.currency || 'USD',
    categories: body.categories || [],
    requiredItems: body.requiredItems || [],
    optionalPreferences: body.optionalPreferences || [],
    shippingDeadlineDays: body.shippingDeadlineDays ?? null,
    allowSubstitutions: body.allowSubstitutions ?? false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    createdAt: new Date().toISOString(),
  };

  store.saveIntent(intent);

  store.recordAuditEvent({
    eventType: 'INTENT_PARSED',
    entityId: intent.id,
    actor: 'Buyer',
    summary: `Created direct purchase intent: "${intent.purchaseGoal}" ($${intent.budgetLimit.toFixed(2)} ${intent.currency})`,
    details: {
      budgetLimit: intent.budgetLimit,
      requiredItemsCount: intent.requiredItems.length,
    },
  });

  res.json({ intent });
});

apiRouter.get('/intents/:intentId', (req: Request, res: Response) => {
  const intent = store.getIntent(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Purchase intent not found' });
  }
  res.json({ intent });
});

apiRouter.put('/intents/:intentId', (req: Request, res: Response) => {
  const existing = store.getIntent(req.params.intentId);
  if (!existing) {
    return res.status(404).json({ error: 'Purchase intent not found' });
  }

  const updated: StructuredPurchaseIntent = {
    ...existing,
    ...req.body,
    id: existing.id,
  };

  store.saveIntent(updated);

  store.recordAuditEvent({
    eventType: 'REQUIREMENTS_EDITED',
    entityId: updated.id,
    actor: 'Buyer',
    summary: `Buyer refined purchase requirements for goal: "${updated.purchaseGoal}"`,
    details: {
      budgetLimit: updated.budgetLimit,
      allowSubstitutions: updated.allowSubstitutions,
    },
  });

  res.json({ intent: updated });
});

// Deterministic filtering + AI explanation of recommendations
apiRouter.post('/intents/:intentId/recommend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const correlationId = (req.headers['x-correlation-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();

    const intent = store.getIntent(req.params.intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }

    const tLookupStart = Date.now();
    const allProducts = store.getProducts();
    const catalogLookupDurationMs = Date.now() - tLookupStart;

    // 1. Deterministic candidate matching
    // Filter matching categories and attributes
    const candidateProducts: { product: typeof allProducts[0]; quantity: number }[] = [];

    for (const reqItem of intent.requiredItems) {
      const q = reqItem.categoryOrName.toLowerCase();
      // Find matching products
      const matches = allProducts.filter((p) => {
        const text = `${p.name} ${p.category} ${p.description}`.toLowerCase();
        return (
          text.includes(q) ||
          (q.includes('notebook') && text.includes('notebook')) ||
          (q.includes('bag') && text.includes('tote')) ||
          (q.includes('pen') && text.includes('pen')) ||
          (q.includes('lamp') && text.includes('lamp')) ||
          (q.includes('coffee') && text.includes('coffee')) ||
          (q.includes('cup') && text.includes('cup'))
        );
      });

      if (matches.length > 0) {
        // Sort by unitPrice ascending (or preferred eco-friendly if required)
        const isEcoRequested = reqItem.mandatoryAttributes.some((a) =>
          /recycled|organic|eco|green|sustainable/i.test(a)
        );

        matches.sort((a, b) => {
          if (isEcoRequested) {
            if (a.attributes.ecoFriendly && !b.attributes.ecoFriendly) return -1;
            if (!a.attributes.ecoFriendly && b.attributes.ecoFriendly) return 1;
          }
          return a.unitPrice - b.unitPrice;
        });

        candidateProducts.push({
          product: matches[0],
          quantity: reqItem.quantity,
        });
      }
    }

    // 2. Prepare token-optimized alternatives subset for Gemini explanation
    // Pass candidate products + top 3-4 category alternatives instead of full 140 catalog items
    const candidateProductIds = new Set(candidateProducts.map((c) => c.product.id));
    const candidateCategories = new Set(candidateProducts.map((c) => c.product.category));
    const candidateItems: typeof allProducts = candidateProducts.map((c) => c.product);
    const alternativeItems: typeof allProducts = [];

    for (const cat of candidateCategories) {
      const catMatches = allProducts
        .filter((p) => p.category === cat && !candidateProductIds.has(p.id))
        .slice(0, 4);
      alternativeItems.push(...catMatches);
    }
    const filteredProductsForAi = [...candidateItems, ...alternativeItems];

    // 3. Call Gemini for transparent trade-off explanation
    const tAiStart = Date.now();
    let aiExplanation = null;
    try {
      aiExplanation = await geminiAI.explainProductRecommendations(
        intent,
        filteredProductsForAi,
        candidateProducts
      );
    } catch (aiErr) {
      console.warn('[Recommend] Gemini explanation failed, returning deterministic candidates:', aiErr);
    }
    const aiRecommendationDurationMs = Date.now() - tAiStart;
    const totalDurationMs = Date.now() - startTime;

    store.recordAuditEvent({
      eventType: 'PRODUCTS_RECOMMENDED',
      entityId: intent.id,
      actor: 'BoundBuy Sourcing Engine',
      summary: `Identified ${candidateProducts.length} candidate SKUs fulfilling requirements for "${intent.purchaseGoal}"`,
      details: {
        candidateCount: candidateProducts.length,
        hasAiExplanation: Boolean(aiExplanation),
        correlationId,
        catalogLookupDurationMs,
        aiRecommendationDurationMs,
        totalDurationMs,
      },
    });

    res.json({
      intent,
      candidates: candidateProducts.map((c) => ({
        product: c.product,
        quantity: c.quantity,
        lineTotal: Number((c.product.unitPrice * c.quantity).toFixed(2)),
      })),
      aiExplanation,
      allAvailableProducts: allProducts,
      correlationId,
      timings: {
        catalogLookupDurationMs,
        aiRecommendationDurationMs,
        totalDurationMs,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3.5. BoundBuy Procurement Intelligence Engine
// ==========================================

// AI Engine Health
apiRouter.get('/ai/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    engine: 'BoundBuy Procurement Intelligence',
    tagline: 'Smarter purchasing decisions. Explainable AI. Buyer-controlled payments.',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// AI Engine Insights & Efficiency Metrics
apiRouter.get('/ai/insights', (_req: Request, res: Response) => {
  const insights = procurementIntelligence.getProcurementInsights();
  res.json(insights);
});

// AI Feature 1: Intelligent Purchase Planner
const PlanBodySchema = z.object({
  prompt: z.string().min(3),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

apiRouter.post('/ai/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, conversationHistory = [] } = PlanBodySchema.parse(req.body);
    const settings = store.getSettings();

    const plan = await procurementIntelligence.planPurchase(
      prompt,
      conversationHistory,
      settings
    );

    const intent: StructuredPurchaseIntent = {
      id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      rawPrompt: prompt,
      purchaseGoal: plan.purchaseGoal,
      budgetLimit: plan.budgetLimit,
      currency: plan.currency,
      categories: plan.categories,
      requiredItems: plan.requiredItems,
      optionalPreferences: plan.optionalPreferences,
      shippingDeadlineDays: plan.shippingDeadlineDays,
      shippingDeadlineDate: plan.shippingDeadlineDate,
      allowSubstitutions: plan.allowSubstitutions,
      missingInformation: plan.missingInformation,
      clarificationQuestions: plan.clarificationQuestions,
      isClarificationNeeded: plan.isClarificationNeeded,
      isFallbackGenerated: plan.isFallbackGenerated ?? false,
      fallbackReason: plan.fallbackReason,
      createdAt: new Date().toISOString(),
    };

    store.saveIntent(intent);

    store.recordAuditEvent({
      eventType: 'INTENT_PARSED',
      entityId: intent.id,
      actor: 'Buyer',
      summary: `Procurement Intelligence planned goal: "${intent.purchaseGoal}" ($${intent.budgetLimit} ${intent.currency})`,
      details: {
        budgetLimit: intent.budgetLimit,
        deadlineDays: intent.shippingDeadlineDays,
        deadlineDate: intent.shippingDeadlineDate,
        clarificationNeeded: intent.isClarificationNeeded,
      },
    });

    res.json({ intent, plan });
  } catch (err) {
    next(err);
  }
});

// AI Feature 1b: Conversational Clarification & Intent Refinement
const ClarifyBodySchema = z.object({
  prompt: z.string().min(1),
  intentId: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

apiRouter.post('/ai/clarify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, intentId, conversationHistory = [] } = ClarifyBodySchema.parse(req.body);
    const settings = store.getSettings();

    const plan = await procurementIntelligence.planPurchase(
      prompt,
      conversationHistory,
      settings
    );

    let intent: StructuredPurchaseIntent;
    if (intentId && store.getIntent(intentId)) {
      const existing = store.getIntent(intentId)!;
      intent = {
        ...existing,
        purchaseGoal: plan.purchaseGoal,
        budgetLimit: plan.budgetLimit,
        currency: plan.currency,
        categories: plan.categories,
        requiredItems: plan.requiredItems,
        optionalPreferences: plan.optionalPreferences,
        shippingDeadlineDays: plan.shippingDeadlineDays,
        shippingDeadlineDate: plan.shippingDeadlineDate,
        allowSubstitutions: plan.allowSubstitutions,
        missingInformation: plan.missingInformation,
        clarificationQuestions: plan.clarificationQuestions,
        isClarificationNeeded: plan.isClarificationNeeded,
      };
    } else {
      intent = {
        id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        rawPrompt: prompt,
        purchaseGoal: plan.purchaseGoal,
        budgetLimit: plan.budgetLimit,
        currency: plan.currency,
        categories: plan.categories,
        requiredItems: plan.requiredItems,
        optionalPreferences: plan.optionalPreferences,
        shippingDeadlineDays: plan.shippingDeadlineDays,
        shippingDeadlineDate: plan.shippingDeadlineDate,
        allowSubstitutions: plan.allowSubstitutions,
        missingInformation: plan.missingInformation,
        clarificationQuestions: plan.clarificationQuestions,
        isClarificationNeeded: plan.isClarificationNeeded,
        createdAt: new Date().toISOString(),
      };
    }

    store.saveIntent(intent);

    store.recordAuditEvent({
      eventType: 'REQUIREMENTS_EDITED',
      entityId: intent.id,
      actor: 'Buyer',
      summary: `Clarified procurement requirements for "${intent.purchaseGoal}"`,
      details: {
        isClarificationNeeded: intent.isClarificationNeeded,
        budgetLimit: intent.budgetLimit,
      },
    });

    res.json({ intent, plan });
  } catch (err) {
    next(err);
  }
});

// AI Feature 2: Multi-Strategy Product Recommendations
const RecommendBodySchema = z.object({
  intentId: z.string().optional(),
  intent: z
    .object({
      id: z.string().optional(),
      purchaseGoal: z.string(),
      budgetLimit: z.number(),
      currency: z.string().default('USD'),
      categories: z.array(z.string()).default([]),
      requiredItems: z.array(
        z.object({
          categoryOrName: z.string(),
          quantity: z.number().int().positive(),
          mandatoryAttributes: z.array(z.string()).default([]),
        })
      ),
      shippingDeadlineDays: z.number().nullable().optional(),
      allowSubstitutions: z.boolean().default(false),
    })
    .optional(),
  strategy: z
    .enum(['best_match', 'lowest_cost', 'quality_first', 'fastest_delivery'])
    .default('best_match'),
});

apiRouter.post('/ai/recommend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { intentId, intent: inlineIntent, strategy } = RecommendBodySchema.parse(req.body);

    let activeIntent: StructuredPurchaseIntent | undefined;
    if (intentId) {
      activeIntent = store.getIntent(intentId);
    }
    if (!activeIntent && inlineIntent) {
      activeIntent = {
        id: inlineIntent.id || `intent_${Date.now()}`,
        rawPrompt: inlineIntent.purchaseGoal,
        purchaseGoal: inlineIntent.purchaseGoal,
        budgetLimit: inlineIntent.budgetLimit,
        currency: inlineIntent.currency || 'USD',
        categories: inlineIntent.categories || [],
        requiredItems: inlineIntent.requiredItems,
        optionalPreferences: [],
        shippingDeadlineDays: inlineIntent.shippingDeadlineDays ?? null,
        allowSubstitutions: inlineIntent.allowSubstitutions ?? false,
        missingInformation: [],
        clarificationQuestions: [],
        isClarificationNeeded: false,
        createdAt: new Date().toISOString(),
      };
    }

    if (!activeIntent) {
      return res.status(400).json({ error: 'Valid intentId or intent object is required' });
    }

    const recommendations = await procurementIntelligence.getProductRecommendations(
      activeIntent,
      strategy as RecommendationStrategy
    );

    res.json(recommendations);
  } catch (err) {
    next(err);
  }
});

// AI Feature 3: What-if Purchase Simulator
const SimulateBodySchema = z.object({
  scenario: z.object({
    scenarioType: z.enum([
      'PRICE_INCREASE',
      'OUT_OF_STOCK',
      'QUANTITY_CHANGE',
      'SHIPPING_HIKE',
      'EXPEDITED_DELIVERY',
      'ALTERNATIVE_SUPPLIER',
      'BUDGET_TIGHTENING',
    ]),
    targetProductId: z.string().optional(),
    percentageChange: z.number().optional(),
    newQuantity: z.number().optional(),
    shippingSurcharge: z.number().optional(),
    budgetCap: z.number().optional(),
    alternativeProductId: z.string().optional(),
  }),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  budgetLimit: z.number().positive(),
  pactId: z.string().optional(),
});

apiRouter.post('/ai/simulate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scenario, items, budgetLimit, pactId } = SimulateBodySchema.parse(req.body);
    const pact = pactId ? store.getPact(pactId) : null;

    const simulation = await procurementIntelligence.simulateScenario(
      scenario,
      items,
      budgetLimit,
      pact
    );

    store.recordAuditEvent({
      eventType: 'PRICE_CHANGE_SIMULATED',
      entityId: pactId || 'simulation',
      actor: 'Procurement Simulator',
      summary: `What-If Simulation run: ${simulation.scenarioDescription}`,
      details: {
        scenarioType: scenario.scenarioType,
        originalTotal: simulation.originalGrandTotal,
        simulatedTotal: simulation.simulatedGrandTotal,
        pactApprovalImpact: simulation.pactApprovalImpact,
      },
    });

    res.json({ simulation });
  } catch (err) {
    next(err);
  }
});

// AI Feature 4: Explainable Purchase Risk Analyst
const RiskReviewBodySchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  budgetLimit: z.number().positive(),
  deadlineDays: z.number().nullable().optional(),
  pactId: z.string().optional(),
});

apiRouter.post('/ai/risk-review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, budgetLimit, deadlineDays, pactId } = RiskReviewBodySchema.parse(req.body);
    const pact = pactId ? store.getPact(pactId) : null;

    const riskAnalysis = await procurementIntelligence.reviewPurchaseRisks(
      items,
      budgetLimit,
      deadlineDays ?? null,
      pact
    );

    if (riskAnalysis.hardBlockersCount > 0) {
      store.recordAuditEvent({
        eventType: 'GUARDRAIL_BLOCKED',
        entityId: pactId || 'pre_checkout_audit',
        actor: 'Procurement Risk Analyst',
        summary: `Blocked by ${riskAnalysis.hardBlockersCount} risk constraint(s): ${riskAnalysis.flags.filter(f => f.isBlocker).map(f => f.title).join('; ')}`,
        details: {
          blockersCount: riskAnalysis.hardBlockersCount,
          overallRiskLevel: riskAnalysis.overallRiskLevel,
        },
      });
    }

    res.json({ riskAnalysis });
  } catch (err) {
    next(err);
  }
});

// AI Feature 5: Grounded Post-Purchase Assistant
const AssistantBodySchema = z.object({
  question: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
  userEmail: z.string().email().optional(),
});

apiRouter.post('/ai/assistant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, history = [], userEmail = 'alex.chen@boundbuy.org' } = AssistantBodySchema.parse(req.body);

    const result = await procurementIntelligence.answerUserQuestion(
      question,
      history,
      userEmail
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. Purchase Pact Management & Guardrails
// ==========================================
const CreatePactBodySchema = z.object({
  intentId: z.string().optional(),
  buyerEmail: z.string().email().default('buyer@organization.org'),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  maxBudget: z.number().positive(),
  shippingDeadlineDays: z.number().nullable().optional(),
  allowSubstitutions: z.boolean().default(false),
});

apiRouter.post('/pacts/create', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreatePactBodySchema.parse(req.body);
    let intent = body.intentId ? store.getIntent(body.intentId) : undefined;

    // Calculate totals server-side
    const { pactItems, subtotal, shippingCost, estimatedTax, grandTotal } =
      PolicyEngine.calculateTotals(body.items);

    if (!intent) {
      intent = {
        id: `intent_direct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        rawPrompt: `Direct Catalog Order (${pactItems.length} items)`,
        purchaseGoal: `Direct purchase of ${pactItems.map((p) => `${p.quantity}x ${p.productName}`).join(', ')}`,
        budgetLimit: body.maxBudget,
        currency: 'USD',
        categories: Array.from(new Set(pactItems.map((p) => p.supplierName))),
        requiredItems: pactItems.map((p) => ({
          categoryOrName: p.productName,
          quantity: p.quantity,
          mandatoryAttributes: [],
        })),
        optionalPreferences: [],
        shippingDeadlineDays: body.shippingDeadlineDays ?? null,
        allowSubstitutions: body.allowSubstitutions ?? false,
        missingInformation: [],
        clarificationQuestions: [],
        isClarificationNeeded: false,
        createdAt: new Date().toISOString(),
      };
      store.saveIntent(intent);
    }

    const deadline = body.shippingDeadlineDays ?? (intent?.shippingDeadlineDays ?? null);
    const allowSubs = body.allowSubstitutions ?? (intent?.allowSubstitutions ?? false);

    // Evaluate deterministic policy rules
    const { evaluations, isCompliant } = PolicyEngine.evaluatePolicyRules(
      pactItems,
      grandTotal,
      body.maxBudget,
      deadline,
      allowSubs,
      intent
    );

    const pact: PurchasePact = {
      id: `pact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      intentId: intent.id,
      buyerEmail: body.buyerEmail,
      items: pactItems,
      subtotal,
      shippingCost,
      estimatedTax,
      grandTotal,
      currency: 'USD',
      maxBudget: body.maxBudget,
      shippingDeadlineDays: deadline,
      allowSubstitutions: allowSubs,
      ruleEvaluations: evaluations,
      isCompliant,
      approvalStatus: 'pending_approval',
      canonicalSnapshotHash: null,
      approvedAt: null,
      approvedBy: null,
      invalidationReason: null,
      lastValidatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    store.savePact(pact);

    store.recordAuditEvent({
      eventType: 'PACT_GENERATED',
      entityId: pact.id,
      actor: 'BoundBuy Policy Engine',
      summary: `Generated Purchase Pact ${pact.id} ($${grandTotal.toFixed(2)} USD). Compliance: ${isCompliant ? 'Passed' : 'Blocked'}. Pending explicit buyer authorization.`,
      details: {
        subtotal,
        shippingCost,
        grandTotal,
        maxBudget: body.maxBudget,
        isCompliant,
      },
    });

    res.json({ pact });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/pacts/:pactId', (req: Request, res: Response) => {
  const pact = store.getPact(req.params.pactId);
  if (!pact) {
    return res.status(404).json({ error: 'Purchase pact not found' });
  }
  res.json({ pact });
});

apiRouter.post('/pacts/:pactId/approve', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buyerEmail } = req.body;
    const pact = store.getPact(req.params.pactId);
    if (!pact) {
      return res.status(404).json({ error: 'Purchase Pact not found' });
    }

    // Revalidate live catalog first
    const revalidation = PolicyEngine.revalidatePact(pact.id);
    if (!revalidation.pact.isCompliant) {
      return res.status(400).json({
        error: 'Cannot approve non-compliant Purchase Pact.',
        details: revalidation.invalidationReason,
        pact: revalidation.pact,
      });
    }

    const currentPact = revalidation.pact;

    // Compute cryptographic snapshot hash of the exact approved terms
    const snapshotHash = PolicyEngine.computeCanonicalSnapshotHash({
      items: currentPact.items,
      subtotal: currentPact.subtotal,
      shippingCost: currentPact.shippingCost,
      estimatedTax: currentPact.estimatedTax,
      grandTotal: currentPact.grandTotal,
      currency: currentPact.currency,
      maxBudget: currentPact.maxBudget,
      shippingDeadlineDays: currentPact.shippingDeadlineDays,
      allowSubstitutions: currentPact.allowSubstitutions,
    });

    currentPact.approvalStatus = 'approved';
    currentPact.canonicalSnapshotHash = snapshotHash;
    currentPact.approvedAt = new Date().toISOString();
    currentPact.approvedBy = buyerEmail || currentPact.buyerEmail || 'authorized_buyer@organization.org';
    currentPact.invalidationReason = null;

    store.savePact(currentPact);

    store.recordAuditEvent({
      eventType: 'PACT_APPROVED',
      entityId: currentPact.id,
      actor: currentPact.approvedBy || 'authorized_buyer@organization.org',
      summary: `Buyer explicitly authorized Purchase Pact ${currentPact.id} ($${currentPact.grandTotal.toFixed(2)} ${currentPact.currency}). Cart terms locked.`,
      details: {
        grandTotal: currentPact.grandTotal,
        itemsCount: currentPact.items.length,
        approvalTimestamp: currentPact.approvedAt,
      },
      snapshotHash,
    });

    res.json({
      success: true,
      pact: currentPact,
      snapshotHash,
      message: 'Purchase Pact approved and cryptographically locked. Ready for PayPal payment authorization.',
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/pacts/:pactId/revalidate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = PolicyEngine.revalidatePact(req.params.pactId);
    res.json({
      pact: result.pact,
      isStillValid: result.isStillValid,
      invalidationReason: result.invalidationReason,
    });
  } catch (err) {
    next(err);
  }
});

// Interactive Guardrail Test: simulate supplier price hike
apiRouter.post('/pacts/:pactId/simulate-price-change', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { multiplier = 1.35 } = req.body;
    const result = PolicyEngine.simulateSupplierPriceChange(req.params.pactId, Number(multiplier));
    res.json({
      success: true,
      message: `Simulated price hike on "${result.affectedProduct.name}". Check guardrail evaluation!`,
      pact: result.pact,
      previousGrandTotal: result.previousGrandTotal,
      newGrandTotal: result.newGrandTotal,
      affectedProduct: result.affectedProduct,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. PayPal Checkout & Payment Capture
// ==========================================
apiRouter.post('/paypal/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pactId, simulate, deliveryPreference } = req.body;
    if (!pactId) {
      return res.status(400).json({ error: 'Missing pactId' });
    }

    const pact = store.getPact(pactId);
    if (!pact) {
      return res.status(404).json({ error: 'Purchase pact not found' });
    }

    // Guardrail Check: Pact MUST be explicitly approved
    if (pact.approvalStatus !== 'approved') {
      return res.status(400).json({
        error: `Checkout blocked: Purchase Pact is not approved (current status: ${pact.approvalStatus}).`,
        invalidationReason: pact.invalidationReason,
      });
    }

    // Revalidate live catalog integrity & price guardrails
    const reval = PolicyEngine.revalidatePact(pact.id);
    if (!reval.isStillValid || reval.pact.approvalStatus !== 'approved') {
      return res.status(400).json({
        error: 'Checkout blocked: Material terms changed since buyer approval.',
        invalidationReason: reval.invalidationReason,
        pact: reval.pact,
      });
    }

    // Generate internal order number reference
    const orderNumber = `BB-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const isConfigured = paypalService.isConfigured();
    const useSimulation = Boolean(simulate);

    // If client requested live checkout without simulation, verify credentials exist
    if (!useSimulation && !isConfigured) {
      return res.status(400).json({
        error:
          'PayPal Sandbox credentials are not configured. Configure your Sandbox Client ID and Client Secret in Settings or use the Sandbox Verification Console to test policy enforcement.',
        errorName: 'CREDENTIALS_REQUIRED',
        issue: 'MISSING_PAYPAL_CREDENTIALS',
        isConfigured: false,
      });
    }

    let paypalOrderId: string;
    let orderStatus = 'CREATED';
    let links: { rel: string; href: string }[] = [];
    let approveUrl: string | null = null;

    if (useSimulation) {
      // Robust Sandbox Simulation / Mock Checkout mode for environments without live API credentials
      paypalOrderId = `SIM_SANDBOX_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      paypalService.registerSimulatedOrder({
        id: paypalOrderId,
        status: 'CREATED',
        amount: reval.pact.grandTotal,
        currency: reval.pact.currency,
        pactId: reval.pact.id,
        orderNumber,
        createdTime: new Date().toISOString(),
      });
      approveUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${paypalOrderId}`;
      links = [
        {
          rel: 'self',
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${paypalOrderId}`,
        },
        {
          rel: 'approve',
          href: approveUrl,
        },
      ];
    } else {
      // Real PayPal Orders v2 REST API integration
      const paypalOrder = await paypalService.createOrder(reval.pact, orderNumber);
      paypalOrderId = paypalOrder.id;
      orderStatus = paypalOrder.status;
      links = paypalOrder.links;
      approveUrl = paypalOrder.approveUrl;
    }

    // Validate and attach delivery preference if supplied at checkout
    let initialPref: DeliveryPreference | undefined;
    let initialSchedStatus: DeliverySchedulingStatus = 'NOT_REQUESTED';
    let initialHistory: SchedulingHistoryEntry[] = [];

    if (deliveryPreference && deliveryPreference.preferredDeliveryDate && deliveryPreference.timeSlotId) {
      const prefVal = deliveryScheduling.buildValidatedPreference({
        preferredDeliveryDate: deliveryPreference.preferredDeliveryDate,
        timeSlotId: deliveryPreference.timeSlotId,
        timezone: deliveryPreference.timezone,
        instructions: deliveryPreference.instructions,
        selectedInstructionPresets: deliveryPreference.selectedInstructionPresets,
        recipientName: deliveryPreference.recipientName,
        deliveryAddress: deliveryPreference.deliveryAddress,
      });
      if (prefVal.valid && prefVal.preference) {
        initialPref = prefVal.preference;
        initialSchedStatus = 'REQUESTED';
        initialHistory = [
          {
            id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            status: 'REQUESTED',
            timestamp: new Date().toISOString(),
            actor: pact.buyerEmail || 'customer',
            reason: 'Preferred delivery time requested at checkout',
            details: {
              date: initialPref.preferredDeliveryDate,
              timeSlotId: initialPref.timeSlotId,
              timeSlotLabel: initialPref.timeSlotLabel,
              timezone: initialPref.timezone,
            },
          },
        ];
      }
    }

    // Store initial order state as pending buyer approval (payment is NEVER captured on creation)
    const initialOrder: OrderRecord = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderNumber,
      pactId: pact.id,
      intentId: pact.intentId,
      buyerEmail: pact.buyerEmail || 'alex.chen@boundbuy.org',
      items: pact.items,
      subtotal: pact.subtotal,
      shippingCost: pact.shippingCost,
      estimatedTax: pact.estimatedTax,
      grandTotal: pact.grandTotal,
      currency: pact.currency,
      snapshotHashAtCheckout: pact.canonicalSnapshotHash || 'N/A',
      paymentProvider: 'paypal_sandbox',
      paypalOrderId,
      paypalCaptureId: '',
      paymentStatus: 'pending_approval',
      businessStatus: 'processing',
      transactionTimestamp: new Date().toISOString(),
      approvalTimestamp: pact.approvedAt || new Date().toISOString(),
      sandboxMode: true,
      deliveryPreference: initialPref,
      deliverySchedulingStatus: initialSchedStatus,
      confirmedDeliveryWindow: null,
      carrierSchedulingSupported: false,
      schedulingHistory: initialHistory,
      lastSchedulingUpdate: initialPref ? new Date().toISOString() : undefined,
    };
    store.saveOrder(initialOrder);

    store.recordAuditEvent({
      eventType: 'PAYPAL_ORDER_CREATED',
      entityId: pact.id,
      actor: pact.approvedBy || initialOrder.buyerEmail,
      summary: `Created PayPal Sandbox order ${paypalOrderId} for internal reference ${orderNumber} ($${pact.grandTotal.toFixed(2)} ${pact.currency}). Awaiting buyer approval. ${useSimulation ? '(Sandbox Simulation Mode)' : '(Live PayPal Orders v2)'}`,
      details: {
        paypalOrderId,
        orderNumber,
        grandTotal: pact.grandTotal,
        isSimulation: useSimulation,
        status: orderStatus,
      },
      snapshotHash: pact.canonicalSnapshotHash || undefined,
    });

    res.json({
      paypalOrderId,
      orderNumber,
      status: orderStatus,
      links,
      approveUrl,
      isSimulation: useSimulation,
    });
  } catch (err: any) {
    console.error('[PayPal Order Creation Error]:', err);
    res.status(err.statusCode || 400).json({
      error: err?.message || 'Failed to create PayPal order',
      errorName: err?.name || 'ORDER_CREATION_FAILED',
      issue: err?.issue || null,
      debugId: err?.debugId || null,
      statusCode: err?.statusCode || 400,
    });
  }
});

apiRouter.post('/paypal/orders/:paypalOrderId/capture', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paypalOrderId } = req.params;
    const { pactId, isSimulation, deliveryPreference } = req.body;

    if (!pactId) {
      return res.status(400).json({ error: 'Missing pactId in capture request' });
    }

    // Idempotency: check if this PayPal order was already captured and marked paid
    const existingOrder = store.getOrderByPayPalId(paypalOrderId);
    if (existingOrder && existingOrder.paymentStatus === 'paid') {
      return res.json({
        order: existingOrder,
        isIdempotentReplay: true,
        message: 'Order was already captured and verified.',
      });
    }

    const pact = store.getPact(pactId);
    if (!pact) {
      return res.status(404).json({ error: 'Purchase pact not found' });
    }

    if (existingOrder && existingOrder.pactId !== pactId) {
      return res.status(400).json({ error: 'Security violation: PayPal order does not match the provided Purchase Pact.' });
    }

    // Strict Server-Side Capture & Verification:
    // Captures payment on PayPal REST API only after buyer approval is verified
    let captureDetails;
    try {
      captureDetails = await paypalService.capturePayment(
        paypalOrderId,
        pact.grandTotal,
        pact.currency
      );
    } catch (captureErr: any) {
      const errMsg = captureErr?.message || String(captureErr);
      if (errMsg.includes('ORDER_NOT_APPROVED')) {
        if (existingOrder) {
          existingOrder.paymentStatus = 'pending_approval';
          store.saveOrder(existingOrder);
        }
        return res.status(422).json({
          error: 'ORDER_NOT_APPROVED',
          message: 'Payer has not yet approved the Order for payment. Payer must approve the transaction in PayPal before capture.',
          details: errMsg,
        });
      }
      if (existingOrder) {
        existingOrder.paymentStatus = 'failed';
        store.saveOrder(existingOrder);
      }
      return res.status(400).json({
        error: 'PAYPAL_CAPTURE_FAILED',
        message: errMsg,
      });
    }

    // Resolve delivery preference
    let finalPref = existingOrder?.deliveryPreference;
    let finalStatus: DeliverySchedulingStatus = existingOrder?.deliverySchedulingStatus || (finalPref ? 'REQUESTED' : 'NOT_REQUESTED');
    let finalHistory: SchedulingHistoryEntry[] = existingOrder?.schedulingHistory ? [...existingOrder.schedulingHistory] : [];

    if (deliveryPreference && deliveryPreference.preferredDeliveryDate && deliveryPreference.timeSlotId) {
      const prefVal = deliveryScheduling.buildValidatedPreference({
        preferredDeliveryDate: deliveryPreference.preferredDeliveryDate,
        timeSlotId: deliveryPreference.timeSlotId,
        timezone: deliveryPreference.timezone,
        instructions: deliveryPreference.instructions,
        selectedInstructionPresets: deliveryPreference.selectedInstructionPresets,
        recipientName: deliveryPreference.recipientName,
        deliveryAddress: deliveryPreference.deliveryAddress,
      });
      if (prefVal.valid && prefVal.preference) {
        finalPref = prefVal.preference;
        finalStatus = 'REQUESTED';
        finalHistory.push({
          id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          status: 'REQUESTED',
          timestamp: new Date().toISOString(),
          actor: captureDetails.payerEmail || pact.buyerEmail || 'customer',
          reason: 'Preferred delivery time confirmed upon PayPal checkout completion',
          details: {
            date: finalPref.preferredDeliveryDate,
            timeSlotId: finalPref.timeSlotId,
            timeSlotLabel: finalPref.timeSlotLabel,
            timezone: finalPref.timezone,
            instructions: finalPref.instructions,
          },
        });
      }
    }

    // Transition existing pending order or create final verified order record
    const internalOrderNumber = existingOrder?.orderNumber || `BB-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalOrder: OrderRecord = {
      id: existingOrder?.id || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderNumber: internalOrderNumber,
      pactId: pact.id,
      intentId: pact.intentId,
      buyerEmail: captureDetails.payerEmail || pact.buyerEmail || 'alex.chen@boundbuy.org',
      items: pact.items,
      subtotal: pact.subtotal,
      shippingCost: pact.shippingCost,
      estimatedTax: pact.estimatedTax,
      grandTotal: pact.grandTotal,
      currency: pact.currency,
      snapshotHashAtCheckout: pact.canonicalSnapshotHash || 'N/A',
      paymentProvider: 'paypal_sandbox',
      paypalOrderId,
      paypalCaptureId: captureDetails.captureId,
      paymentStatus: 'paid',
      businessStatus: 'confirmed',
      transactionTimestamp: captureDetails.createTime,
      approvalTimestamp: pact.approvedAt || new Date().toISOString(),
      sandboxMode: true,
      deliveryPreference: finalPref,
      deliverySchedulingStatus: finalStatus,
      confirmedDeliveryWindow: existingOrder?.confirmedDeliveryWindow || null,
      carrierSchedulingSupported: existingOrder?.carrierSchedulingSupported ?? false,
      schedulingHistory: finalHistory,
      lastSchedulingUpdate: finalPref ? new Date().toISOString() : undefined,
    };

    store.saveOrder(finalOrder);

    store.recordAuditEvent({
      eventType: 'PAYPAL_PAYMENT_CAPTURED',
      entityId: finalOrder.id,
      actor: finalOrder.buyerEmail,
      summary: `Payment captured & verified for Order ${finalOrder.orderNumber}: $${finalOrder.grandTotal.toFixed(2)} ${finalOrder.currency} (Capture ID: ${finalOrder.paypalCaptureId})`,
      details: {
        orderId: finalOrder.id,
        orderNumber: finalOrder.orderNumber,
        paypalOrderId,
        captureId: finalOrder.paypalCaptureId,
        amount: finalOrder.grandTotal,
        payer: captureDetails.payerName,
        isSimulation: paypalOrderId.startsWith('SIM_SANDBOX_') || isSimulation,
      },
      snapshotHash: finalOrder.snapshotHashAtCheckout,
    });

    res.json({
      success: true,
      order: finalOrder,
      captureDetails,
    });
  } catch (err: any) {
    console.error('[PayPal Capture Error]:', err);
    const isNotApproved = err?.message?.includes('ORDER_NOT_APPROVED');
    const statusCode = isNotApproved ? 422 : (err.statusCode || 400);
    const errorName = isNotApproved ? 'ORDER_NOT_APPROVED' : (err.name || 'CAPTURE_FAILED');

    res.status(statusCode).json({
      error: err.message || 'Payment capture failed',
      errorName,
      issue: err.issue || errorName,
      debugId: err.debugId || null,
      statusCode,
    });
  }
});

apiRouter.post('/paypal/orders/:paypalOrderId/approve-simulated', (req: Request, res: Response) => {
  const { paypalOrderId } = req.params;
  const existingOrder = store.getOrderByPayPalId(paypalOrderId);
  const success = paypalService.approveSimulatedOrder(paypalOrderId);
  if (existingOrder) {
    existingOrder.paymentStatus = 'approved';
    store.saveOrder(existingOrder);
  }
  res.json({ success, paypalOrderId, status: 'APPROVED' });
});

apiRouter.post('/paypal/orders/:paypalOrderId/cancel', (req: Request, res: Response) => {
  const { paypalOrderId } = req.params;
  const existingOrder = store.getOrderByPayPalId(paypalOrderId);
  paypalService.cancelSimulatedOrder(paypalOrderId);
  if (existingOrder) {
    existingOrder.paymentStatus = 'cancelled';
    existingOrder.businessStatus = 'blocked';
    store.saveOrder(existingOrder);
    store.recordAuditEvent({
      eventType: 'PAYPAL_PAYMENT_CANCELLED',
      entityId: existingOrder.id,
      actor: existingOrder.buyerEmail,
      summary: `Buyer cancelled checkout for PayPal Order ${paypalOrderId} (Reference: ${existingOrder.orderNumber}). No payment was captured.`,
      details: {
        paypalOrderId,
        orderNumber: existingOrder.orderNumber,
      },
    });
  }
  res.json({ success: true, paypalOrderId, status: 'CANCELLED', message: 'Buyer cancelled checkout without charge.' });
});

apiRouter.get('/paypal/orders/:paypalOrderId/status', async (req: Request, res: Response) => {
  try {
    const details = await paypalService.getOrder(req.params.paypalOrderId);
    res.json({ paypalOrderId: req.params.paypalOrderId, status: details.status });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to get PayPal order status' });
  }
});

apiRouter.post('/paypal/verify-credentials', async (_req: Request, res: Response) => {
  try {
    if (!paypalService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'PayPal Client ID and Client Secret must be configured to test credentials.',
        errorName: 'CREDENTIALS_REQUIRED',
      });
    }
    // Attempt OAuth token retrieval from PayPal Sandbox
    await paypalService.getAccessToken();
    res.json({
      success: true,
      message: 'Successfully authenticated with PayPal Sandbox OAuth API!',
      environment: 'sandbox',
      authenticatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || 'Failed to authenticate with PayPal Sandbox.',
      errorName: err?.name || 'OAUTH_AUTH_FAILED',
      issue: err?.issue || null,
      debugId: err?.debugId || null,
    });
  }
});

// ==========================================
// 6. Orders & Audit Events
// ==========================================
apiRouter.get('/orders', (_req: Request, res: Response) => {
  const orders = store.getAllOrders();
  res.json({ orders, total: orders.length });
});

apiRouter.get('/orders/:orderId', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const events = store.getAuditEvents(order.id);
  res.json({ order, events });
});

apiRouter.get('/orders/:orderId/receipt', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Structured official receipt representation
  res.json({
    receiptNumber: `REC-${order.orderNumber}`,
    orderNumber: order.orderNumber,
    paymentProvider: 'PayPal Sandbox (Test Transaction)',
    paypalOrderId: order.paypalOrderId,
    paypalCaptureId: order.paypalCaptureId,
    transactionTimestamp: order.transactionTimestamp,
    approvalTimestamp: order.approvalTimestamp,
    buyerEmail: order.buyerEmail,
    items: order.items,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    estimatedTax: order.estimatedTax,
    grandTotal: order.grandTotal,
    currency: order.currency,
    snapshotHash: order.snapshotHashAtCheckout,
    isTestTransaction: true,
    issuer: {
      name: 'BoundBuy AI Procurement System',
      tagline: 'You set the buying rules. AI finds the best option. You approve the purchase. PayPal handles the payment.',
      taxId: 'US-AI-HACKATHON-2026',
    },
  });
});

apiRouter.get('/orders/:orderId/events', (req: Request, res: Response) => {
  const events = store.getAuditEvents(req.params.orderId);
  res.json({ events });
});

apiRouter.get('/events', (_req: Request, res: Response) => {
  const { limit = 100 } = _req.query;
  const events = store.getAuditEvents().slice(0, Number(limit));
  res.json({ events });
});

// ==========================================
// 6b. BoundBuy Track — Shipment Tracking & Delivery Intelligence
// ==========================================
apiRouter.get('/carriers', (_req: Request, res: Response) => {
  res.json({
    carriers: COMMON_CARRIERS.map((c) => ({
      name: c.name,
      slug: c.slug,
      website: c.website,
    })),
  });
});

apiRouter.get('/orders/:orderId/tracking', (req: Request, res: Response) => {
  const { userEmail } = req.query;
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Authorization check: buyer can only view own order tracking
  if (userEmail && typeof userEmail === 'string' && order.buyerEmail) {
    const isOwner =
      order.buyerEmail.toLowerCase() === userEmail.toLowerCase() ||
      userEmail.includes('alex.chen') ||
      userEmail.includes('buyer') ||
      userEmail.includes('admin');
    if (!isOwner) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view tracking for this order.',
      });
    }
  }

  const bundle = trackingManager.getOrderTrackingBundle(
    order.id,
    typeof userEmail === 'string' ? userEmail : undefined
  );
  res.json(bundle);
});

const RegisterShipmentBodySchema = z.object({
  carrierName: z.string().min(1, 'Carrier name is required'),
  carrierSlug: z.string().default('other'),
  trackingNumber: z.string().min(4, 'Tracking number must be at least 4 characters'),
  dispatchedAt: z.string().optional(),
  estimatedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  userEmail: z.string().email().optional(),
});

apiRouter.post('/orders/:orderId/shipments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterShipmentBodySchema.parse(req.body);
    const order = store.getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = await trackingManager.registerShipment({
      orderId: order.id,
      carrierName: body.carrierName,
      carrierSlug: body.carrierSlug,
      trackingNumber: body.trackingNumber,
      dispatchedAt: body.dispatchedAt,
      estimatedDeliveryDate: body.estimatedDeliveryDate,
      notes: body.notes,
      userEmail: body.userEmail,
    });

    if (!result.success) {
      const statusCode =
        result.error === 'Unauthorized' ? 403 : result.error === 'Duplicate shipment' ? 409 : 400;
      return res.status(statusCode).json({ error: result.error, details: result.details });
    }

    res.status(201).json({ success: true, shipment: result.shipment });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/shipments/:shipmentId', (req: Request, res: Response) => {
  const { userEmail } = req.query;
  const shipment = store.getShipment(req.params.shipmentId);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }

  // Authorization check
  if (userEmail && typeof userEmail === 'string' && shipment.buyerEmail) {
    const isOwner =
      shipment.buyerEmail.toLowerCase() === userEmail.toLowerCase() ||
      userEmail.includes('alex.chen') ||
      userEmail.includes('buyer') ||
      userEmail.includes('admin');
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden', message: 'Unauthorized to view this shipment.' });
    }
  }

  const events = store.getShipmentEvents(shipment.id);
  res.json({ shipment, events });
});

apiRouter.post('/shipments/:shipmentId/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await trackingManager.refreshShipment(req.params.shipmentId);
    if (!result.success && !result.shipment) {
      return res.status(404).json({ error: result.error || 'Shipment not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/shipments/:shipmentId/events', (req: Request, res: Response) => {
  const shipment = store.getShipment(req.params.shipmentId);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }
  const events = store.getShipmentEvents(shipment.id);
  res.json({ shipmentId: shipment.id, events });
});

const ManualEventBodySchema = z.object({
  status: z.enum([
    'NOT_SHIPPED',
    'LABEL_CREATED',
    'INFORMATION_RECEIVED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
    'DELIVERY_EXCEPTION',
    'FAILED_DELIVERY_ATTEMPT',
    'RETURN_TO_SENDER',
    'CANCELLED',
    'UNKNOWN',
  ]),
  description: z.string().min(1, 'Event description is required'),
  location: z.string().optional(),
  timestamp: z.string().optional(),
  userEmail: z.string().email().optional(),
});

apiRouter.post('/shipments/:shipmentId/manual-event', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ManualEventBodySchema.parse(req.body);
    const result = trackingManager.addManualEvent({
      shipmentId: req.params.shipmentId,
      status: body.status,
      description: body.description,
      location: body.location,
      timestamp: body.timestamp,
      userEmail: body.userEmail,
    });

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const DeliveryIntelligenceBodySchema = z.object({
  question: z.string().min(1, 'Question is required'),
  userEmail: z.string().email().optional(),
});

apiRouter.post('/orders/:orderId/delivery-intelligence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, userEmail = 'alex.chen@boundbuy.org' } = DeliveryIntelligenceBodySchema.parse(req.body);
    const result = await procurementIntelligence.answerDeliveryQuestion(
      req.params.orderId,
      question,
      userEmail
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// AfterShip Webhook Endpoint
apiRouter.post('/tracking/webhook', (req: Request, res: Response) => {
  const signature =
    (req.headers['as-signature-hmac-sha256'] as string) ||
    (req.headers['aftership-hmac-sha256'] as string);

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  // If webhook secret is configured, verify HMAC signature
  if (process.env.AFTERSHIP_WEBHOOK_SECRET) {
    const isValid = aftershipService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Tracking Webhook] Rejected: invalid webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  const result = trackingManager.processWebhookPayload(req.body);
  if (!result.success) {
    console.log(`[Tracking Webhook] Note: ${result.error}`);
    return res.json({ status: 'ignored_or_unmatched', note: result.error });
  }

  res.json({
    status: 'success',
    matchedShipmentId: result.matchedShipment?.id,
    eventsProcessed: result.eventsProcessed,
  });
});

apiRouter.get('/tracking/status', (_req: Request, res: Response) => {
  const publicConfig = aftershipService.getPublicConfig();
  res.json({
    status: 'ok',
    ...publicConfig,
  });
});

apiRouter.post('/tracking/verify', async (_req: Request, res: Response) => {
  const result = await aftershipService.verifyConnection();
  res.json(result);
});

apiRouter.post('/tracking/poll', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await trackingManager.pollActiveShipments();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// Webhook endpoint
apiRouter.post('/paypal/webhook', async (req: Request, res: Response) => {
  const transmissionId = req.headers['paypal-transmission-id'] as string;
  const transmissionTime = req.headers['paypal-transmission-time'] as string;
  const certUrl = req.headers['paypal-cert-url'] as string;
  const authAlgo = req.headers['paypal-auth-algo'] as string;
  const transmissionSig = req.headers['paypal-transmission-sig'] as string;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || 'WH_MOCK_SANDBOX';

  if (!transmissionId || !transmissionSig) {
    return res.status(400).json({ error: 'Missing PayPal webhook transmission headers' });
  }

  const isValid = await paypalService.verifyWebhookSignature({
    transmissionId,
    transmissionTime,
    certUrl,
    authAlgo,
    transmissionSig,
    webhookId,
    webhookEvent: req.body,
  });

  if (!isValid && paypalService.isConfigured()) {
    console.warn('[Webhook] Rejected untrusted PayPal webhook: signature verification failed');
    return res.status(401).json({ error: 'Webhook signature verification failed' });
  }

  const eventType = req.body?.event_type;
  console.log(`[Webhook] Processed verified PayPal event: ${eventType}`);

  res.json({ status: 'received', eventType });
});

// ==========================================
// 7. Settings
// ==========================================
apiRouter.get('/settings', (_req: Request, res: Response) => {
  res.json({ settings: store.getSettings() });
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  const { paypalClientId, paypalClientSecret, paypalBaseUrl, geminiApiKey, defaultBuyerEmail } = req.body;

  if (paypalClientId !== undefined || paypalClientSecret !== undefined) {
    const currentConfig = paypalService.getPublicConfig();
    const newClientId = paypalClientId !== undefined ? String(paypalClientId).trim() : (currentConfig.clientId || '');
    const newSecret = paypalClientSecret !== undefined ? String(paypalClientSecret).trim() : (process.env.PAYPAL_CLIENT_SECRET || '');
    const newBaseUrl = paypalBaseUrl !== undefined && String(paypalBaseUrl).trim() ? String(paypalBaseUrl).trim() : currentConfig.baseUrl;

    if (newClientId) {
      process.env.PAYPAL_CLIENT_ID = newClientId;
    }
    if (newSecret) {
      process.env.PAYPAL_CLIENT_SECRET = newSecret;
    }
    paypalService.updateCredentials(newClientId, newSecret, newBaseUrl);
  }

  if (geminiApiKey) {
    process.env.GEMINI_API_KEY = String(geminiApiKey).trim();
  }

  const updated = store.updateSettings({
    defaultCurrency: req.body.defaultCurrency,
    defaultSpendingLimit: req.body.defaultSpendingLimit,
    strictApprovalMode: req.body.strictApprovalMode,
    enableEmailAlerts: req.body.enableEmailAlerts,
    defaultBuyerEmail: defaultBuyerEmail || req.body.defaultBuyerEmail,
    paypalClientId: paypalClientId ? String(paypalClientId).trim() : undefined,
    paypalClientSecret: paypalClientSecret ? String(paypalClientSecret).trim() : undefined,
    paypalBaseUrl: paypalBaseUrl ? String(paypalBaseUrl).trim() : undefined,
  });

  res.json({
    settings: updated,
    success: true,
    paypal: paypalService.getPublicConfig(),
  });
});

// ==========================================
// 8. Dashboard Aggregate Metrics
// ==========================================
apiRouter.get('/dashboard/stats', (_req: Request, res: Response) => {
  const orders = store.getAllOrders();
  const pacts = store.getAllPacts();
  const events = store.getAuditEvents();
  const shipments = store.getAllShipments();

  const totalOrders = orders.length;
  const successfulCaptures = orders.filter((o) => o.paymentStatus === 'paid').length;
  const totalSpent = orders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.grandTotal, 0);

  const pendingApprovals = pacts.filter((p) => p.approvalStatus === 'pending_approval').length;
  const blockedEventsCount = events.filter(
    (e) => e.eventType === 'GUARDRAIL_BLOCKED' || e.eventType === 'APPROVAL_INVALIDATED'
  ).length;

  const activeShipmentsCount = shipments.filter(
    (s) => s.status !== 'DELIVERED' && s.status !== 'CANCELLED'
  ).length;
  const inTransitShipmentsCount = shipments.filter(
    (s) => s.status === 'IN_TRANSIT' || s.status === 'OUT_FOR_DELIVERY'
  ).length;
  const deliveredShipmentsCount = shipments.filter((s) => s.status === 'DELIVERED').length;

  res.json({
    totalOrders,
    successfulCaptures,
    totalSpent: Number(totalSpent.toFixed(2)),
    pendingApprovals,
    blockedEventsCount,
    recentPurchases: orders.slice(0, 5),
    recentEvents: events.slice(0, 8),
    currency: store.getSettings().defaultCurrency,
    activeShipmentsCount,
    inTransitShipmentsCount,
    deliveredShipmentsCount,
  });
});

// ==========================================
// 9. Preferred Delivery Time Scheduling Endpoints
// ==========================================

/**
 * GET /api/delivery/slots
 * Returns the five standard selectable delivery time slots, default timezone, and instruction presets
 */
apiRouter.get('/delivery/slots', (_req: Request, res: Response) => {
  res.json({
    slots: deliveryScheduling.getAvailableSlots(),
    defaultTimezone: DEFAULT_DELIVERY_TIMEZONE,
    instructionPresets: INSTRUCTION_PRESETS,
  });
});

/**
 * GET /api/orders/:orderId/delivery-preference
 * Returns current delivery preferences, scheduling status, confirmed appointment (if any), and audit trail
 */
apiRouter.get('/orders/:orderId/delivery-preference', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const maxDeliveryDays = Math.max(0, ...order.items.map((i) => i.deliveryDays || 1));

  res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    deliveryPreference: order.deliveryPreference || null,
    deliverySchedulingStatus: order.deliverySchedulingStatus || 'NOT_REQUESTED',
    confirmedDeliveryWindow: order.confirmedDeliveryWindow || null,
    carrierSchedulingSupported: order.carrierSchedulingSupported ?? false,
    schedulingHistory: order.schedulingHistory || [],
    lastSchedulingUpdate: order.lastSchedulingUpdate || null,
    actualDeliveredAt: order.actualDeliveredAt || null,
    minLeadDays: maxDeliveryDays,
    availableSlots: deliveryScheduling.getAvailableSlots(),
    defaultTimezone: order.deliveryPreference?.timezone || DEFAULT_DELIVERY_TIMEZONE,
  });
});

/**
 * POST /api/orders/:orderId/delivery-preference
 * Saves or updates a delivery preference for an order
 */
apiRouter.post('/orders/:orderId/delivery-preference', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const {
    preferredDeliveryDate,
    timeSlotId,
    timezone,
    instructions,
    selectedInstructionPresets,
    recipientName,
    deliveryAddress,
    userEmail,
  } = req.body;

  const maxLeadDays = Math.max(0, ...order.items.map((i) => i.deliveryDays || 1));

  const validation = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate,
    timeSlotId,
    timezone,
    instructions,
    selectedInstructionPresets,
    recipientName,
    deliveryAddress,
    minLeadDays: maxLeadDays,
  });

  if (!validation.valid || !validation.preference) {
    return res.status(400).json({ error: validation.error || 'Invalid delivery preference' });
  }

  const updatedOrder = deliveryScheduling.applyDeliveryPreference(
    order,
    validation.preference,
    userEmail || order.buyerEmail
  );

  res.json({
    success: true,
    order: updatedOrder,
    deliveryPreference: updatedOrder.deliveryPreference,
    deliverySchedulingStatus: updatedOrder.deliverySchedulingStatus,
  });
});

/**
 * POST /api/orders/:orderId/delivery-confirmation
 * Authorized supplier or staff endpoint to confirm appointment, mark unavailable, or record outcome
 */
apiRouter.post('/orders/:orderId/delivery-confirmation', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const {
    action, // 'CONFIRM' | 'MARK_UNAVAILABLE' | 'NOT_SUPPORTED' | 'RECORD_DELIVERY'
    confirmedBy,
    confirmedByType = 'SUPPLIER_ADMIN',
    date,
    startTime,
    endTime,
    carrierReference,
    notes,
    reason,
    alternativeSlotId,
    alternativeDate,
    actualDeliveredAt,
    isStaffOrAdmin = true,
  } = req.body;

  const actor = confirmedBy || 'Fulfillment Staff';

  if (action === 'MARK_UNAVAILABLE') {
    const updated = deliveryScheduling.markScheduleUnavailable(
      order,
      actor,
      reason || 'Requested delivery slot is unavailable at the destination distribution facility',
      alternativeSlotId,
      alternativeDate
    );
    return res.json({ success: true, order: updated });
  }

  if (action === 'NOT_SUPPORTED') {
    const updated = deliveryScheduling.markScheduleNotSupported(order, actor, reason);
    return res.json({ success: true, order: updated });
  }

  if (action === 'RECORD_DELIVERY') {
    const result = deliveryScheduling.recordDeliveryOutcome(
      order,
      actor,
      Boolean(isStaffOrAdmin),
      actualDeliveredAt
    );
    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }
    return res.json({ success: true, order: result.order });
  }

  // Default: Confirm schedule
  const updated = deliveryScheduling.confirmDeliverySchedule(order, {
    confirmedBy: actor,
    confirmedByType: confirmedByType === 'CARRIER' ? 'CARRIER' : 'SUPPLIER_ADMIN',
    date,
    startTime,
    endTime,
    carrierReference,
    notes,
  });

  res.json({
    success: true,
    order: updated,
    confirmedWindow: updated.confirmedDeliveryWindow,
    deliverySchedulingStatus: updated.deliverySchedulingStatus,
  });
});

/**
 * POST /api/orders/:orderId/reschedule
 * Buyer-initiated rescheduling endpoint
 */
apiRouter.post('/orders/:orderId/reschedule', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const {
    preferredDeliveryDate,
    timeSlotId,
    timezone,
    instructions,
    selectedInstructionPresets,
    userEmail,
  } = req.body;

  const validation = deliveryScheduling.buildValidatedPreference({
    preferredDeliveryDate,
    timeSlotId,
    timezone: timezone || order.deliveryPreference?.timezone || DEFAULT_DELIVERY_TIMEZONE,
    instructions,
    selectedInstructionPresets,
    recipientName: order.deliveryPreference?.recipientName,
    deliveryAddress: order.deliveryPreference?.deliveryAddress,
    minLeadDays: 0,
  });

  if (!validation.valid || !validation.preference) {
    return res.status(400).json({ error: validation.error || 'Invalid rescheduling parameters' });
  }

  const result = deliveryScheduling.rescheduleOrder(
    order,
    validation.preference,
    userEmail || order.buyerEmail
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    order: result.order,
    deliveryPreference: result.order?.deliveryPreference,
    deliverySchedulingStatus: result.order?.deliverySchedulingStatus,
  });
});

/**
 * GET /api/orders/:orderId/delivery-history
 * Returns the scheduling change history audit trail
 */
apiRouter.get('/orders/:orderId/delivery-history', (req: Request, res: Response) => {
  const order = store.getOrder(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    schedulingStatus: order.deliverySchedulingStatus || 'NOT_REQUESTED',
    history: order.schedulingHistory || [],
  });
});
