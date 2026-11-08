import fs from 'fs';
import path from 'path';
import type {
  CatalogProduct,
  StructuredPurchaseIntent,
  PurchasePact,
  OrderRecord,
  AuditEvent,
  AppSettings,
  Supplier,
  ShipmentRecord,
  ShipmentEventRecord,
} from '../types/index.ts';
import { INITIAL_PRODUCTS, SUPPLIERS } from '../data/catalog.ts';
import { PRODUCT_IMAGE_REGISTRY } from '../data/productImages.ts';

export interface DataStoreState {
  products: CatalogProduct[];
  suppliers: Supplier[];
  intents: Record<string, StructuredPurchaseIntent>;
  pacts: Record<string, PurchasePact>;
  orders: Record<string, OrderRecord>;
  shipments: Record<string, ShipmentRecord>;
  shipmentEvents: Record<string, ShipmentEventRecord[]>;
  auditEvents: AuditEvent[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultCurrency: 'USD',
  defaultSpendingLimit: 250,
  strictApprovalMode: true,
  preferredCategories: ['event_supplies', 'office_stationery'],
  preferredSuppliers: ['sup_ecothread', 'sup_verdantcraft'],
  enableEmailAlerts: true,
};

class StoreService {
  private state: DataStoreState;
  private filePath: string;
  private isMongoConnected: boolean = false;
  private storageMode: 'mongodb' | 'local_persistent' = 'local_persistent';

  constructor() {
    const dataDir = path.resolve(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        console.warn('Could not create .data directory, will use in-memory store fallback', err);
      }
    }
    this.filePath = path.join(dataDir, 'boundbuy_store.json');

    this.state = {
      products: [...INITIAL_PRODUCTS],
      suppliers: [...SUPPLIERS],
      intents: {},
      pacts: {},
      orders: {},
      shipments: {},
      shipmentEvents: {},
      auditEvents: [],
      settings: { ...DEFAULT_SETTINGS },
    };

    this.initStore();
  }

  private initStore() {
    // Check if MongoDB URI is configured
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoUri.trim().length > 0) {
      console.log('[Store] MONGODB_URI configured. Operating in resilient local persistent storage mode (.data/boundbuy_store.json).');
    }
    this.storageMode = 'local_persistent';
    this.isMongoConnected = false;

    // Always load existing persisted state from disk
    this.loadFromFile();

    // Idempotently ensure all baseline and expanded catalog products/suppliers are seeded
    this.seedCatalog(false);

