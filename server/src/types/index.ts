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

export interface PayPalCaptureDetails {
  captureId: string;
  paypalOrderId: string;
  status: string;
  amount: string;
  currency: string;
  createTime: string;
  updateTime: string;
  payerEmail?: string;
  payerName?: string;
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
  orderNumber: string; // BB-2026-XXXXX
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
  eventType:
    | 'INTENT_PARSED'
    | 'REQUIREMENTS_EDITED'
    | 'PRODUCTS_RECOMMENDED'
    | 'PACT_GENERATED'
    | 'PACT_APPROVED'
    | 'GUARDRAIL_BLOCKED'
    | 'PRICE_CHANGE_SIMULATED'
    | 'APPROVAL_INVALIDATED'
    | 'PAYPAL_ORDER_CREATED'
    | 'PAYPAL_PAYMENT_CAPTURED'
    | 'PAYPAL_PAYMENT_FAILED'
    | 'PAYPAL_PAYMENT_CANCELLED'
    | 'RECEIPT_GENERATED'
    | 'SHIPMENT_REGISTERED'
    | 'SHIPMENT_UPDATED'
    | 'TRACKING_WEBHOOK_RECEIVED'
    | 'DELIVERY_VERIFIED'
    | 'DELIVERY_PREFERENCE_SET'
    | 'DELIVERY_SCHEDULE_REQUESTED'
    | 'DELIVERY_SCHEDULE_CONFIRMED'
    | 'DELIVERY_SCHEDULE_UNAVAILABLE'
    | 'DELIVERY_RESCHEDULE_REQUESTED'
    | 'DELIVERY_NOT_SUPPORTED'
    | 'DELIVERY_OUTCOME_RECORDED';
  entityId: string;
  actor: string;
  summary: string;
  details?: Record<string, unknown>;
  snapshotHash?: string;
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

export interface AppSettings {
  defaultCurrency: string;
  defaultSpendingLimit: number;
  strictApprovalMode: boolean;
  preferredCategories: string[];
  preferredSuppliers: string[];
  enableEmailAlerts: boolean;
  defaultBuyerEmail?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
  paypalBaseUrl?: string;
  trackingProvider?: 'manual' | 'aftership';
  aftershipApiKey?: string;
  aftershipWebhookSecret?: string;
  aftershipBaseUrl?: string;
}

