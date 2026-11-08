export interface Supplier {
  id: string;
  name: string;
  location: string;
  rating: number;
  deliverySpeedDays: number;
  sustainabilityRating: 'A+' | 'A' | 'B' | 'C';
  description: string;
}

export type ProductCategory =
  | 'event_supplies'
  | 'office_stationery'
  | 'college_education'
  | 'eco_friendly'
  | 'technology_workspace'
  | 'shipping_packaging'
  | 'workplace_cleaning'
  | 'storage_organization'
  | 'safety_accessories'
  | 'hospitality_breakroom'
  | (string & {});

export interface CatalogProduct {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  unitOfSale?: 'each' | 'pack' | 'box' | 'set' | 'roll' | 'bundle' | string;
  minOrderQuantity?: number;
  description: string;
  unitPrice: number;
  currency: string;
  stockQuantity: number;
  shippingFlatRate: number;
  estimatedDeliveryDays: number;
  imageUrl: string;
  attributes: {
    material?: string;
    ecoFriendly?: boolean;
    dimensions?: string;
    packQuantity?: number;
    color?: string;
    certifications?: string[];
    [key: string]: any;
  };
  sampleData: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StructuredPurchaseIntent {
  id: string;
  rawPrompt: string;
  purchaseGoal: string;
  budgetLimit: number;
  currency: string;
  categories: string[];
  requiredItems: {
    categoryOrName: string;
    quantity: number;
    mandatoryAttributes: string[];
  }[];
  optionalPreferences: string[];
  shippingDeadlineDays: number | null;
  shippingDeadlineDate?: string | null;
  allowSubstitutions: boolean;
  missingInformation: string[];
  clarificationQuestions: string[];
  isClarificationNeeded: boolean;
  isFallbackGenerated?: boolean;
  fallbackReason?: string;
  createdAt: string;
}

export interface PolicyRuleEvaluation {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

export interface PactItem {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  quantity: number;
  itemTotal: number;
  shippingRate: number;
  deliveryDays: number;
}

export interface PurchasePact {
  id: string;
  intentId: string;
  buyerEmail: string;
  items: PactItem[];
  subtotal: number;
  shippingCost: number;
  estimatedTax: number;
  grandTotal: number;
  currency: string;
  maxBudget: number;
  shippingDeadlineDays: number | null;
  allowSubstitutions: boolean;
  ruleEvaluations: PolicyRuleEvaluation[];
  isCompliant: boolean;
  approvalStatus: 'pending_approval' | 'approved' | 'invalidated_by_changes' | 'rejected';
  canonicalSnapshotHash: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  invalidationReason: string | null;
  lastValidatedAt: string;
  createdAt: string;
}

export type DeliveryTimeSlotId =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night';

export type DeliverySchedulingStatus =
  | 'NOT_REQUESTED'
  | 'REQUESTED'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'UNAVAILABLE'
  | 'NOT_SUPPORTED'
  | 'RESCHEDULE_REQUIRED'
  | 'COMPLETED';

export interface DeliveryAddress {
  recipientName?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface DeliveryPreference {
  preferredDeliveryDate: string; // YYYY-MM-DD
  timeSlotId: DeliveryTimeSlotId;
  timeSlotLabel: string;
  startTime: string; // "06:00"
  endTime: string;   // "08:00"
  timezone: string;  // e.g. "Asia/Kolkata"
  instructions?: string;
  selectedInstructionPresets?: string[];
  recipientName?: string;
  deliveryAddress?: DeliveryAddress;
}

export interface DeliveryConfirmationWindow {
  date: string;
  startTime: string;
  endTime: string;
  confirmedBy: string;
  confirmedByType: 'CARRIER' | 'SUPPLIER_ADMIN';
  confirmedAt: string;
  carrierReference?: string | null;
  notes?: string;
}

export interface SchedulingHistoryEntry {
  id: string;
  status: DeliverySchedulingStatus;
  timestamp: string;
  actor: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  pactId: string;
  intentId: string;
  buyerEmail: string;
  items: PactItem[];
  subtotal: number;
  shippingCost: number;
  estimatedTax: number;
  grandTotal: number;
  currency: string;
  snapshotHashAtCheckout: string;
  paymentProvider: 'paypal_sandbox';
  paypalOrderId: string;
  paypalCaptureId: string;
  paymentStatus: 'paid' | 'pending' | 'pending_approval' | 'approved' | 'capture_pending' | 'failed' | 'cancelled';
  businessStatus: 'confirmed' | 'processing' | 'procured' | 'delivered' | 'blocked';
  transactionTimestamp: string;
  approvalTimestamp: string;
  sandboxMode: boolean;
  deliveryPreference?: DeliveryPreference;
  deliverySchedulingStatus?: DeliverySchedulingStatus;
  confirmedDeliveryWindow?: DeliveryConfirmationWindow | null;
  carrierSchedulingSupported?: boolean;
  schedulingHistory?: SchedulingHistoryEntry[];
  lastSchedulingUpdate?: string;
  actualDeliveredAt?: string | null;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  entityId: string;
  actor: string;
  summary: string;
  details?: Record<string, unknown>;
  snapshotHash?: string;
}

export interface AppConfig {
  appName: string;
  defaultCurrency: string;
  defaultSpendingLimit: number;
  storageMode: string;
  isMongoConfigured: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
  paypal: {
    isConfigured: boolean;
    clientId: string | null;
    baseUrl: string;
    mode: string;
  };
  tracking: {
    provider: 'manual' | 'aftership';
    isLiveConfigured: boolean;
    mode: string;
  };
}

export interface DashboardStats {
  totalOrders: number;
  successfulCaptures: number;
  totalSpent: number;
  pendingApprovals: number;
  blockedEventsCount: number;
  recentPurchases: OrderRecord[];
  recentEvents: AuditEvent[];
  currency: string;
  activeShipmentsCount?: number;
  inTransitShipmentsCount?: number;
  deliveredShipmentsCount?: number;
}

export interface SanitizedPayPalError {
  name: string;
  message: string;
  debugId?: string | null;
  issue?: string | null;
  statusCode?: number;
}

export interface PayPalDiagnosticsData {
  sdkVersion: string;
  sdkLoaded: boolean;
  sdkLoadingStatus: 'initial' | 'pending' | 'resolved' | 'rejected';
  environment: 'sandbox' | 'production';
  clientIdConfigured: boolean;
  clientIdPreview?: string;
  oauthAuthStatus: 'not_tested' | 'authenticated' | 'failed' | 'testing';
  oauthAuthMessage?: string;
  createOrderHttpStatus: number | null;
  createOrderStatus: string | null;
  paypalOrderId: string | null;
  hasApproveLink: boolean;
  approveLinkHostname: string | null;
  approveUrl: string | null;
  sanitizedError: SanitizedPayPalError | null;
  buyerApprovalFired: boolean;
  buyerApprovalTimestamp: string | null;
  captureInvoked: boolean;
  captureHttpStatus: number | null;
  captureId: string | null;
}

// ==========================================
// BoundBuy Procurement Intelligence Engine Types
// ==========================================

export type RecommendationStrategy =
  | 'best_match'
  | 'lowest_cost'
  | 'quality_first'
  | 'fastest_delivery';

export interface ScoredProductRecommendation {
  product: CatalogProduct;
  quantity: number;
  lineTotal: number;
  matchScore: number;
  strategyRank: number;
  highlightBadges: string[];
  whyRecommended: string;
  tradeOffs: string;
  sourceData: {
    stockAvailable: number;
    estimatedDeliveryDays: number;
    supplierRating: number;
    sustainabilityRating: string;
    certifications: string[];
  };
}

export interface MultiStrategyRecommendationOutput {
  strategy: RecommendationStrategy;
  executiveSummary: string;
  recommendations: {
    productId: string;
    whyRecommended: string;
    tradeOffs: string;
    highlightBadges: string[];
  }[];
  alternativeTradeOffs: string;
  budgetUtilization: string;
}

export interface RecommendationResponse {
  strategy: RecommendationStrategy;
  scoredItems: ScoredProductRecommendation[];
  explanation: MultiStrategyRecommendationOutput;
  totals: {
    subtotal: number;
    shipping: number;
    grandTotal: number;
    withinBudget: boolean;
  };
}

export interface WhatIfScenarioInput {
  scenarioType:
    | 'PRICE_INCREASE'
    | 'OUT_OF_STOCK'
    | 'QUANTITY_CHANGE'
    | 'SHIPPING_HIKE'
    | 'EXPEDITED_DELIVERY'
    | 'ALTERNATIVE_SUPPLIER'
    | 'BUDGET_TIGHTENING';
  targetProductId?: string;
  percentageChange?: number;
  newQuantity?: number;
  shippingSurcharge?: number;
  budgetCap?: number;
  alternativeProductId?: string;
}

export interface WhatIfSimulationResult {
  isSimulation: true;
  scenarioType: string;
  scenarioDescription: string;
  originalSubtotal: number;
  originalShipping: number;
  originalGrandTotal: number;
  simulatedSubtotal: number;
  simulatedShipping: number;
  simulatedGrandTotal: number;
  budgetDifference: number;
  budgetLimit: number;
  budgetRemainingOrExcess: number;
  isOverBudget: boolean;
  affectedRequirements: string[];
  ineligibleProducts: { productId: string; name: string; reason: string }[];
  eligibleAlternatives: { productId: string; name: string; unitPrice: number; supplierName: string }[];
  pactApprovalImpact: 'INVALIDATED' | 'PRESERVED';
  approvalInvalidationReason: string | null;
  aiExplanation: string;
  suggestedAction: string;
}

export interface RiskFlag {
  id: string;
  category:
    | 'PRICE_ANOMALY'
    | 'INVENTORY_SHORTAGE'
    | 'DELIVERY_CONFLICT'
    | 'POLICY_VIOLATION'
    | 'INTEGRITY_TAMPER'
    | 'SUPPLIER_RISK';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  isBlocker: boolean;
  title: string;
  evidence: string;
  explanation: string;
  recommendedAction: string;
}

export interface RiskAnalysisResult {
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  hardBlockersCount: number;
  warningsCount: number;
  canProceedToCheckout: boolean;
  flags: RiskFlag[];
  executiveSummary: string;
  evaluatedAt: string;
}

export interface AssistantGroundedRecord {
  type: 'order' | 'pact' | 'audit' | 'catalog';
  id: string;
  title: string;
  summary: string;
}

export interface AssistantResponse {
  answer: string;
  groundedRecords: AssistantGroundedRecord[];
}

export interface ProcurementInsights {
  totalOrders: number;
  totalSpend: number;
  currency: string;
  estimatedSavings: number;
  blockedAttemptsCount: number;
  complianceRate: number;
  activeEngineModel: string;
  status: string;
  features: { id: string; name: string; status: string }[];
}

export type NormalizedShipmentStatus =
  | 'NOT_SHIPPED'
  | 'LABEL_CREATED'
  | 'INFORMATION_RECEIVED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'AVAILABLE_FOR_PICKUP'
  | 'DELIVERED'
  | 'DELIVERY_EXCEPTION'
  | 'FAILED_DELIVERY_ATTEMPT'
  | 'RETURN_TO_SENDER'
  | 'CANCELLED'
  | 'UNKNOWN';

export type TrackingSource = 'LIVE_PROVIDER' | 'MANUAL_UPDATE' | 'DEMO';

export interface ShipmentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  externalTrackingId?: string | null;
  carrierName: string;
  carrierSlug: string;
  trackingNumber: string;
  status: NormalizedShipmentStatus;
  providerStatus?: string | null;
  dispatchedAt?: string | null;
  estimatedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  notes?: string | null;
  trackingSource: TrackingSource;
  trackingUrl?: string | null;
  lastSyncAt: string;
  lastSyncError?: string | null;
  deliveryPreference?: DeliveryPreference;
  deliverySchedulingStatus?: DeliverySchedulingStatus;
  confirmedDeliveryWindow?: DeliveryConfirmationWindow | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ShipmentEventRecord {
  id: string;
  shipmentId: string;
  orderId: string;
  providerEventId?: string | null;
  status: NormalizedShipmentStatus;
  providerStatus?: string | null;
  description: string;
  timestamp: string;
  location?: string | null;
  carrierMessage?: string | null;
  eventSource: TrackingSource;
  recordedAt: string;
}

export interface DeliveryIntelligenceResult {
  answer: string;
  shipmentSummary: {
    status: NormalizedShipmentStatus;
    carrierName: string;
    trackingNumber: string;
    trackingSource?: TrackingSource;
    trackingSourceLabel?: string;
    latestEvent?: string;
    latestEventTime?: string;
    estimatedDeliveryDate?: string | null;
    isDelayed?: boolean;
    delayReason?: string;
  };
  recommendedNextSteps: string[];
  groundedEventsCount: number;
}

