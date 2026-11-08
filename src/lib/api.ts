import {
  AppConfig,
  CatalogProduct,
  DashboardStats,
  OrderRecord,
  PurchasePact,
  StructuredPurchaseIntent,
  Supplier,
  AuditEvent,
  RecommendationStrategy,
  RecommendationResponse,
  WhatIfScenarioInput,
  WhatIfSimulationResult,
  RiskAnalysisResult,
  AssistantResponse,
  ProcurementInsights,
  ShipmentRecord,
  ShipmentEventRecord,
  NormalizedShipmentStatus,
  DeliveryIntelligenceResult,
  DeliveryPreference,
  DeliverySchedulingStatus,
  DeliveryConfirmationWindow,
  SchedulingHistoryEntry,
  DeliveryTimeSlotId,
} from './types.ts';

const API_BASE = '/api';

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('Failed to load application config');
  return res.json();
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to load dashboard metrics');
  return res.json();
}

export interface CatalogQueryParams {
  category?: string;
  subcategory?: string;
  search?: string;
  supplierId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'stock_desc' | 'delivery_asc';
  page?: number;
  limit?: number;
}

export interface CatalogResponse {
  products: CatalogProduct[];
  suppliers: Supplier[];
  total: number;
  totalInCatalog: number;
  page: number;
  limit: number;
  totalPages: number;
  categoryCounts?: Record<string, number>;
  priceBounds?: { min: number; max: number };
}

export async function fetchCatalog(params?: CatalogQueryParams): Promise<CatalogResponse> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== 'all') query.set('category', params.category);
  if (params?.subcategory && params.subcategory !== 'all') query.set('subcategory', params.subcategory);
  if (params?.search) query.set('search', params.search);
  if (params?.supplierId && params.supplierId !== 'all') query.set('supplierId', params.supplierId);
  if (params?.minPrice !== undefined) query.set('minPrice', String(params.minPrice));
  if (params?.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));
  if (params?.inStockOnly) query.set('inStockOnly', 'true');
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.limit !== undefined) query.set('limit', String(params.limit));

  const res = await fetch(`${API_BASE}/catalog?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load product catalog');
  return res.json();
}

export async function seedCatalog(): Promise<{
  success: boolean;
  addedProducts: number;
  addedSuppliers: number;
  totalProducts: number;
  totalSuppliers: number;
}> {
  const res = await fetch(`${API_BASE}/catalog/seed`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to seed catalog');
  return res.json();
}

export async function resetCatalog(): Promise<void> {
  const res = await fetch(`${API_BASE}/catalog/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset catalog');
}