    // Ensure sample orders and audit events exist for hackathon demo if completely fresh
    if (Object.keys(this.state.orders).length === 0) {
      this.seedDemoData();
    } else if (
      this.state.orders['ord_demo_sample_01'] &&
      Object.keys(this.state.shipments).length === 0
    ) {
      this.seedDemoShipmentData();
    }
  }

  private loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.products && parsed.products.length > 0) {
          this.state.products = parsed.products;
        }
        if (parsed.suppliers && parsed.suppliers.length > 0) {
          this.state.suppliers = parsed.suppliers;
        }
        this.state.intents = parsed.intents || {};
        this.state.pacts = parsed.pacts || {};
        this.state.orders = parsed.orders || {};
        this.state.shipments = parsed.shipments || {};
        this.state.shipmentEvents = parsed.shipmentEvents || {};
        this.state.auditEvents = parsed.auditEvents || [];
        this.state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
        console.log(`[Store] Loaded persisted local store from ${this.filePath}`);
      } else {
        this.persist();
      }
    } catch (err) {
      console.error('[Store] Failed to read store file, reinitializing', err);
      this.persist();
    }
  }

  public persist() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Store] Error persisting state to file', err);
    }
  }

  public getStorageInfo() {
    return {
      storageMode: this.storageMode,
      isMongoConfigured: Boolean(process.env.MONGODB_URI),
      isMongoConnected: false,
      storePath: this.filePath,
      ordersCount: Object.keys(this.state.orders).length,
      pactsCount: Object.keys(this.state.pacts).length,
      productsCount: this.state.products.length,
      shipmentsCount: Object.keys(this.state.shipments).length,
    };
  }

  // --- Products & Suppliers ---
  public getProducts(): CatalogProduct[] {
    return this.state.products;
  }

  public getProductById(id: string): CatalogProduct | undefined {
    if (id === 'prod_notebook_spiral_recycled') {
      return this.state.products.find((p) => p.id === 'prod_notebook_recycled_a5');
    }
    return this.state.products.find((p) => p.id === id);
  }

  public updateProduct(product: CatalogProduct): void {
    const idx = this.state.products.findIndex((p) => p.id === product.id);
    if (idx >= 0) {
      this.state.products[idx] = product;
    } else {
      this.state.products.push(product);
    }
    this.persist();
  }

  public getSuppliers(): Supplier[] {
    return this.state.suppliers;
  }

  public seedCatalog(forceBaselineReset = false): {
    addedProducts: number;
    addedSuppliers: number;
    totalProducts: number;
    totalSuppliers: number;
  } {
    let addedProducts = 0;
    let addedSuppliers = 0;

    if (forceBaselineReset) {
      this.state.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
      this.state.suppliers = JSON.parse(JSON.stringify(SUPPLIERS));
      this.persist();
      return {
        addedProducts: INITIAL_PRODUCTS.length,
        addedSuppliers: SUPPLIERS.length,
        totalProducts: this.state.products.length,
        totalSuppliers: this.state.suppliers.length,
      };
    }

    // Idempotent product addition: preserve all existing, add missing by ID
    for (const product of INITIAL_PRODUCTS) {
      const exists = this.state.products.some((p) => p.id === product.id);
      if (!exists) {
        this.state.products.push({ ...product });
        addedProducts++;
      }
    }

    // Idempotent supplier addition: preserve all existing, add missing by ID
    for (const supplier of SUPPLIERS) {
      const exists = this.state.suppliers.some((s) => s.id === supplier.id);
      if (!exists) {
        this.state.suppliers.push({ ...supplier });
        addedSuppliers++;
      }
    }

    // Ensure all products have their verified unique, distinct image URL from registry
    let updatedImages = 0;
    for (const product of this.state.products) {
      const reg = PRODUCT_IMAGE_REGISTRY[product.id];
      if (reg && product.imageUrl !== reg.url) {
        product.imageUrl = reg.url;
        updatedImages++;
      }
    }

    if (addedProducts > 0 || addedSuppliers > 0 || updatedImages > 0) {
      this.persist();
      console.log(
        `[Store] Seeded ${addedProducts} new products, ${addedSuppliers} new suppliers, updated ${updatedImages} product images. Total: ${this.state.products.length} products, ${this.state.suppliers.length} suppliers.`
      );
    }

    return {
      addedProducts,
      addedSuppliers,
      totalProducts: this.state.products.length,
      totalSuppliers: this.state.suppliers.length,
    };
  }

  public resetCatalogToDefault(): void {
    this.seedCatalog(true);
  }

  // --- Intents ---
  public saveIntent(intent: StructuredPurchaseIntent): void {
    this.state.intents[intent.id] = intent;
    this.persist();
  }

  public getIntent(id: string): StructuredPurchaseIntent | undefined {
    return this.state.intents[id];
  }

  // --- Purchase Pacts ---
  public savePact(pact: PurchasePact): void {
    this.state.pacts[pact.id] = pact;
    this.persist();
  }

  public getPact(id: string): PurchasePact | undefined {
    return this.state.pacts[id];
  }

  public getAllPacts(): PurchasePact[] {
    return Object.values(this.state.pacts).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // --- Orders ---
  public saveOrder(order: OrderRecord): void {
    this.state.orders[order.id] = order;
    this.persist();
  }

  public getOrder(id: string): OrderRecord | undefined {
    return this.state.orders[id];
  }

  public getOrderByPayPalId(paypalOrderId: string): OrderRecord | undefined {
    return Object.values(this.state.orders).find(
      (o) => o.paypalOrderId === paypalOrderId
    );
  }

  public getAllOrders(): OrderRecord[] {
    return Object.values(this.state.orders).sort(
      (a, b) =>
        new Date(b.transactionTimestamp).getTime() -
        new Date(a.transactionTimestamp).getTime()
    );
  }

  // --- Shipments & Tracking ---
  public saveShipment(shipment: ShipmentRecord): void {
    this.state.shipments[shipment.id] = shipment;
    this.persist();
  }

  public getShipment(id: string): ShipmentRecord | undefined {
    return this.state.shipments[id];
  }

  public getShipmentsByOrderId(orderId: string): ShipmentRecord[] {
    return Object.values(this.state.shipments)
      .filter((s) => s.orderId === orderId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getShipmentByTrackingNumber(trackingNumber: string): ShipmentRecord | undefined {
    return Object.values(this.state.shipments).find(
      (s) => s.trackingNumber.trim().toLowerCase() === trackingNumber.trim().toLowerCase()
    );
  }

  public getShipmentByExternalId(externalId: string): ShipmentRecord | undefined {
    return Object.values(this.state.shipments).find((s) => s.externalTrackingId === externalId);
  }

  public getAllShipments(): ShipmentRecord[] {
    return Object.values(this.state.shipments).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public deleteShipment(id: string): boolean {
    if (this.state.shipments[id]) {
      delete this.state.shipments[id];
      delete this.state.shipmentEvents[id];
      this.persist();
      return true;
    }
    return false;
  }

  // --- Shipment Events ---
  public saveShipmentEvent(event: ShipmentEventRecord): void {
    if (!this.state.shipmentEvents[event.shipmentId]) {
      this.state.shipmentEvents[event.shipmentId] = [];
    }
    const events = this.state.shipmentEvents[event.shipmentId];
    // Idempotency: prevent duplicates by providerEventId or exact timestamp+status+description
    const isDuplicate = events.some((e) => {
      if (event.providerEventId && e.providerEventId === event.providerEventId) return true;
      return (
        e.timestamp === event.timestamp &&
        e.status === event.status &&
        e.description === event.description
      );
    });

    if (!isDuplicate) {
      events.push(event);
      // Sort chronologically ascending
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      this.persist();
    }
  }

  public getShipmentEvents(shipmentId: string): ShipmentEventRecord[] {
    const list = this.state.shipmentEvents[shipmentId] || [];
    return [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public getEventsByOrderId(orderId: string): ShipmentEventRecord[] {
    const shipments = this.getShipmentsByOrderId(orderId);
    const allEvents: ShipmentEventRecord[] = [];
    for (const ship of shipments) {
      allEvents.push(...(this.state.shipmentEvents[ship.id] || []));
    }
    return allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // --- Audit Events ---
  public recordAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const auditEvent: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.state.auditEvents.unshift(auditEvent);
    // Keep max 500 audit events
    if (this.state.auditEvents.length > 500) {
      this.state.auditEvents = this.state.auditEvents.slice(0, 500);
    }
    this.persist();
    return auditEvent;
  }

  public getAuditEvents(entityId?: string): AuditEvent[] {
    if (!entityId) {
      return this.state.auditEvents;
    }
    return this.state.auditEvents.filter(
      (e) => e.entityId === entityId || (e.details && e.details.orderId === entityId)
    );
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.state.settings;
  }

  public updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.persist();
    return this.state.settings;
  }

  // --- Demo Seeding ---
  private seedDemoData() {
    const now = new Date();
    const demoTimestamp1 = new Date(now.getTime() - 1000 * 60 * 60 * 36).toISOString();
    const demoTimestamp2 = new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString();

    const sampleOrder1: OrderRecord = {
      id: 'ord_demo_sample_01',
      orderNumber: 'BB-2026-0814',
      pactId: 'pact_demo_sample_01',
      intentId: 'intent_demo_sample_01',
      buyerEmail: 'alex.buyer@stanford.edu',
      items: [
        {
          productId: 'prod_tote_canvas_premium',
          productName: 'Heavyweight Organic Cotton Tote Bag (10oz)',
          supplierId: 'sup_ecothread',
          supplierName: 'EcoThread Goods Co.',
          unitPrice: 1.65,
          quantity: 25,
          itemTotal: 41.25,
          shippingRate: 4.50,
          deliveryDays: 2,
        },
        {
          productId: 'prod_notebook_recycled_a5',
          productName: 'Verdant A5 Recycled Hardcover Notebook',
          supplierId: 'sup_verdantcraft',
          supplierName: 'Verdant Craft & Paper',
          unitPrice: 1.85,
          quantity: 15,
          itemTotal: 27.75,
          shippingRate: 4.00,
          deliveryDays: 3,
        },
      ],
      subtotal: 69.00,
      shippingCost: 8.50,
      estimatedTax: 0.00,
      grandTotal: 77.50,
      currency: 'USD',
      snapshotHashAtCheckout: 'a9e20cb860f4e4604b7bc5a1bece49efda65db72e51921f0ce516eef246cfbf9',
      paymentProvider: 'paypal_sandbox',
      paypalOrderId: '8W192847AK901234F',
      paypalCaptureId: '4CP82910TY1847290',
      paymentStatus: 'paid',
      businessStatus: 'confirmed',
      transactionTimestamp: demoTimestamp1,
      approvalTimestamp: new Date(new Date(demoTimestamp1).getTime() - 1000 * 60 * 5).toISOString(),
      sandboxMode: true,
    };

    this.state.orders[sampleOrder1.id] = sampleOrder1;

    this.recordAuditEvent({
      eventType: 'PAYPAL_PAYMENT_CAPTURED',
      entityId: sampleOrder1.id,
      actor: 'alex.buyer@stanford.edu',
      summary: 'Verified PayPal Sandbox payment captured for Order BB-2026-0814 ($77.50 USD)',
      details: {
        orderNumber: 'BB-2026-0814',
        paypalOrderId: '8W192847AK901234F',
        captureId: '4CP82910TY1847290',
        amount: 77.50,
        currency: 'USD',
        isSampleData: true,
      },
      snapshotHash: sampleOrder1.snapshotHashAtCheckout,
    });

    this.recordAuditEvent({
      eventType: 'GUARDRAIL_BLOCKED',
      entityId: 'pact_sample_blocked_02',
      actor: 'BoundBuy Policy Engine',
      summary: 'Checkout blocked: Supplier Apex Commercial increased price from $1.15 to $2.40, exceeding authorized budget limit',
      details: {
        authorizedBudget: 50.00,
        newCalculatedTotal: 62.50,
        violatedRule: 'RULE_BUDGET_CEILING',
        actionTaken: 'Approval invalidated. Re-approval required from buyer before PayPal order creation.',
      },
      snapshotHash: '8b7d41a7e2894560123abc456def789',
    });

    this.seedDemoShipmentData();
    this.persist();
  }

  public seedDemoShipmentData() {
    const sampleOrder1 = this.state.orders['ord_demo_sample_01'];
    if (!sampleOrder1) return;

    const now = new Date();
    const demoTimestamp2 = new Date(now.getTime() - 1000 * 60 * 60 * 18).toISOString();

    const sampleShipment1: ShipmentRecord = {
      id: 'ship_demo_sample_01',
      orderId: sampleOrder1.id,
      orderNumber: sampleOrder1.orderNumber,
      buyerEmail: sampleOrder1.buyerEmail,
      externalTrackingId: 'ext_aftership_demo_01',
      carrierName: 'USPS',
      carrierSlug: 'usps',
      trackingNumber: '9400111899562537624108',
      status: 'IN_TRANSIT',
      providerStatus: 'InTransit',
      dispatchedAt: demoTimestamp2,
      estimatedDeliveryDate: new Date(now.getTime() + 1000 * 60 * 60 * 36).toISOString(),
      actualDeliveryDate: null,
      notes: 'Dispatched via USPS Priority Mail with tracking verification.',
      trackingSource: 'DEMO',
      trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562537624108',
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
      createdAt: demoTimestamp2,
      updatedAt: new Date().toISOString(),
      createdBy: 'EcoThread Shipping Desk',
    };

    this.state.shipments[sampleShipment1.id] = sampleShipment1;

    const event1: ShipmentEventRecord = {
      id: 'evt_demo_01',
      shipmentId: sampleShipment1.id,
      orderId: sampleOrder1.id,
      providerEventId: 'cp_demo_01',
      status: 'LABEL_CREATED',
      providerStatus: 'InfoReceived',
      description: 'Shipping label created, carrier awaiting package',
      timestamp: new Date(new Date(demoTimestamp2).getTime() - 1000 * 60 * 60 * 4).toISOString(),
      location: 'Austin, TX 78701, US',
      carrierMessage: 'Pre-shipment electronic info received by USPS',
      eventSource: 'DEMO',
      recordedAt: demoTimestamp2,
    };

    const event2: ShipmentEventRecord = {
      id: 'evt_demo_02',
      shipmentId: sampleShipment1.id,
      orderId: sampleOrder1.id,
      providerEventId: 'cp_demo_02',
      status: 'INFORMATION_RECEIVED',
      providerStatus: 'InTransit',
      description: 'Accepted at USPS Origin Facility',
      timestamp: demoTimestamp2,
      location: 'Austin, TX 78701, US',
      carrierMessage: 'Package accepted at carrier sorting facility',
      eventSource: 'DEMO',
      recordedAt: demoTimestamp2,
    };

    const event3: ShipmentEventRecord = {
      id: 'evt_demo_03',
      shipmentId: sampleShipment1.id,
      orderId: sampleOrder1.id,
      providerEventId: 'cp_demo_03',
      status: 'IN_TRANSIT',
      providerStatus: 'InTransit',
      description: 'Departed Regional Distribution Center',
      timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 3).toISOString(),
      location: 'San Jose, CA 95101, US',
      carrierMessage: 'In transit to local destination delivery office',
      eventSource: 'DEMO',
      recordedAt: new Date().toISOString(),
    };

    this.saveShipmentEvent(event1);
    this.saveShipmentEvent(event2);
    this.saveShipmentEvent(event3);
    this.persist();
  }
}

export const store = new StoreService();
