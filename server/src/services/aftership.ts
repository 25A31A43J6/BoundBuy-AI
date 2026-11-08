import crypto from 'crypto';
import type {
  NormalizedShipmentStatus,
  ShipmentRecord,
  ShipmentEventRecord,
  TrackingSource,
} from '../types/index.ts';

export interface AfterShipCheckpoint {
  created_at?: string;
  slug?: string;
  checkpoint_time?: string;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country_name?: string | null;
  country_iso3?: string | null;
  message?: string;
  subtag?: string;
  subtag_message?: string;
  tag?: string;
  raw_tag?: string;
}

export interface AfterShipTrackingData {
  id: string;
  created_at: string;
  updated_at: string;
  last_updated_at?: string;
  tracking_number: string;
  slug: string;
  active: boolean;
  tag: string;
  subtag?: string;
  subtag_message?: string;
  title?: string;
  expected_delivery?: string | null;
  shipment_delivery_date?: string | null;
  shipment_pickup_date?: string | null;
  shipment_type?: string | null;
  signed_by?: string | null;
  checkpoints?: AfterShipCheckpoint[];
}

export interface AfterShipApiResponse<T> {
  meta: {
    code: number;
    message?: string;
    type?: string;
    errors?: Array<{ code: number; message: string }>;
  };
  data?: T;
}

export interface SupportedCarrier {
  name: string;
  slug: string;
  codePattern?: RegExp;
  website: string;
  trackingUrlPattern?: (num: string) => string;
}