export async function parseIntent(
  prompt: string,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  signal?: AbortSignal,
  correlationId?: string
): Promise<{
  intent: StructuredPurchaseIntent;
  correlationId?: string;
  timings?: {
    intentParsingDurationMs: number;
    totalDurationMs: number;
  };
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (correlationId) {
    headers['x-correlation-id'] = correlationId;
  }
  const res = await fetch(`${API_BASE}/intent/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, conversationHistory }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Intent parsing failed' }));
    throw new Error(err.error || 'Failed to parse purchase intent with AI');
  }
  return res.json();
}

export async function updateIntent(
  intentId: string,
  updated: Partial<StructuredPurchaseIntent>
): Promise<{ intent: StructuredPurchaseIntent }> {
  const res = await fetch(`${API_BASE}/intents/${intentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to update purchase intent');
  return res.json();
}

export async function getRecommendations(
  intentId: string,
  signal?: AbortSignal,
  correlationId?: string
): Promise<{
  intent: StructuredPurchaseIntent;
  candidates: { product: CatalogProduct; quantity: number; lineTotal: number }[];
  aiExplanation: {
    executiveSummary: string;
    productExplanations: {
      productId: string;
      whyRecommended: string;
      comparisonWithAlternatives: string;
      tradeOffsOrNotes: string;
    }[];
    budgetAnalysis: string;
  } | null;
  allAvailableProducts: CatalogProduct[];
  correlationId?: string;
  timings?: {
    catalogLookupDurationMs: number;
    aiRecommendationDurationMs: number;
    totalDurationMs: number;
  };
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (correlationId) {
    headers['x-correlation-id'] = correlationId;
  }
  const res = await fetch(`${API_BASE}/intents/${intentId}/recommend`, {
    method: 'POST',
    headers,
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Recommendation failed' }));
    throw new Error(err.error || 'Failed to generate recommendations');
  }
  return res.json();
}

export async function createPurchasePact(payload: {
  intentId?: string;
  items: { productId: string; quantity: number }[];
  maxBudget: number;
  shippingDeadlineDays?: number | null;
  allowSubstitutions?: boolean;
}): Promise<{ pact: PurchasePact }> {
  const res = await fetch(`${API_BASE}/pacts/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Pact creation failed' }));
    throw new Error(err.error || 'Failed to create Purchase Pact');
  }
  return res.json();
}

export async function getPact(pactId: string): Promise<{ pact: PurchasePact }> {
  const res = await fetch(`${API_BASE}/pacts/${pactId}`);
  if (!res.ok) throw new Error('Purchase pact not found');
  return res.json();
}

export async function approvePact(
  pactId: string,
  buyerEmail?: string
): Promise<{
  success: boolean;
  pact: PurchasePact;
  snapshotHash: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/pacts/${pactId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyerEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Approval rejected' }));
    throw new Error(err.error || err.details || 'Failed to approve Purchase Pact');
  }
  return res.json();
}

export async function revalidatePact(
  pactId: string
): Promise<{
  pact: PurchasePact;
  isStillValid: boolean;
  invalidationReason: string | null;
}> {
  const res = await fetch(`${API_BASE}/pacts/${pactId}/revalidate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to revalidate pact');
  return res.json();
}

export async function simulatePriceChange(
  pactId: string,
  multiplier = 1.35
): Promise<{
  success: boolean;
  message: string;
  pact: PurchasePact;
  previousGrandTotal: number;
  newGrandTotal: number;
  affectedProduct: CatalogProduct;
}> {
  const res = await fetch(`${API_BASE}/pacts/${pactId}/simulate-price-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ multiplier }),
  });
  if (!res.ok) throw new Error('Price simulation failed');
  return res.json();
}

export async function createPayPalOrder(
  pactId: string,
  simulate?: boolean,
  deliveryPreference?: DeliveryPreference
): Promise<{
  paypalOrderId: string;
  orderNumber: string;
  status: string;
  isSimulation?: boolean;
  links: { rel: string; href: string }[];
  approveUrl?: string | null;
}> {
  const res = await fetch(`${API_BASE}/paypal/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pactId, simulate, deliveryPreference }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Order creation failed' }));
    const errorObj = new Error(err.error || 'Failed to create PayPal Sandbox order');
    (errorObj as any).status = res.status;
    (errorObj as any).errorName = err.errorName || 'ORDER_CREATION_FAILED';
    (errorObj as any).issue = err.issue || err.error;
    (errorObj as any).debugId = err.debugId || null;
    throw errorObj;
  }
  return res.json();
}

export async function capturePayPalOrder(
  paypalOrderId: string,
  pactId: string,
  isSimulation?: boolean,
  deliveryPreference?: DeliveryPreference
): Promise<{
  success: boolean;
  order: OrderRecord;
  captureDetails: Record<string, unknown>;
}> {
  const res = await fetch(`${API_BASE}/paypal/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pactId, isSimulation, deliveryPreference }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Capture failed' }));
    const errorObj = new Error(err.error || err.message || 'Failed to capture PayPal payment');
    (errorObj as any).status = res.status;
    (errorObj as any).errorName = err.errorName || 'CAPTURE_FAILED';
    (errorObj as any).issue = err.issue || err.error;
    (errorObj as any).debugId = err.debugId || null;
    throw errorObj;
  }
  return res.json();
}

export async function cancelPayPalOrder(
  paypalOrderId: string,
  pactId?: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/paypal/orders/${paypalOrderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pactId }),
  });
  if (!res.ok) throw new Error('Failed to cancel PayPal order');
  return res.json();
}

export async function checkPayPalOrderStatus(
  paypalOrderId: string
): Promise<{ paypalOrderId: string; status: string }> {
  const res = await fetch(`${API_BASE}/paypal/orders/${paypalOrderId}/status`);
  if (!res.ok) throw new Error('Failed to fetch PayPal order status');
  return res.json();
}

export async function approveSimulatedPayPalOrder(
  paypalOrderId: string
): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/paypal/orders/${paypalOrderId}/approve-simulated`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to approve simulated order');
  return res.json();
}

export async function verifyPayPalCredentials(): Promise<{
  success: boolean;
  message: string;
  error?: string;
  errorName?: string;
  issue?: string;
  debugId?: string;
}> {
  const res = await fetch(`${API_BASE}/paypal/verify-credentials`, {
    method: 'POST',
  });
  return res.json();
}

export async function fetchOrders(): Promise<{ orders: OrderRecord[]; total: number }> {
  const res = await fetch(`${API_BASE}/orders`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchOrderDetails(
  orderId: string
): Promise<{ order: OrderRecord; events: AuditEvent[] }> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`);
  if (!res.ok) throw new Error('Failed to load order details');
  return res.json();
}

export async function fetchOrderReceipt(orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/receipt`);
  if (!res.ok) throw new Error('Failed to load receipt');
  return res.json();
}

export async function fetchAuditEvents(limit = 100): Promise<{ events: AuditEvent[] }> {
  const res = await fetch(`${API_BASE}/events?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load audit events');
  return res.json();
}

export async function fetchSettings(): Promise<{ settings: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function saveSettings(
  settings: Record<string, unknown>
): Promise<{
  settings: Record<string, unknown>;
  success: boolean;
  paypal?: {
    isConfigured: boolean;
    clientId: string | null;
    baseUrl: string;
    mode: 'sandbox' | 'live';
  };
}> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

// ==========================================
// BoundBuy Procurement Intelligence API Functions
// ==========================================

export async function fetchAiHealth(): Promise<{
  status: string;
  engine: string;
  tagline: string;
  model: string;
  geminiConfigured: boolean;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/ai/health`);
  if (!res.ok) throw new Error('Failed to check AI health');
  return res.json();
}

export async function fetchProcurementInsights(): Promise<ProcurementInsights> {
  const res = await fetch(`${API_BASE}/ai/insights`);
  if (!res.ok) throw new Error('Failed to fetch procurement insights');
  return res.json();
}

export async function planPurchaseWithAi(
  prompt: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ intent: StructuredPurchaseIntent; plan: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, conversationHistory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to plan purchase with AI');
  }
  return res.json();
}

export async function clarifyPurchaseWithAi(
  prompt: string,
  intentId?: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ intent: StructuredPurchaseIntent; plan: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/ai/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, intentId, conversationHistory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to clarify purchase requirements');
  }
  return res.json();
}

export async function fetchMultiStrategyRecommendations(
  intent: StructuredPurchaseIntent,
  strategy: RecommendationStrategy = 'best_match'
): Promise<RecommendationResponse> {
  const res = await fetch(`${API_BASE}/ai/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, strategy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch recommendations');
  }
  return res.json();
}

export async function runWhatIfSimulation(
  scenario: WhatIfScenarioInput,
  items: { productId: string; quantity: number }[],
  budgetLimit: number,
  pactId?: string
): Promise<{ simulation: WhatIfSimulationResult }> {
  const res = await fetch(`${API_BASE}/ai/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, items, budgetLimit, pactId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to run what-if simulation');
  }
  return res.json();
}

export async function reviewPurchaseRisks(
  items: { productId: string; quantity: number }[],
  budgetLimit: number,
  deadlineDays?: number | null,
  pactId?: string
): Promise<{ riskAnalysis: RiskAnalysisResult }> {
  const res = await fetch(`${API_BASE}/ai/risk-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, budgetLimit, deadlineDays, pactId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to evaluate purchase risks');
  }
  return res.json();
}

export async function askPostPurchaseAssistant(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  userEmail?: string
): Promise<AssistantResponse> {
  const res = await fetch(`${API_BASE}/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, userEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to consult post-purchase assistant');
  }
  return res.json();
}

// ==========================================
// BoundBuy Track — Shipment Tracking API
// ==========================================

export interface OrderTrackingBundle {
  orderNumber: string;
  hasShipment: boolean;
  shipments: Array<{
    shipment: ShipmentRecord;
    events: ShipmentEventRecord[];
    latestEvent?: ShipmentEventRecord;
  }>;
}

export interface SupportedCarrier {
  name: string;
  slug: string;
  website: string;
}

export async function fetchSupportedCarriers(): Promise<SupportedCarrier[]> {
  const res = await fetch(`${API_BASE}/carriers`);
  if (!res.ok) throw new Error('Failed to load supported carriers');
  const data = await res.json();
  return data.carriers || [];
}

export async function fetchOrderTracking(
  orderId: string,
  userEmail?: string
): Promise<OrderTrackingBundle> {
  const url = userEmail
    ? `${API_BASE}/orders/${orderId}/tracking?userEmail=${encodeURIComponent(userEmail)}`
    : `${API_BASE}/orders/${orderId}/tracking`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to load order tracking');
  }
  return res.json();
}

export async function registerShipment(
  orderId: string,
  data: {
    carrierName: string;
    carrierSlug: string;
    trackingNumber: string;
    dispatchedAt?: string;
    estimatedDeliveryDate?: string | null;
    notes?: string;
    userEmail?: string;
  }
): Promise<{ success: boolean; shipment: ShipmentRecord }> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details || err.error || 'Failed to register shipment');
  }
  return res.json();
}

