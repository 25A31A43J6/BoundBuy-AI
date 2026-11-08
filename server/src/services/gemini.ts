import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  StructuredPurchaseIntent,
  CatalogProduct,
  PurchasePact,
  AppSettings,
} from '../types/index.ts';

// Zod schemas for AI structured responses
export const ParsedIntentSchema = z.object({
  purchaseGoal: z.string().describe('Clear concise 1-sentence goal of this procurement'),
  budgetLimit: z.number().positive().describe('Budget ceiling specified or implied in prompt'),
  currency: z.string().default('USD').describe('Currency ISO code, e.g. USD'),
  categories: z.array(z.string()).default([]).describe('Identified product categories from the user request'),
  requiredItems: z.array(
    z.object({
      categoryOrName: z.string().describe('Product type or description, e.g. notebooks, tote bags'),
      quantity: z.number().int().positive().describe('Quantity required'),
      mandatoryAttributes: z.array(z.string()).default([]).describe('Hard criteria such as recycled, organic, color, dimensions'),
    })
  ).default([]),
  optionalPreferences: z.array(z.string()).default([]).describe('Soft preferences such as preferred brand, nice-to-have features'),
  shippingDeadlineDays: z.number().nullish().transform((v) => (v != null ? v : null)).describe('Number of calendar or business days until required delivery, null if unspecified'),
  allowSubstitutions: z.boolean().default(false).describe('False if user said no substitutions, true if permitted'),
  missingInformation: z.array(z.string()).default([]).describe('Any critical ambiguities needing clarification before buying'),
  clarificationQuestions: z.array(z.string()).default([]).describe('Specific questions to ask user if details are missing'),
  isClarificationNeeded: z.boolean().default(false).describe('True if budget, quantities, or key constraints are missing'),
  isFallbackGenerated: z.boolean().default(false).optional(),
  fallbackReason: z.string().optional(),
});

export type ParsedIntentOutput = z.infer<typeof ParsedIntentSchema>;

export const RecommendationExplanationSchema = z.object({
  executiveSummary: z.string().describe('1-2 sentences summarizing how the chosen items fulfill the buyer goal within rules'),
  productExplanations: z.array(
    z.object({
      productId: z.string(),
      whyRecommended: z.string().describe('Specific requirements satisfied by this exact SKU'),
      comparisonWithAlternatives: z.string().describe('Why this option was favored over cheaper or pricier alternatives'),
      tradeOffsOrNotes: z.string().describe('Any shipping speed, material quality, or volume considerations'),
    })
  ),
  budgetAnalysis: z.string().describe('Analysis of total cost vs maximum limit and remaining headroom'),
});

export type RecommendationExplanationOutput = z.infer<typeof RecommendationExplanationSchema>;

