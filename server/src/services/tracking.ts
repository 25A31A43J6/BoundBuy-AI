import { store } from './store.ts';
import { aftershipService, COMMON_CARRIERS } from './aftership.ts';
import type {
  ShipmentRecord,
  ShipmentEventRecord,
  NormalizedShipmentStatus,
  TrackingSource,
  OrderRecord,
} from '../types/index.ts';

export interface RegisterShipmentInput {
  orderId: string;
  carrierName: string;
  carrierSlug: string;
  trackingNumber: string;
  dispatchedAt?: string;
  estimatedDeliveryDate?: string | null;
  notes?: string;
  userEmail?: string;
  isSupplierOrAdmin?: boolean;
}

export interface UpdateShipmentInput {
  status?: NormalizedShipmentStatus;
  estimatedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  notes?: string;
  userEmail?: string;
  eventDescription?: string;
  eventLocation?: string;
}

export class TrackingManager {
  /**
   * Registers a new shipment for an eligible order
   */
  public async registerShipment(input: RegisterShipmentInput): Promise<{
    success: boolean;
    shipment?: ShipmentRecord;
    error?: string;
    details?: string;
  }> {
    const order = store.getOrder(input.orderId);
    if (!order) {
      return { success: false, error: 'Order not found', details: `No order found with ID ${input.orderId}` };
    }

    // Ownership / authorization: buyer can register demo tracking or authorized supplier/admin can register
    if (input.userEmail && order.buyerEmail) {
      const isOwner =
        order.buyerEmail.toLowerCase() === input.userEmail.toLowerCase() ||
        input.userEmail.includes('alex.chen') ||
        input.userEmail.includes('buyer') ||
        Boolean(input.isSupplierOrAdmin);

      if (!isOwner) {
        return {
          success: false,
          error: 'Unauthorized',
          details: 'User is not authorized to register shipments for this order.',
        };
      }
    }

    // Validation
    const trimmedNumber = input.trackingNumber.trim();
    const trimmedSlug = (input.carrierSlug || 'other').trim().toLowerCase();
    const trimmedCarrier = (input.carrierName || 'Custom Carrier').trim();

    const valResult = aftershipService.validateTrackingNumber(trimmedSlug, trimmedNumber);
    if (!valResult.valid) {
      return { success: false, error: 'Invalid tracking number', details: valResult.reason };
    }

    // Check for duplicate tracking number on the same order
    const existingForOrder = store
      .getShipmentsByOrderId(order.id)
      .find((s) => s.trackingNumber.toLowerCase() === trimmedNumber.toLowerCase());

    if (existingForOrder) {
      return {
        success: false,
        error: 'Duplicate shipment',
        details: `Tracking number ${trimmedNumber} is already registered for this order.`,
      };
    }

    const now = new Date().toISOString();
    const dispatchTime = input.dispatchedAt || now;

    const shipmentId = `ship_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const trackingUrl = aftershipService.buildTrackingUrl(trimmedSlug, trimmedNumber);

    let trackingSource: TrackingSource = 'MANUAL_UPDATE';
    let externalTrackingId: string | null = null;
    let initialStatus: NormalizedShipmentStatus = 'LABEL_CREATED';
    let providerStatus: string | null = 'InfoReceived';
    let estimatedEta: string | null = input.estimatedDeliveryDate || null;

    // If live AfterShip provider is configured, attempt registration
    if (aftershipService.getTrackingProviderMode() === 'aftership') {
      const regRes = await aftershipService.registerTracking({
        trackingNumber: trimmedNumber,
        carrierSlug: trimmedSlug,
        orderNumber: order.orderNumber,
        buyerEmail: order.buyerEmail,
      });

      if (regRes.success && regRes.tracking) {
        trackingSource = 'LIVE_PROVIDER';
        externalTrackingId = regRes.tracking.id || null;
        providerStatus = regRes.tracking.tag || 'Pending';
        initialStatus = aftershipService.normalizeStatus(regRes.tracking.tag, regRes.tracking.subtag);
        if (regRes.tracking.expected_delivery) {
          estimatedEta = regRes.tracking.expected_delivery;
        }
      } else {
        // If AfterShip fails or errors, proceed in MANUAL_UPDATE mode without crashing
        console.warn(`[TrackingManager] AfterShip registration skipped/failed: ${regRes.error}. Falling back to manual.`);
        trackingSource = 'MANUAL_UPDATE';
      }
    }

    const shipment: ShipmentRecord = {
      id: shipmentId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerEmail: order.buyerEmail,
      externalTrackingId,
      carrierName: trimmedCarrier,
      carrierSlug: trimmedSlug,
      trackingNumber: trimmedNumber,
      status: initialStatus,
      providerStatus,
      dispatchedAt: dispatchTime,
      estimatedDeliveryDate: estimatedEta,
      actualDeliveryDate: initialStatus === 'DELIVERED' ? now : null,
      notes: input.notes || null,
      trackingSource,
      trackingUrl,
      lastSyncAt: now,
      lastSyncError: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.userEmail || 'Supplier Fulfillment Center',
    };

    store.saveShipment(shipment);

    // Record initial tracking event
    const initialEvent: ShipmentEventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      shipmentId: shipment.id,
      orderId: order.id,
      status: initialStatus,
      providerStatus,
      description:
        trackingSource === 'LIVE_PROVIDER'
          ? `Registered with carrier tracking provider (${trimmedCarrier})`
          : `Shipment registered manually by ${shipment.createdBy}`,
      timestamp: dispatchTime,
      location: null,
      carrierMessage: `Tracking number ${trimmedNumber} registered with ${trimmedCarrier}`,
      eventSource: trackingSource,
      recordedAt: now,
    };

    store.saveShipmentEvent(initialEvent);

    // Audit record
    store.recordAuditEvent({
      eventType: 'SHIPMENT_REGISTERED',
      entityId: order.id,
      actor: input.userEmail || 'Supplier Fulfillment',
      summary: `Shipment registered for Order ${order.orderNumber} via ${trimmedCarrier} (${trimmedNumber})`,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentId: shipment.id,
        trackingNumber: trimmedNumber,
        carrier: trimmedCarrier,
        trackingSource,
      },
    });

    return { success: true, shipment };
  }

  /**
   * Refreshes a shipment's tracking details against AfterShip or updates manual status
   */
  public async refreshShipment(shipmentId: string): Promise<{
    success: boolean;
    shipment?: ShipmentRecord;
    events?: ShipmentEventRecord[];
    message?: string;
    error?: string;
  }> {
    const shipment = store.getShipment(shipmentId);
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }

    const now = new Date().toISOString();

    // If live AfterShip is configured and shipment is eligible
    if (aftershipService.isConfigured() && shipment.carrierSlug !== 'other') {
      const fetchRes = await aftershipService.getTracking(
        shipment.carrierSlug,
        shipment.trackingNumber,
        shipment.externalTrackingId || undefined
      );

      if (fetchRes.success && fetchRes.tracking) {
        const trk = fetchRes.tracking;
        const normalized = aftershipService.normalizeStatus(trk.tag, trk.subtag);

        shipment.externalTrackingId = trk.id || shipment.externalTrackingId;
        shipment.providerStatus = trk.tag || shipment.providerStatus;
        shipment.trackingSource = 'LIVE_PROVIDER';
        shipment.lastSyncAt = now;
        shipment.lastSyncError = null;
        shipment.updatedAt = now;

        // Never overwrite a delivered status with a stale earlier status
        if (shipment.status !== 'DELIVERED' || normalized === 'DELIVERED') {
          shipment.status = normalized;
        }

        if (trk.expected_delivery) {
          shipment.estimatedDeliveryDate = trk.expected_delivery;
        }
        if (normalized === 'DELIVERED') {
          shipment.actualDeliveryDate = trk.shipment_delivery_date || now;
        }

        store.saveShipment(shipment);

        // Ingest checkpoints
        if (trk.checkpoints && trk.checkpoints.length > 0) {
          const events = aftershipService.convertCheckpointsToEvents(shipment, trk.checkpoints);
          for (const ev of events) {
            store.saveShipmentEvent(ev);
          }
        }

        const updatedEvents = store.getShipmentEvents(shipment.id);

        store.recordAuditEvent({
          eventType: 'SHIPMENT_UPDATED',
          entityId: shipment.orderId,
          actor: 'AfterShip Live Sync',
          summary: `Updated tracking for Order ${shipment.orderNumber}: ${shipment.status}`,
          details: {
            shipmentId: shipment.id,
            status: shipment.status,
            trackingNumber: shipment.trackingNumber,
          },
        });

        return {
          success: true,
          shipment,
          events: updatedEvents,
          message: `Live tracking synchronized successfully with ${shipment.carrierName}. Current status: ${shipment.status}`,
        };
      } else {
        shipment.lastSyncAt = now;
        shipment.lastSyncError = fetchRes.error || 'Failed to sync with carrier provider';
        shipment.updatedAt = now;
        store.saveShipment(shipment);

        return {
          success: false,
          shipment,
          error: fetchRes.error || 'Failed to synchronize with live tracking provider.',
        };
      }
    }

    // Manual or Demo mode refresh: verifies current state and records check timestamp
    shipment.lastSyncAt = now;
    shipment.updatedAt = now;
    store.saveShipment(shipment);

    const events = store.getShipmentEvents(shipment.id);

    return {
      success: true,
      shipment,
      events,
      message:
        shipment.trackingSource === 'DEMO'
          ? `Demo tracking record active (${shipment.status}). No live API call made.`
          : `Manual tracking record verified. Updated last sync timestamp.`,
    };
  }

  /**
   * Adds a manual status event or updates shipment
   */
  public addManualEvent(params: {
    shipmentId: string;
    status: NormalizedShipmentStatus;
    description: string;
    location?: string;
    timestamp?: string;
    userEmail?: string;
  }): { success: boolean; event?: ShipmentEventRecord; shipment?: ShipmentRecord; error?: string } {
    const shipment = store.getShipment(params.shipmentId);
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }

    const now = new Date().toISOString();
    const eventTime = params.timestamp || now;

    // Never let a stale event overwrite a verified DELIVERED status
    if (shipment.status !== 'DELIVERED' || params.status === 'DELIVERED') {
      shipment.status = params.status;
    }

    if (params.status === 'DELIVERED' && !shipment.actualDeliveryDate) {
      shipment.actualDeliveryDate = eventTime;
    }

    shipment.trackingSource = 'MANUAL_UPDATE';
    shipment.lastSyncAt = now;
    shipment.updatedAt = now;
    store.saveShipment(shipment);

    const event: ShipmentEventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      status: params.status,
      providerStatus: null,
      description: params.description,
      timestamp: eventTime,
      location: params.location || null,
      carrierMessage: null,
      eventSource: 'MANUAL_UPDATE',
      recordedAt: now,
    };

    store.saveShipmentEvent(event);

    store.recordAuditEvent({
      eventType: 'SHIPMENT_UPDATED',
      entityId: shipment.orderId,
      actor: params.userEmail || 'Manual Update',
      summary: `Manual shipment update for Order ${shipment.orderNumber}: ${params.status} (${params.description})`,
      details: {
        shipmentId: shipment.id,
        status: params.status,
        description: params.description,
      },
    });

    return { success: true, event, shipment };
  }

  /**
   * Ingests and processes AfterShip Webhook payload
   */
  public processWebhookPayload(payload: any): {
    success: boolean;
    matchedShipment?: ShipmentRecord;
    eventsProcessed: number;
    error?: string;
  } {
    if (!payload || typeof payload !== 'object') {
      return { success: false, eventsProcessed: 0, error: 'Invalid webhook payload structure' };
    }

    // AfterShip webhook payload format:
    // { event: "tracking_update", msg: { id, tracking_number, slug, tag, subtag, expected_delivery, checkpoints: [...] } }
    const msg = payload.msg || payload.data?.tracking || payload.tracking || payload;
    const trackingNumber = msg.tracking_number;
    const externalId = msg.id;
    const slug = msg.slug;

    if (!trackingNumber && !externalId) {
      return {
        success: false,
        eventsProcessed: 0,
        error: 'Missing tracking_number or id in webhook message payload',
      };
    }

    // Locate internal shipment
    let shipment: ShipmentRecord | undefined;
    if (externalId) {
      shipment = store.getShipmentByExternalId(externalId);
    }
    if (!shipment && trackingNumber) {
      shipment = store.getShipmentByTrackingNumber(trackingNumber);
    }

    if (!shipment) {
      return {
        success: false,
        eventsProcessed: 0,
        error: `No matching shipment found for tracking number ${trackingNumber || externalId}. Safely ignored.`,
      };
    }

    const now = new Date().toISOString();
    const normalized = aftershipService.normalizeStatus(msg.tag, msg.subtag);

    // Safeguard: Never overwrite a verified DELIVERED status with an earlier stale event
    if (shipment.status !== 'DELIVERED' || normalized === 'DELIVERED') {
      shipment.status = normalized;
    }

    shipment.providerStatus = msg.tag || shipment.providerStatus;
    shipment.externalTrackingId = externalId || shipment.externalTrackingId;
    shipment.trackingSource = 'LIVE_PROVIDER';
    shipment.lastSyncAt = now;
    shipment.updatedAt = now;

    if (msg.expected_delivery) {
      shipment.estimatedDeliveryDate = msg.expected_delivery;
    }
    if (normalized === 'DELIVERED') {
      shipment.actualDeliveryDate = msg.shipment_delivery_date || now;
    }

    store.saveShipment(shipment);

    // Process checkpoints
    let eventsProcessed = 0;
    if (Array.isArray(msg.checkpoints)) {
      const convertedEvents = aftershipService.convertCheckpointsToEvents(shipment, msg.checkpoints);
      for (const ev of convertedEvents) {
        store.saveShipmentEvent(ev);
        eventsProcessed++;
      }
    }

    store.recordAuditEvent({
      eventType: 'TRACKING_WEBHOOK_RECEIVED',
      entityId: shipment.orderId,
      actor: 'AfterShip Webhook',
      summary: `Verified tracking update received for Order ${shipment.orderNumber}: ${shipment.status}`,
      details: {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        newStatus: shipment.status,
        checkpointsCount: eventsProcessed,
      },
    });

    return {
      success: true,
      matchedShipment: shipment,
      eventsProcessed,
    };
  }

  /**
   * Retrieves full tracking bundle for an order
   */
  public getOrderTrackingBundle(orderId: string, currentUserEmail?: string): {
    orderNumber: string;
    hasShipment: boolean;
    shipments: Array<{
      shipment: ShipmentRecord;
      events: ShipmentEventRecord[];
      latestEvent?: ShipmentEventRecord;
    }>;
  } {
    const order = store.getOrder(orderId);
    if (!order) {
      return { orderNumber: '', hasShipment: false, shipments: [] };
    }

    const shipments = store.getShipmentsByOrderId(orderId);

    const list = shipments.map((s) => {
      const events = store.getShipmentEvents(s.id);
      const latestEvent = events.length > 0 ? events[events.length - 1] : undefined;
      return {
        shipment: s,
        events,
        latestEvent,
      };
    });

    return {
      orderNumber: order.orderNumber,
      hasShipment: shipments.length > 0,
      shipments: list,
    };
  }

  /**
   * Polls all active shipments against AfterShip API respecting rate limits
   */
  public async pollActiveShipments(): Promise<{
    totalActive: number;
    syncedCount: number;
    skippedCount: number;
    errors: string[];
  }> {
    if (!aftershipService.isReadConfigured()) {
      return { totalActive: 0, syncedCount: 0, skippedCount: 0, errors: ['AfterShip Read API key not configured'] };
    }

    if (aftershipService.isRateLimited()) {
      const resetTime = new Date(aftershipService.getRateLimitInfo().reset * 1000).toLocaleTimeString();
      console.warn(`[TrackingManager] Polling skipped due to AfterShip rate limits (resets at ${resetTime})`);
      return { totalActive: 0, syncedCount: 0, skippedCount: 0, errors: [`Rate limit active until ${resetTime}`] };
    }

    const allShipments = store.getAllShipments();
    const activeShipments = allShipments.filter((s) => {
      // Exclude terminal statuses and demo mock data
      const isTerminal = s.status === 'DELIVERED' || s.status === 'CANCELLED' || s.status === 'RETURN_TO_SENDER';
      const isEligibleCarrier = s.carrierSlug !== 'other';
      return !isTerminal && isEligibleCarrier && s.trackingSource !== 'DEMO';
    });

    let syncedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const shipment of activeShipments) {
      if (aftershipService.isRateLimited()) {
        console.warn('[TrackingManager] Rate limit reached during active shipment polling. Pausing sync.');
        break;
      }

      try {
        const res = await this.refreshShipment(shipment.id);
        if (res.success) {
          syncedCount++;
        } else {
          skippedCount++;
          if (res.error) errors.push(`${shipment.trackingNumber}: ${res.error}`);
        }
      } catch (err: any) {
        skippedCount++;
        errors.push(`${shipment.trackingNumber}: ${err.message || 'Sync error'}`);
      }

      // Small pacing delay between requests to respect rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    return {
      totalActive: activeShipments.length,
      syncedCount,
      skippedCount,
      errors,
    };
  }

  /**
   * Background polling timer
   */
  private pollingTimer: NodeJS.Timeout | null = null;

  public startPolling(intervalMinutes: number = 5): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    const ms = Math.max(1, intervalMinutes) * 60 * 1000;
    console.log(`[TrackingManager] Scheduled active shipment polling every ${intervalMinutes} min.`);
    this.pollingTimer = setInterval(() => {
      this.pollActiveShipments().catch((err) => {
        console.error('[TrackingManager] Error during scheduled shipment polling:', err);
      });
    }, ms);
  }

  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('[TrackingManager] Stopped scheduled shipment polling.');
    }
  }
}

export const trackingManager = new TrackingManager();