export async function refreshShipmentTracking(
  shipmentId: string
): Promise<{ success: boolean; shipment: ShipmentRecord; events: ShipmentEventRecord[]; message?: string }> {
  const res = await fetch(`${API_BASE}/shipments/${shipmentId}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to refresh tracking');
  }
  return res.json();
}

export async function addManualShipmentEvent(
  shipmentId: string,
  data: {
    status: NormalizedShipmentStatus;
    description: string;
    location?: string;
    timestamp?: string;
    userEmail?: string;
  }
): Promise<{ success: boolean; event: ShipmentEventRecord; shipment: ShipmentRecord }> {
  const res = await fetch(`${API_BASE}/shipments/${shipmentId}/manual-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to record shipment event');
  }
  return res.json();
}

export async function queryDeliveryIntelligence(
  orderId: string,
  question: string,
  userEmail?: string
): Promise<DeliveryIntelligenceResult> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/delivery-intelligence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, userEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to query delivery intelligence');
  }
  return res.json();
}

export interface DeliverySlotOption {
  id: DeliveryTimeSlotId;
  label: string;
  timeRange: string;
  startTime: string;
  endTime: string;
  description: string;
}

export async function fetchDeliverySlots(): Promise<{
  slots: DeliverySlotOption[];
  defaultTimezone: string;
  instructionPresets: string[];
}> {
  const res = await fetch(`${API_BASE}/delivery/slots`);
  if (!res.ok) throw new Error('Failed to fetch delivery slots');
  return res.json();
}