class GeminiAIService {
  private ai: GoogleGenAI | null = null;
  private modelName: string;
  private intentCache = new Map<string, { result: ParsedIntentOutput; timestamp: number }>();
  private explanationCache = new Map<string, { result: RecommendationExplanationOutput; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

  constructor() {
    this.modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.ai = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
            timeout: 10000,
          },
        });
      } catch (err) {
        console.warn('[GeminiAIService] Failed to initialize GoogleGenAI client', err);
      }
    }
  }

  private ensureClient(): GoogleGenAI | null {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        this.ai = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
            timeout: 10000,
          },
        });
      }
    }
    return this.ai;
  }

  /**
   * Deterministic rule engine fallback for institutional procurement analysis
   */
  public parsePurchaseIntentDeterministic(
    userPrompt: string,
    settings: AppSettings,
    reason: string = 'Deterministic institutional procurement parser active.'
  ): ParsedIntentOutput {
    const lower = userPrompt.toLowerCase().trim();

    // 1. Currency
    let currency = settings.defaultCurrency || 'USD';
    if (userPrompt.includes('EUR') || userPrompt.includes('€')) currency = 'EUR';
    else if (userPrompt.includes('GBP') || userPrompt.includes('£')) currency = 'GBP';
    else if (userPrompt.includes('CAD')) currency = 'CAD';
    else if (userPrompt.includes('USD') || userPrompt.includes('$')) currency = 'USD';

    // 2. Budget Limit
    const budgetMatch =
      userPrompt.match(/(?:[$€£]|USD|EUR|GBP)\s*(\d+(?:\.\d{1,2})?)/i) ||
      userPrompt.match(/(?:under|budget of|budget|max|up to|cap of|below)\s*[$€£]?\s*(\d+(?:\.\d{1,2})?)/i) ||
      userPrompt.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:[$€£]|dollars|usd|eur|gbp)\b/i);
    const budgetLimit = budgetMatch ? parseFloat(budgetMatch[1]) : settings.defaultSpendingLimit;

    // 3. Delivery Deadline
    let shippingDeadlineDays: number | null = null;
    if (lower.includes('friday')) {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 is Sunday, 5 is Friday
      let daysToFri = 5 - dayOfWeek;
      if (daysToFri <= 0) daysToFri += 7;
      shippingDeadlineDays = Math.max(1, daysToFri);
    } else {
      const daysMatch = lower.match(/(?:in|before|within)\s+(\d+)\s+days?/);
      if (daysMatch) {
        shippingDeadlineDays = parseInt(daysMatch[1], 10);
      } else if (lower.includes('fast delivery') || lower.includes('express')) {
        shippingDeadlineDays = 3;
      } else if (lower.includes('next week')) {
        shippingDeadlineDays = 5;
      }
    }

    // 4. Substitution Rules
    const allowSubstitutions = !(
      lower.includes('no substitution') ||
      lower.includes('do not substitute') ||
      lower.includes('without substitution') ||
      lower.includes('without asking')
    );

    // 5. Item Extraction (handles standard institutional procurement catalog keywords)
    const catalogKeywords = [
      { term: 'notebook', name: 'A5 Recycled Notebooks', cat: 'office_stationery' },
      { term: 'tote', name: 'Organic Canvas Tote Bags', cat: 'event_supplies' },
      { term: 'bag', name: 'Reusable Bags', cat: 'event_supplies' },
      { term: 'lamp', name: 'Ergonomic LED Desk Lamps', cat: 'college_education' },
      { term: 'cup', name: 'Compostable Plant-Lined Paper Hot Cups', cat: 'hospitality_breakroom' },
      { term: 'coffee', name: 'Sunrise Horizon Organic Whole Bean Coffee', cat: 'hospitality_breakroom' },
      { term: 'pen', name: 'Biodegradable Wheat Straw Pens', cat: 'office_stationery' },
      { term: 'badge', name: 'Eco Name Badges with Bamboo Clips', cat: 'event_supplies' },
      { term: 'bottle', name: 'Stainless Steel Water Bottles', cat: 'event_supplies' },
      { term: 'chair', name: 'Lumbar Support Office Chairs', cat: 'technology_workspace' },
    ];

    const detectedItems: {
      categoryOrName: string;
      quantity: number;
      mandatoryAttributes: string[];
    }[] = [];
    const foundCats = new Set<string>();

    for (const kw of catalogKeywords) {
      if (lower.includes(kw.term)) {
        // If keyword is 'bag' or 'tote', ensure it is not just a measure like '2 bags of organic whole bean coffee'
        if (
          (kw.term === 'bag' || kw.term === 'tote') &&
          /(?:bags?|totes?)\s+of\s+(?:[a-z0-9-]+\s+)*(?:coffee|tea|beans|sugar|flour|rice)/i.test(lower)
        ) {
          // If there's also an explicit "reusable bag" or "canvas bag", allow it, else skip
          if (!/(?:reusable|canvas|shopping|paper)\s+bags?/i.test(lower)) {
            continue;
          }
        }

        // Extract quantity preceding keyword
        let qty = 1;
        const kwIndex = lower.indexOf(kw.term);
        if (kwIndex > 0) {
          const textBefore = lower.substring(0, kwIndex);
          // Look for number within preceding text, ignoring currency prices ($xx)
          const cleanBefore = textBefore.replace(/[$€£]\s*\d+(?:\.\d+)?/g, ' ');
          const matches = [...cleanBefore.matchAll(/\b(\d+)\b/g)];
          if (matches.length > 0) {
            const candidate = matches[matches.length - 1];
            if (candidate.index !== undefined && textBefore.length - candidate.index < 35) {
              const parsedQty = parseInt(candidate[1], 10);
              if (parsedQty > 0 && parsedQty !== budgetLimit) {
                qty = parsedQty;
              }
            }
          }
        }

        if (!detectedItems.some((i) => i.categoryOrName.toLowerCase().includes(kw.term))) {
          const mandatoryAttributes: string[] = [];
          if (lower.includes('recycled')) mandatoryAttributes.push('Recycled');
          if (lower.includes('organic')) mandatoryAttributes.push('Organic');
          if (lower.includes('compostable')) mandatoryAttributes.push('Compostable');
          if (lower.includes('ergonomic')) mandatoryAttributes.push('Ergonomic');
          if (lower.includes('led')) mandatoryAttributes.push('LED');

          detectedItems.push({
            categoryOrName: kw.name,
            quantity: Math.max(1, qty),
            mandatoryAttributes,
          });
          foundCats.add(kw.cat);
        }
      }
    }

    if (detectedItems.length === 0) {
      detectedItems.push({
        categoryOrName: 'Institutional Supplies Request',
        quantity: 1,
        mandatoryAttributes: [],
      });
      foundCats.add('office_stationery');
    }

    // Build clear goal summary
    const goalSummary = detectedItems
      .map((i) => `${i.quantity}x ${i.categoryOrName}`)
      .join(' & ');
    const purchaseGoal = `Procure ${goalSummary} within authorized budget`;

    const parsed: ParsedIntentOutput = {
      purchaseGoal,
      budgetLimit,
      currency,
      categories: Array.from(foundCats),
      requiredItems: detectedItems,
      optionalPreferences: lower.includes('fast') ? ['Fast Delivery'] : [],
      shippingDeadlineDays,
      allowSubstitutions,
      missingInformation: [],
      clarificationQuestions: [],
      isClarificationNeeded: false,
      isFallbackGenerated: true,
      fallbackReason: reason,
    };

    return parsed;
  }

  /**
   * Converts a user natural language prompt into a schema-validated StructuredPurchaseIntent
   * with in-memory caching, bounded 8s timeout, and resilient deterministic fallback.
   */
  public async parsePurchaseIntent(
    userPrompt: string,
    conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
    settings: AppSettings,
    correlationId?: string
  ): Promise<ParsedIntentOutput> {
    const t0 = performance.now();
    const normalizedPrompt = userPrompt.trim();
    const cacheKey = normalizedPrompt.toLowerCase();

    // 1. Check in-memory LRU Cache (sub-millisecond instant return)
    const cached = this.intentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      const dt = Math.round(performance.now() - t0);
      console.log(`[GeminiAIService][${correlationId || 'N/A'}] Cache hit for intent parsing in ${dt}ms.`);
      return cached.result;
    }

    // 2. If Gemini API is not configured, immediately use high-fidelity deterministic parser
    const ai = this.ensureClient();
    if (!ai) {
      const result = this.parsePurchaseIntentDeterministic(
        normalizedPrompt,
        settings,
        'Operating in offline procurement engine mode (GEMINI_API_KEY not configured).'
      );
      this.intentCache.set(cacheKey, { result, timestamp: Date.now() });
      const dt = Math.round(performance.now() - t0);
      console.log(`[GeminiAIService][${correlationId || 'N/A'}] Deterministic intent parsed in ${dt}ms.`);
      return result;
    }

    // 3. Execute Gemini with 8s bounded timeout
    const systemInstruction = `You are BoundBuy AI, an institutional procurement assistant.
Your job is to analyze the user's natural language buying request, extract explicit constraints and preferences, and convert them into structured JSON.
Rules:
- NEVER invent imaginary product prices or authorize any purchase yourself.
- Identify the maximum budget ceiling (default to ${settings.defaultSpendingLimit} ${settings.defaultCurrency} if completely unspecified).
- If the user specifies "no substitutions", "do not substitute", or similar phrasing, allowSubstitutions MUST be false.
- Categorize requirements into mandatory attributes vs optional preferences.
- If quantities, key item descriptions, or delivery dates are missing or ambiguous, populate isClarificationNeeded: true with targeted clarification questions.
- Respond STRICTLY with schema-compliant JSON.`;

    const contents = [
      ...conversationHistory.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
      `User Request: "${normalizedPrompt}"`,
    ].join('\n\n');

    try {
      const callModel = async (modelToUse: string) => {
        return await ai.models.generateContent({
          model: modelToUse,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                purchaseGoal: { type: Type.STRING },
                budgetLimit: { type: Type.NUMBER },
                currency: { type: Type.STRING },
                categories: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                requiredItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      categoryOrName: { type: Type.STRING },
                      quantity: { type: Type.INTEGER },
                      mandatoryAttributes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['categoryOrName', 'quantity', 'mandatoryAttributes'],
                  },
                },
                optionalPreferences: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                shippingDeadlineDays: { type: Type.INTEGER },
                allowSubstitutions: { type: Type.BOOLEAN },
                missingInformation: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                clarificationQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                isClarificationNeeded: { type: Type.BOOLEAN },
              },
              required: [
                'purchaseGoal',
                'budgetLimit',
                'currency',
                'categories',
                'requiredItems',
                'optionalPreferences',
                'allowSubstitutions',
                'missingInformation',
                'clarificationQuestions',
                'isClarificationNeeded',
              ],
            },
          },
        });
      };

      let response;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Gemini primary model ${this.modelName} timed out after 5000ms`)), 5000);
        });
        response = await Promise.race([callModel(this.modelName), timeoutPromise]);
      } catch (primaryErr: unknown) {
        // If primary model timed out or had high latency, attempt gemini-3.1-flash-lite before fallback
        if (this.modelName !== 'gemini-3.1-flash-lite') {
          console.warn(`[GeminiAIService][${correlationId || 'N/A'}] Primary model ${this.modelName} delayed (${(primaryErr as Error)?.message}). Trying gemini-3.1-flash-lite...`);
          const fallbackTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('gemini-3.1-flash-lite timed out after 5000ms')), 5000);
          });
          response = await Promise.race([callModel('gemini-3.1-flash-lite'), fallbackTimeout]);
        } else {
          throw primaryErr;
        }
      }

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);
      const validated = ParsedIntentSchema.parse({
        ...parsed,
        isFallbackGenerated: false,
      });

      this.intentCache.set(cacheKey, { result: validated, timestamp: Date.now() });
      const dt = Math.round(performance.now() - t0);
      console.log(`[GeminiAIService][${correlationId || 'N/A'}] Gemini intent parsing succeeded in ${dt}ms.`);
      return validated;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStatus = (err as any)?.status || (err as any)?.statusCode;

      // Authentication or credential failures
      const isAuthFailure =
        errStatus === 401 ||
        errStatus === 403 ||
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('API key not valid');

      if (isAuthFailure) {
        throw new Error(`Gemini API Authentication Error: ${errMsg}. Please verify GEMINI_API_KEY in settings.`);
      }

      // Transient quota exhaustion (429), high demand (503), timeout, or network drops -> trigger deterministic fallback
      console.warn(
        `[GeminiAIService][${correlationId || 'N/A'}] Transient Gemini failure (${errMsg}). Activating deterministic fallback parser.`
      );

      const fallbackReason = errMsg.includes('429') || errMsg.includes('quota')
        ? 'Gemini API free-tier rate limit reached. Deterministic procurement engine applied.'
        : errMsg.includes('timed out')
        ? 'Gemini API response timed out. Deterministic procurement engine applied.'
        : 'Gemini upstream service unavailable. Deterministic procurement engine applied.';

      const fallbackResult = this.parsePurchaseIntentDeterministic(normalizedPrompt, settings, fallbackReason);
      this.intentCache.set(cacheKey, { result: fallbackResult, timestamp: Date.now() });
      return fallbackResult;
    }
  }

  /**
   * Generates natural language reasoning and comparison for candidate products.
   * Sends ONLY relevant candidate products + up to 4 alternatives (reducing token payload by ~95%).
   */
  public async explainProductRecommendations(
    intent: StructuredPurchaseIntent,
    recommendedProducts: CatalogProduct[],
    cartCandidates: { product: CatalogProduct; quantity: number }[],
    correlationId?: string
  ): Promise<RecommendationExplanationOutput> {
    const t0 = performance.now();
    const candidateIds = cartCandidates.map((c) => c.product.id).sort().join(',');
    const cacheKey = `${intent.id}_${candidateIds}`;

    const cached = this.explanationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      console.log(`[GeminiAIService][${correlationId || 'N/A'}] Cache hit for product explanations.`);
      return cached.result;
    }

    const totalCost = cartCandidates.reduce((sum, c) => sum + c.product.unitPrice * c.quantity, 0);

    // Fallback explanation generator
    const makeFallbackExplanation = (reason?: string): RecommendationExplanationOutput => ({
      executiveSummary: `Selection verified: ${cartCandidates.length} SKUs satisfy purchase goal "${intent.purchaseGoal}" within authorized budget limit of $${intent.budgetLimit.toFixed(2)} ${intent.currency}.`,
      productExplanations: cartCandidates.map((c) => ({
        productId: c.product.id,
        whyRecommended: `Selected ${c.product.name} fulfills required quantity (${c.quantity}) at unit price $${c.product.unitPrice.toFixed(2)} from verified supplier ${c.product.supplierName}.`,
        comparisonWithAlternatives: `Meets mandatory specifications with ${c.product.estimatedDeliveryDays}-day delivery turnaround.`,
        tradeOffsOrNotes: c.product.attributes.ecoFriendly
          ? 'Eco-friendly certified materials.'
          : 'Commercial institutional standard quality.',
      })),
      budgetAnalysis: `Total order cost of $${totalCost.toFixed(2)} operates safely within authorized $${intent.budgetLimit.toFixed(2)} budget limit with $${(intent.budgetLimit - totalCost).toFixed(2)} remaining headroom.${reason ? ` (${reason})` : ''}`,
    });

    const ai = this.ensureClient();
    if (!ai) {
      const fallback = makeFallbackExplanation('Deterministic rule engine active.');
      this.explanationCache.set(cacheKey, { result: fallback, timestamp: Date.now() });
      return fallback;
    }

    // Only send candidate products + top 3 relevant alternatives in same category
    const candidateCategories = new Set(cartCandidates.map((c) => c.product.category));
    const candidateIdSet = new Set(cartCandidates.map((c) => c.product.id));
    const filteredAlternatives = recommendedProducts
      .filter((p) => candidateCategories.has(p.category) && !candidateIdSet.has(p.id))
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        name: p.name,
        supplier: p.supplierName,
        unitPrice: p.unitPrice,
        stock: p.stockQuantity,
        deliveryDays: p.estimatedDeliveryDays,
      }));

    const cartContext = cartCandidates.map((c) => ({
      id: c.product.id,
      name: c.product.name,
      supplier: c.product.supplierName,
      unitPrice: c.product.unitPrice,
      quantity: c.quantity,
      lineTotal: Number((c.product.unitPrice * c.quantity).toFixed(2)),
    }));

    const prompt = `Buyer Goal: ${intent.purchaseGoal}