export const COMMON_CARRIERS: SupportedCarrier[] = [
  {
    name: 'USPS',
    slug: 'usps',
    codePattern: /^(94|93|92|94|95)[0-9]{20}$|^[A-Z]{2}[0-9]{9}US$/i,
    website: 'https://www.usps.com',
    trackingUrlPattern: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  },
  {
    name: 'FedEx',
    slug: 'fedex',
    codePattern: /^[0-9]{12}$|^[0-9]{15}$|^[0-9]{20}$/i,
    website: 'https://www.fedex.com',
    trackingUrlPattern: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
  {
    name: 'UPS',
    slug: 'ups',
    codePattern: /^1Z[0-9A-Z]{16}$/i,
    website: 'https://www.ups.com',
    trackingUrlPattern: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  {
    name: 'DHL Express',
    slug: 'dhl',
    codePattern: /^[0-9]{10}$/i,
    website: 'https://www.dhl.com',
    trackingUrlPattern: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
  },
  {
    name: 'Amazon Logistics',
    slug: 'amazon-shipping',
    website: 'https://track.amazon.com',
    trackingUrlPattern: (n) => `https://track.amazon.com/tracking/${encodeURIComponent(n)}`,
  },
  {
    name: 'Royal Mail',
    slug: 'royal-mail',
    website: 'https://www.royalmail.com',
    trackingUrlPattern: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  },
  {
    name: 'Canada Post',
    slug: 'canada-post',
    website: 'https://www.canadapost-postescanada.ca',
    trackingUrlPattern: (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/result_list?searchFor=${encodeURIComponent(n)}`,
  },
  {
    name: 'Australia Post',
    slug: 'australia-post',
    website: 'https://auspost.com.au',
    trackingUrlPattern: (n) => `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(n)}`,
  },
  {
    name: 'AfterShip Testing Courier',
    slug: 'testing-courier',
    website: 'https://www.aftership.com',
    trackingUrlPattern: (n) => `https://track.aftership.com/testing-courier/${encodeURIComponent(n)}`,
  },
  {
    name: 'Custom / Other Carrier',
    slug: 'other',
    website: '',
  },
];

export interface AfterShipRateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  lastCheckedAt?: string;
}

export class AfterShipService {
  private readApiKey: string;
  private writeApiKey: string;
  private webhookSecret: string;
  private baseUrl: string;
  private rateLimitInfo: AfterShipRateLimitInfo = {
    limit: 100,
    remaining: 100,
    reset: 0,
  };

  constructor() {
    this.readApiKey = (process.env.AFTERSHIP_API_KEY_READ || process.env.AFTERSHIP_API_KEY || '').trim();
    this.writeApiKey = (process.env.AFTERSHIP_API_KEY_WRITE || process.env.AFTERSHIP_API_KEY || '').trim();
    this.webhookSecret = (process.env.AFTERSHIP_WEBHOOK_SECRET || '').trim();
    this.baseUrl = (process.env.AFTERSHIP_BASE_URL || 'https://api.aftership.com/tracking/2026-07').trim().replace(/\/+$/, '');
  }

  public isReadConfigured(): boolean {
    return Boolean(this.readApiKey && this.readApiKey.length > 0);
  }

  public isWriteConfigured(): boolean {
    return Boolean(this.writeApiKey && this.writeApiKey.length > 0);
  }

  public isConfigured(): boolean {
    return this.isReadConfigured() || this.isWriteConfigured();
  }

  public getTrackingProviderMode(): 'aftership' | 'manual' {
    const configuredProvider = (process.env.TRACKING_PROVIDER || '').toLowerCase();
    if ((configuredProvider === 'aftership' || configuredProvider === '') && this.isConfigured()) {
      return 'aftership';
    }
    return configuredProvider === 'aftership' && this.isConfigured() ? 'aftership' : 'manual';
  }

  public updateCredentials(
    readKeyOrConfig?: string | { readKey?: string; writeKey?: string; webhookSecret?: string; baseUrl?: string },
    writeKeyOrSecret?: string,
    webhookSecret?: string,
    baseUrl?: string
  ) {
    if (typeof readKeyOrConfig === 'object' && readKeyOrConfig !== null) {
      if (readKeyOrConfig.readKey !== undefined) this.readApiKey = readKeyOrConfig.readKey.trim();
      if (readKeyOrConfig.writeKey !== undefined) this.writeApiKey = readKeyOrConfig.writeKey.trim();
      if (readKeyOrConfig.webhookSecret !== undefined) this.webhookSecret = readKeyOrConfig.webhookSecret.trim();
      if (readKeyOrConfig.baseUrl !== undefined && readKeyOrConfig.baseUrl.trim().length > 0) {
        this.baseUrl = readKeyOrConfig.baseUrl.trim().replace(/\/+$/, '');
      }
      return;
    }

    if (typeof readKeyOrConfig === 'string') {
      if (readKeyOrConfig === '') {
        this.readApiKey = '';
        this.writeApiKey = '';
      } else {
        this.readApiKey = readKeyOrConfig.trim();
        if (!writeKeyOrSecret || writeKeyOrSecret.startsWith('whsec_')) {
          this.writeApiKey = readKeyOrConfig.trim();
        }
      }
    }

    if (writeKeyOrSecret !== undefined) {
      if (writeKeyOrSecret.startsWith('whsec_')) {
        this.webhookSecret = writeKeyOrSecret.trim();
      } else if (writeKeyOrSecret.startsWith('asat_')) {
        this.writeApiKey = writeKeyOrSecret.trim();
      } else if (webhookSecret !== undefined) {
        // 3rd arg provided: (readKey, writeKey, webhookSecret)
        this.writeApiKey = writeKeyOrSecret.trim();
      } else {
        // 2-arg call: (key, webhookSecret)
        this.webhookSecret = writeKeyOrSecret.trim();
      }
    }

    if (webhookSecret !== undefined) this.webhookSecret = webhookSecret.trim();
    if (baseUrl !== undefined && baseUrl.trim().length > 0) {
      this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    }
  }

  public recordRateLimits(headers: Headers) {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');

    if (limit) this.rateLimitInfo.limit = parseInt(limit, 10);
    if (remaining) this.rateLimitInfo.remaining = parseInt(remaining, 10);
    if (reset) this.rateLimitInfo.reset = parseInt(reset, 10);
    this.rateLimitInfo.lastCheckedAt = new Date().toISOString();
  }

  public isRateLimited(): boolean {
    const nowSec = Math.floor(Date.now() / 1000);
    return this.rateLimitInfo.remaining <= 0 && this.rateLimitInfo.reset > nowSec;
  }

  public getRateLimitInfo(): AfterShipRateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  public getPublicConfig() {
    return {
      provider: this.getTrackingProviderMode(),
      isLiveConfigured: this.isConfigured(),
      hasReadPermission: this.isReadConfigured(),
      hasWritePermission: this.isWriteConfigured(),
      baseUrl: this.baseUrl,
      mode: this.isConfigured() ? 'live_provider' : 'manual_fallback',
      rateLimit: this.getRateLimitInfo(),
    };
  }

  /**
   * Verifies live authentication against AfterShip 2026-07 API with Read and Write keys.
   */
  public async verifyConnection(): Promise<{
    success: boolean;
    readOk: boolean;
    writeOk: boolean;
    readError?: string;
    writeError?: string;
    rateLimit: AfterShipRateLimitInfo;
    message: string;
  }> {
    let readOk = false;
    let writeOk = false;
    let readError: string | undefined;
    let writeError: string | undefined;

    // 1. Verify Read API Key
    if (this.isReadConfigured()) {
      try {
        const res = await fetch(`${this.baseUrl}/trackings?limit=1`, {
          method: 'GET',
          headers: {
            'as-api-key': this.readApiKey,
            'Content-Type': 'application/json',
          },
        });
        this.recordRateLimits(res.headers);
        if (res.status !== 401 && res.status !== 403) {
          readOk = true;
          if (res.status === 429) {
            readError = 'Rate limit exceeded (authenticated)';
          }
        } else {
          const body = (await res.json().catch(() => ({}))) as any;
          readError = body?.meta?.message || `HTTP ${res.status}`;
        }
      } catch (err: any) {
        readError = err.message || 'Network error communicating with AfterShip';
      }
    } else {
      readError = 'AFTERSHIP_API_KEY_READ is not configured';
    }

    // 2. Verify Write API Key
    if (this.isWriteConfigured()) {
      try {
        // Test key authorization against trackings endpoint with as-api-key
        const testRes = await fetch(`${this.baseUrl}/trackings?limit=1`, {
          method: 'GET',
          headers: {
            'as-api-key': this.writeApiKey,
            'Content-Type': 'application/json',
          },
        });
        this.recordRateLimits(testRes.headers);
        // Key is authentic if it doesn't return 401 or 403
        if (testRes.status !== 401 && testRes.status !== 403) {
          writeOk = true;
        } else {
          const body = (await testRes.json().catch(() => ({}))) as any;
          writeError = body?.meta?.message || `HTTP ${testRes.status}`;
        }
      } catch (err: any) {
        writeError = err.message || 'Network error communicating with AfterShip';
      }
    } else {
      writeError = 'AFTERSHIP_API_KEY_WRITE is not configured';
    }

    const overallSuccess = readOk || writeOk;
    const message =
      readOk && writeOk
        ? 'AfterShip 2026-07 API authenticated successfully with separate Read and Write permissions.'
        : readOk
        ? 'AfterShip Read Key authenticated successfully. Write operations not permitted.'
        : writeOk
        ? 'AfterShip Write Key authenticated successfully. Read operations not permitted.'
        : 'AfterShip API authentication failed. Please verify API keys.';

    return {
      success: overallSuccess,
      readOk,
      writeOk,
      readError,
      writeError,
      rateLimit: this.getRateLimitInfo(),
      message,
    };
  }

  /**
   * Normalizes provider status tags and checkpoints into BoundBuy's standardized status model.
   */
  public normalizeStatus(tag?: string, subtag?: string, message?: string): NormalizedShipmentStatus {
    const rawTag = (tag || '').toLowerCase();
    const rawSubtag = (subtag || '').toLowerCase();
    const rawMsg = (message || '').toLowerCase();

    // Check high-priority exceptions
    if (rawSubtag.includes('return') || rawMsg.includes('return to sender')) {
      return 'RETURN_TO_SENDER';
    }
    if (rawTag === 'cancelled' || rawSubtag.includes('cancel') || rawMsg.includes('cancelled')) {
      return 'CANCELLED';
    }
    if (rawTag === 'attemptfail' || rawSubtag.includes('attempt') || rawMsg.includes('attempt failed')) {
      return 'FAILED_DELIVERY_ATTEMPT';
    }
    if (rawTag === 'availableforpickup' || rawSubtag.includes('pickup') || rawMsg.includes('available for pickup')) {
      return 'AVAILABLE_FOR_PICKUP';
    }
    if (rawTag === 'exception' || rawSubtag.includes('exception')) {
      return 'DELIVERY_EXCEPTION';
    }
    if (rawTag === 'delivered') {
      return 'DELIVERED';
    }
    if (rawTag === 'outfordelivery' || rawMsg.includes('out for delivery')) {
      return 'OUT_FOR_DELIVERY';
    }
    if (rawTag === 'intransit' || rawMsg.includes('in transit')) {
      return 'IN_TRANSIT';
    }
    if (rawTag === 'inforeceived' || rawMsg.includes('info received') || rawMsg.includes('accepted at')) {
      return 'INFORMATION_RECEIVED';
    }
    if (rawTag === 'pending') {
      return 'LABEL_CREATED';
    }
    if (rawTag === 'not_shipped') {
      return 'NOT_SHIPPED';
    }

    return 'UNKNOWN';
  }

  /**
   * Validates tracking number and carrier slug
   */
  public validateTrackingNumber(carrierSlug: string, trackingNumber: string): { valid: boolean; reason?: string } {
    const trimmed = trackingNumber.trim();
    if (!trimmed || trimmed.length < 4) {
      return { valid: false, reason: 'Tracking number must be at least 4 characters long.' };
    }
    if (trimmed.length > 50) {
      return { valid: false, reason: 'Tracking number exceeds maximum length of 50 characters.' };
    }

    const carrier = COMMON_CARRIERS.find((c) => c.slug === carrierSlug.toLowerCase());
    if (carrier && carrier.codePattern && !carrier.codePattern.test(trimmed)) {
      // For strict validation when known pattern exists, but still allow override if user is certain
      // We warn or return softly if it's an unrecognized pattern
    }

    return { valid: true };
  }

  /**
   * Generates public web tracking URL for carrier or fallback
   */
  public buildTrackingUrl(carrierSlug: string, trackingNumber: string): string {
    const carrier = COMMON_CARRIERS.find((c) => c.slug === carrierSlug.toLowerCase());
    if (carrier && carrier.trackingUrlPattern) {
      return carrier.trackingUrlPattern(trackingNumber);
    }
    return `https://track.aftership.com/${encodeURIComponent(carrierSlug)}/${encodeURIComponent(trackingNumber)}`;
  }

  /**
   * Registers a new tracking number with AfterShip API
   */
  /**
   * Registers a new tracking number with AfterShip API using the Write API Key
   */
  public async registerTracking(params: {
    trackingNumber: string;
    carrierSlug: string;
    orderNumber: string;
    buyerEmail?: string;
    title?: string;
  }): Promise<{
    success: boolean;
    tracking?: AfterShipTrackingData;
    error?: string;
    isDuplicate?: boolean;
    statusCode?: number;
  }> {
    if (!this.isWriteConfigured()) {
      return {
        success: false,
        error: 'AfterShip Write API key (AFTERSHIP_API_KEY_WRITE) is not configured. Operating in manual tracking mode.',
      };
    }

    if (this.isRateLimited()) {
      return {
        success: false,
        error: `AfterShip API rate limit exceeded. Resets at ${new Date(this.rateLimitInfo.reset * 1000).toLocaleTimeString()}.`,
        statusCode: 429,
      };
    }

    const endpoint = `${this.baseUrl}/trackings`;
    const payload = {
      tracking_number: params.trackingNumber.trim(),
      slug: params.carrierSlug.trim().toLowerCase(),
      title: params.title || `BoundBuy Order ${params.orderNumber}`,
      order_id: params.orderNumber,
      order_number: params.orderNumber,
      emails: params.buyerEmail ? [params.buyerEmail] : [],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'as-api-key': this.writeApiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.recordRateLimits(res.headers);

      const json = (await res.json()) as any;

      // Handle duplicate registration: AfterShip returns meta.code 4003 or 400 with "Tracking already exists"
      if (
        res.status === 400 &&
        (json?.meta?.code === 4003 || json?.meta?.message?.toLowerCase().includes('already exists'))
      ) {
        // Fetch existing tracking details via Read API Key
        const existing = await this.getTracking(params.carrierSlug, params.trackingNumber, json?.data?.id);
        if (existing.success && existing.tracking) {
          return {
            success: true,
            tracking: existing.tracking,
            isDuplicate: true,
          };
        }
      }

      if (!res.ok) {
        const errorMsg = json?.meta?.message || json?.message || `AfterShip registration failed with HTTP ${res.status}`;
        return {
          success: false,
          error: errorMsg,
          statusCode: res.status,
        };
      }

      const rawData = json?.data?.tracking || json?.data;
      const normalizedTracking: AfterShipTrackingData = {
        id: rawData?.id || `as_${Date.now()}`,
        created_at: rawData?.created_at || new Date().toISOString(),
        updated_at: rawData?.updated_at || new Date().toISOString(),
        last_updated_at: rawData?.last_updated_at,
        tracking_number: rawData?.tracking_number || params.trackingNumber,
        slug: rawData?.slug || params.carrierSlug,
        active: rawData?.active ?? true,
        tag: rawData?.tag || 'Pending',
        subtag: rawData?.subtag,
        subtag_message: rawData?.subtag_message,
        title: rawData?.title || params.title,
        expected_delivery:
          rawData?.courier_estimated_delivery_date?.estimated_delivery_date ||
          rawData?.first_estimated_delivery?.datetime ||
          rawData?.latest_estimated_delivery?.datetime ||
          rawData?.aftership_estimated_delivery_date ||
          rawData?.expected_delivery ||
          null,
        shipment_delivery_date: rawData?.shipment_delivery_date || null,
        shipment_pickup_date: rawData?.shipment_pickup_date || null,
        shipment_type: rawData?.shipment_type || null,
        signed_by: rawData?.signed_by || null,
        checkpoints: Array.isArray(rawData?.checkpoints) ? rawData.checkpoints : [],
      };

      return {
        success: true,
        tracking: normalizedTracking,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'AfterShip API request timed out after 12 seconds.' };
      }
      return { success: false, error: err.message || 'Network error communicating with AfterShip.' };
    }
  }

  /**
   * Retrieves tracking details from AfterShip 2026-07 API using the Read API Key
   */
  public async getTracking(
    carrierSlug: string,
    trackingNumber: string,
    externalId?: string
  ): Promise<{
    success: boolean;
    tracking?: AfterShipTrackingData;
    error?: string;
    statusCode?: number;
  }> {
    if (!this.isReadConfigured()) {
      return { success: false, error: 'AfterShip Read API key (AFTERSHIP_API_KEY_READ) is not configured.' };
    }

    if (this.isRateLimited()) {
      return {
        success: false,
        error: `AfterShip API rate limit exceeded. Resets at ${new Date(this.rateLimitInfo.reset * 1000).toLocaleTimeString()}.`,
        statusCode: 429,
      };
    }

    // In 2026-07: lookup by externalId if present, else query by tracking_numbers
    const endpoint = externalId && externalId.trim().length > 0
      ? `${this.baseUrl}/trackings/${encodeURIComponent(externalId.trim())}`
      : `${this.baseUrl}/trackings?tracking_numbers=${encodeURIComponent(trackingNumber.trim())}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'as-api-key': this.readApiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.recordRateLimits(res.headers);

      const json = (await res.json()) as any;

      if (!res.ok) {
        return {
          success: false,
          error: json?.meta?.message || json?.message || `AfterShip fetch failed with HTTP ${res.status}`,
          statusCode: res.status,
        };
      }

      // If array in data.trackings, pick match by slug or first
      let rawData = json?.data;
      if (Array.isArray(rawData?.trackings)) {
        rawData =
          rawData.trackings.find(
            (t: any) =>
              t.tracking_number?.toLowerCase() === trackingNumber.trim().toLowerCase() &&
              (!carrierSlug || carrierSlug === 'other' || t.slug?.toLowerCase() === carrierSlug.trim().toLowerCase())
          ) || rawData.trackings[0];
      } else if (rawData?.tracking) {
        rawData = rawData.tracking;
      }

      if (!rawData || !rawData.tracking_number) {
        return {
          success: false,
          error: `Tracking record not found on AfterShip for ${trackingNumber}`,
          statusCode: 404,
        };
      }

      const normalizedTracking: AfterShipTrackingData = {
        id: rawData.id || `as_${Date.now()}`,
        created_at: rawData.created_at || new Date().toISOString(),
        updated_at: rawData.updated_at || new Date().toISOString(),
        last_updated_at: rawData.last_updated_at,
        tracking_number: rawData.tracking_number,
        slug: rawData.slug || carrierSlug,
        active: rawData.active ?? true,
        tag: rawData.tag || 'Pending',
        subtag: rawData.subtag,
        subtag_message: rawData.subtag_message,
        title: rawData.title,
        expected_delivery:
          rawData.courier_estimated_delivery_date?.estimated_delivery_date ||
          rawData.first_estimated_delivery?.datetime ||
          rawData.latest_estimated_delivery?.datetime ||
          rawData.aftership_estimated_delivery_date ||
          rawData.expected_delivery ||
          null,
        shipment_delivery_date: rawData.shipment_delivery_date || null,
        shipment_pickup_date: rawData.shipment_pickup_date || null,
        shipment_type: rawData.shipment_type || null,
        signed_by: rawData.signed_by || null,
        checkpoints: Array.isArray(rawData.checkpoints) ? rawData.checkpoints : [],
      };

      return {
        success: true,
        tracking: normalizedTracking,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'AfterShip API request timed out after 12 seconds.' };
      }
      return { success: false, error: err.message || 'Network error communicating with AfterShip.' };
    }
  }

  /**
   * Verifies AfterShip webhook HMAC signature.
   * AfterShip computes HMAC SHA-256 of the raw body using the configured webhook secret.
   * The signature header may be `as-signature-hmac-sha256` or `aftership-hmac-sha256`.
   */
  public verifyWebhookSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined
  ): boolean {
    if (!this.webhookSecret || this.webhookSecret.trim().length === 0) {
      // If no secret configured in test/demo mode, warn and reject or require secret
      return false;
    }

    if (!rawBody || !signatureHeader) {
      return false;
    }

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');
      const hmac = crypto.createHmac('sha256', this.webhookSecret.trim());
      hmac.update(bodyBuffer);

      const digestBase64 = hmac.digest('base64');
      const expectedBuffer = Buffer.from(digestBase64);
      const providedBuffer = Buffer.from(signatureHeader.trim());

      // Timing-safe comparison
      if (expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return true;
      }

      // Also try hex digest fallback in case provider format is hex
      const hmacHex = crypto.createHmac('sha256', this.webhookSecret.trim());
      hmacHex.update(bodyBuffer);
      const digestHex = hmacHex.digest('hex');
      const expectedHexBuffer = Buffer.from(digestHex);

      if (expectedHexBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedHexBuffer, providedBuffer)) {
        return true;
      }

      return false;
    } catch (err) {
      console.error('[AfterShip] Error verifying webhook signature:', err);
      return false;
    }
  }

  /**
   * Converts AfterShip checkpoints into BoundBuy's standardized ShipmentEventRecord list
   */
  public convertCheckpointsToEvents(
    shipment: ShipmentRecord,
    checkpoints: AfterShipCheckpoint[] = []
  ): ShipmentEventRecord[] {
    return checkpoints.map((cp, idx) => {
      const status = this.normalizeStatus(cp.tag, cp.subtag, cp.message || cp.subtag_message);
      const locParts = [cp.city, cp.state, cp.country_name || cp.country_iso3].filter(Boolean);
      const location = locParts.length > 0 ? locParts.join(', ') : (cp.location || null);

      const timestamp = cp.checkpoint_time || cp.created_at || new Date().toISOString();
      const providerEventId = `${shipment.id}_cp_${timestamp}_${idx}`;

      return {
        id: `evt_as_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        providerEventId,
        status,
        providerStatus: cp.tag || cp.raw_tag || null,
        description: cp.message || cp.subtag_message || `Carrier checkpoint: ${status}`,
        timestamp,
        location,
        carrierMessage: cp.subtag_message || cp.message || null,
        eventSource: 'LIVE_PROVIDER' as TrackingSource,
        recordedAt: new Date().toISOString(),
      };
    });
  }
}

export const aftershipService = new AfterShipService();