export async function fetchOrderDeliveryPreference(orderId: string): Promise<{
  orderId: string;
  orderNumber: string;
  deliveryPreference: DeliveryPreference | null;
  deliverySchedulingStatus: DeliverySchedulingStatus;
  confirmedDeliveryWindow: DeliveryConfirmationWindow | null;
  carrierSchedulingSupported: boolean;
  schedulingHistory: SchedulingHistoryEntry[];
  lastSchedulingUpdate: string | null;
  actualDeliveredAt: string | null;
  minLeadDays: number;
  availableSlots: DeliverySlotOption[];
  defaultTimezone: string;
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/delivery-preference`);
  if (!res.ok) throw new Error('Failed to fetch order delivery preferences');
  return res.json();
}

export async function updateOrderDeliveryPreference(
  orderId: string,
  data: Partial<DeliveryPreference> & { userEmail?: string }
): Promise<{
  success: boolean;
  order: OrderRecord;
  deliveryPreference: DeliveryPreference;
  deliverySchedulingStatus: DeliverySchedulingStatus;
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/delivery-preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update delivery preference');
  }
  return res.json();
}

export async function confirmOrderDeliverySchedule(
  orderId: string,
  data: {
    action?: 'CONFIRM' | 'MARK_UNAVAILABLE' | 'NOT_SUPPORTED' | 'RECORD_DELIVERY';
    confirmedBy?: string;
    confirmedByType?: 'CARRIER' | 'SUPPLIER_ADMIN';
    date?: string;
    startTime?: string;
    endTime?: string;
    carrierReference?: string;
    notes?: string;
    reason?: string;
    alternativeSlotId?: DeliveryTimeSlotId;
    alternativeDate?: string;
    actualDeliveredAt?: string;
    isStaffOrAdmin?: boolean;
  }
): Promise<{
  success: boolean;
  order: OrderRecord;
  confirmedWindow?: DeliveryConfirmationWindow;
  deliverySchedulingStatus?: DeliverySchedulingStatus;
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/delivery-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to process delivery confirmation');
  }
  return res.json();
}

export async function rescheduleOrderDelivery(
  orderId: string,
  data: {
    preferredDeliveryDate: string;
    timeSlotId: DeliveryTimeSlotId;
    timezone?: string;
    instructions?: string;
    selectedInstructionPresets?: string[];
    userEmail?: string;
  }
): Promise<{
  success: boolean;
  order: OrderRecord;
  deliveryPreference: DeliveryPreference;
  deliverySchedulingStatus: DeliverySchedulingStatus;
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reschedule order');
  }
  return res.json();
}

export async function fetchOrderDeliveryHistory(orderId: string): Promise<{
  orderId: string;
  orderNumber: string;
  schedulingStatus: DeliverySchedulingStatus;
  history: SchedulingHistoryEntry[];
}> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/delivery-history`);
  if (!res.ok) throw new Error('Failed to fetch delivery history');
  return res.json();
}