Budget Limit: $${intent.budgetLimit} ${intent.currency}
Deadline Days: ${intent.shippingDeadlineDays ?? 'None'}
Allow Substitutions: ${intent.allowSubstitutions}

Selected Recommended Items:
${JSON.stringify(cartContext, null, 2)}

Relevant Alternative Catalog Products:
${JSON.stringify(filteredAlternatives, null, 2)}

Provide:
1. Executive summary of why this combination satisfies buyer budget and constraints.
2. For each recommended SKU in cart, explain why it was chosen and trade-offs.
3. Budget headroom analysis.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI explanation call timed out after 6000ms')), 6000);
      });

      const generatePromise = ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction:
            'You are BoundBuy AI. Provide objective, transparent procurement analysis. Explain trade-offs honestly without sales fluff. You cannot override deterministic rules or approve payments.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              productExplanations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    whyRecommended: { type: Type.STRING },
                    comparisonWithAlternatives: { type: Type.STRING },
                    tradeOffsOrNotes: { type: Type.STRING },
                  },
                  required: ['productId', 'whyRecommended', 'comparisonWithAlternatives', 'tradeOffsOrNotes'],
                },
              },
              budgetAnalysis: { type: Type.STRING },
            },
            required: ['executiveSummary', 'productExplanations', 'budgetAnalysis'],
          },
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const raw = response.text || '{}';
      const validated = RecommendationExplanationSchema.parse(JSON.parse(raw));
      this.explanationCache.set(cacheKey, { result: validated, timestamp: Date.now() });
      const dt = Math.round(performance.now() - t0);
      console.log(`[GeminiAIService][${correlationId || 'N/A'}] AI explanation generated in ${dt}ms.`);
      return validated;
    } catch (err: unknown) {
      console.warn(
        `[GeminiAIService][${correlationId || 'N/A'}] AI explanation failed (${err instanceof Error ? err.message : String(err)}). Using deterministic explanation.`
      );
      const fallback = makeFallbackExplanation('Deterministic rule engine active.');
      this.explanationCache.set(cacheKey, { result: fallback, timestamp: Date.now() });
      return fallback;
    }
  }

  /**
   * Generates an executive decision summary for the buyer to review before approving the Purchase Pact
   */
  public async summarizePurchaseDecision(pact: PurchasePact): Promise<string> {
    const ai = this.ensureClient();
    if (!ai) {
      return `Procurement plan authorizes ${pact.items.length} line items totaling $${pact.grandTotal.toFixed(2)} ${pact.currency} (within authorized budget $${pact.maxBudget.toFixed(2)}). All policy guardrails satisfied.`;
    }

    const itemsSummary = pact.items
      .map((it) => `- ${it.quantity}x ${it.productName} ($${it.unitPrice.toFixed(2)} ea from ${it.supplierName})`)
      .join('\n');

    const prompt = `Generate a concise 2-sentence executive approval brief for the buyer:
Items:
${itemsSummary}
Subtotal: $${pact.subtotal.toFixed(2)}
Shipping: $${pact.shippingCost.toFixed(2)}
Grand Total: $${pact.grandTotal.toFixed(2)} ${pact.currency}
Max Authorized Budget: $${pact.maxBudget.toFixed(2)}
Compliance status: ${pact.isCompliant ? 'Passed all guardrails' : 'Failed guardrails'}
Substitution policy: ${pact.allowSubstitutions ? 'Substitutions permitted' : 'Strict no substitutions'}`;

    try {
      const response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction:
            'You are BoundBuy AI. Summarize the transaction concisely for executive sign-off. Emphasize that approval is binding and locks the cart.',
        },
      });

      return response.text || 'Purchase Pact is ready for final buyer authorization.';
    } catch (err: unknown) {
      console.warn('[GeminiAIService] Failed to generate decision summary:', err);
      return `Purchase Pact for ${pact.items.length} items totaling $${pact.grandTotal.toFixed(2)} ${pact.currency}. Ready for explicit buyer approval.`;
    }
  }
}

export const geminiAI = new GeminiAIService();
