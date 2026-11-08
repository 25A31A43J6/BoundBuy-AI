import type { PayPalCaptureDetails, PurchasePact } from '../types/index.ts';

interface PayPalAccessToken {
  token: string;
  expiresAt: number;
}

export interface SimulatedPayPalOrder {
  id: string;
  status: 'CREATED' | 'APPROVED' | 'COMPLETED' | 'VOIDED';
  amount: number;
  currency: string;
  pactId: string;
  orderNumber: string;
  createdTime: string;
  approvedTime?: string;
}

export class PayPalService {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private cachedToken: PayPalAccessToken | null = null;
  private simulatedOrders: Map<string, SimulatedPayPalOrder> = new Map();

  constructor() {
    // Strictly enforced Sandbox mode for hackathon demonstration - real-money payments disabled
    this.baseUrl = 'https://api-m.sandbox.paypal.com';
    this.clientId = process.env.PAYPAL_CLIENT_ID || '';
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.clientId.trim() && this.clientSecret.trim());
  }

  public updateCredentials(clientId: string, clientSecret: string, _baseUrl?: string): void {
    this.clientId = clientId.trim();
    this.clientSecret = clientSecret.trim();
    // Strictly enforce Sandbox endpoint
    this.baseUrl = 'https://api-m.sandbox.paypal.com';
    this.cachedToken = null;
  }

  public getPublicConfig() {
    return {
      isConfigured: this.isConfigured(),
      clientId: this.clientId ? this.clientId : null,
      baseUrl: this.baseUrl,
      mode: this.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
    };
  }

  public registerSimulatedOrder(order: SimulatedPayPalOrder): void {
    this.simulatedOrders.set(order.id, order);
  }

  public approveSimulatedOrder(orderId: string): boolean {
    const existing = this.simulatedOrders.get(orderId);
    if (!existing) return false;
    existing.status = 'APPROVED';
    existing.approvedTime = new Date().toISOString();
    return true;
  }

  public cancelSimulatedOrder(orderId: string): boolean {
    const existing = this.simulatedOrders.get(orderId);
    if (!existing) return false;
    existing.status = 'VOIDED';
    return true;
  }

  /**
   * Retrieves an OAuth 2.0 access token using client credentials
   */
  public async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        'PayPal Sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the environment (.env) or Settings to enable PayPal checkout.'
      );
    }

    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
      return this.cachedToken.token;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errBody);
      } catch {}
      const name = parsedErr?.error || 'OAUTH_AUTH_FAILED';
      const desc = parsedErr?.error_description || errBody;
      const err = new Error(`PayPal OAuth authentication failed (${response.status}): ${desc}`);
      (err as any).name = name;
      (err as any).statusCode = response.status;
      (err as any).issue = desc;
      throw err;
    }

    const data = await response.json();
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.cachedToken.token;
  }

  /**
   * Creates a PayPal v2 order for an approved Purchase Pact.
   * Total is verified and constructed from server-authoritative numbers.
   */
  public async createOrder(pact: PurchasePact, internalOrderNumber: string): Promise<{
    id: string;
    status: string;
    links: { rel: string; href: string }[];
    approveUrl: string | null;
  }> {
    const accessToken = await this.getAccessToken();

    // Map itemized products for PayPal checkout display
    const items = pact.items.map((it) => ({
      name: it.productName.substring(0, 127),
      quantity: it.quantity.toString(),
      unit_amount: {
        currency_code: pact.currency,
        value: it.unitPrice.toFixed(2),
      },
      sku: it.productId,
      description: `Supplied by ${it.supplierName}`.substring(0, 127),
    }));

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: pact.id,
          custom_id: JSON.stringify({
            pactId: pact.id,
            snapshotHash: pact.canonicalSnapshotHash,
            orderNumber: internalOrderNumber,
          }),
          description: `BoundBuy Authorized Order: ${internalOrderNumber}`,
          amount: {
            currency_code: pact.currency,
            value: pact.grandTotal.toFixed(2),
            breakdown: {
              item_total: {
                currency_code: pact.currency,
                value: pact.subtotal.toFixed(2),
              },
              shipping: {
                currency_code: pact.currency,
                value: pact.shippingCost.toFixed(2),
              },
              tax_total: {
                currency_code: pact.currency,
                value: pact.estimatedTax.toFixed(2),
              },
            },
          },
          items,
        },
      ],
      application_context: {
        brand_name: 'BoundBuy AI Procurement',
        landing_page: 'NO_PREFERENCE',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.APP_URL || 'http://localhost:3000'}/checkout/return`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/checkout/cancel`,
      },
    };

    const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': `bb_create_${pact.id}_${Date.now()}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errText);
      } catch {}

      const name = errorJson?.name || 'ORDER_CREATION_FAILED';
      const debugId = errorJson?.debug_id || null;
      const issue = errorJson?.details?.[0]?.issue || errorJson?.message || 'Failed to create PayPal order';
      const description = errorJson?.details?.[0]?.description || errorJson?.message || errText;

      const err = new Error(
        `PayPal order creation failed (${response.status} ${name}): ${issue}${description && description !== issue ? ` - ${description}` : ''}`
      );
      (err as any).name = name;
      (err as any).statusCode = response.status;
      (err as any).debugId = debugId;
      (err as any).issue = issue;
      throw err;
    }

    const orderData = await response.json();
    const links = orderData.links || [];
    const approveLink = links.find((l: any) => l.rel === 'approve');

    if (!orderData.id) {
      throw new Error('PayPal Orders v2 API did not return an order ID');
    }

    return {
      id: orderData.id,
      status: orderData.status,
      links,
      approveUrl: approveLink ? approveLink.href : null,
    };
  }

  /**
   * Retrieves order status and details directly from PayPal Orders v2 API.
   * Enables verification that buyer approval has completed prior to capture.
   */
  public async getOrder(paypalOrderId: string): Promise<{
    id: string;
    status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED' | string;
    intent: string;
    purchase_units?: any[];
    payer?: any;
  }> {
    // Check for simulated sandbox order
    if (paypalOrderId.startsWith('SIM_SANDBOX_') || paypalOrderId.startsWith('SIM_PP_')) {
      const sim = this.simulatedOrders.get(paypalOrderId);
      return {
        id: paypalOrderId,
        status: sim ? sim.status : 'CREATED',
        intent: 'CAPTURE',
      };
    }

    const accessToken = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal get order failed (${response.status}): ${errText}`);
    }

    return await response.json();
  }

  /**
   * Captures payment for an approved PayPal order and rigorously verifies the response.
   * Throws if buyer approval is incomplete, capture status is not COMPLETED, or amounts mismatch.
   */
  public async capturePayment(
    paypalOrderId: string,
    expectedAmount: number,
    expectedCurrency: string
  ): Promise<PayPalCaptureDetails> {
    // 1. Rigorous check: Verify order exists and payer has completed approval before capturing
    const orderDetails = await this.getOrder(paypalOrderId);
    if (orderDetails.status !== 'APPROVED') {
      if (orderDetails.status === 'CREATED' || orderDetails.status === 'PAYER_ACTION_REQUIRED') {
        throw new Error(
          `ORDER_NOT_APPROVED: Payer has not yet approved the Order for payment. (PayPal Order status is '${orderDetails.status}'). Buyer must sign in to PayPal and complete buyer approval before payment can be captured.`
        );
      }
      if (orderDetails.status === 'COMPLETED') {
        throw new Error(`ORDER_ALREADY_CAPTURED: Order ${paypalOrderId} has already been captured and paid.`);
      }
      if (orderDetails.status === 'VOIDED') {
        throw new Error(`ORDER_VOIDED: Order ${paypalOrderId} was voided or cancelled.`);
      }
      throw new Error(
        `INVALID_ORDER_STATE: PayPal order is not ready for capture. Current authoritative status: ${orderDetails.status}`
      );
    }

    // Handle Sandbox simulation mode if simulated order ID is passed
    if (paypalOrderId.startsWith('SIM_SANDBOX_') || paypalOrderId.startsWith('SIM_PP_')) {
      const sim = this.simulatedOrders.get(paypalOrderId);
      if (sim) {
        if (Math.abs(expectedAmount - sim.amount) > 0.01) {
          throw new Error(
            `Security Alert: Captured amount ($${sim.amount.toFixed(2)} ${sim.currency}) does not match authorized Purchase Pact amount ($${expectedAmount.toFixed(2)} ${expectedCurrency})`
          );
        }
        if (expectedCurrency.toUpperCase() !== sim.currency.toUpperCase()) {
          throw new Error(
            `Security Alert: Captured currency (${sim.currency}) does not match authorized currency (${expectedCurrency})`
          );
        }
        sim.status = 'COMPLETED';
      }
      return {
        captureId: `CAP_SIM_${Date.now()}`,
        paypalOrderId,
        status: 'COMPLETED',
        amount: expectedAmount.toFixed(2),
        currency: expectedCurrency,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        payerEmail: 'alex.chen-buyer@boundbuy.org',
        payerName: 'Alex Chen (Sandbox Buyer)',
      };
    }

    const accessToken = await this.getAccessToken();

    // 2. Execute capture against PayPal Orders v2
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': `bb_cap_${paypalOrderId}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        // raw text
      }

      const issue = parsedErr?.details?.[0]?.issue;
      const desc = parsedErr?.details?.[0]?.description || parsedErr?.message || errText;

      if (issue === 'ORDER_NOT_APPROVED') {
        throw new Error(
          `ORDER_NOT_APPROVED: Payer has not yet approved the Order for payment. Please complete PayPal buyer authorization before capturing.`
        );
      }
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        throw new Error(`ORDER_ALREADY_CAPTURED: This PayPal order has already been captured.`);
      }
      if (issue === 'INSTRUMENT_DECLINED') {
        throw new Error(
          `INSTRUMENT_DECLINED: Payment method was declined by PayPal. Please select another funding source in your PayPal Sandbox wallet.`
        );
      }
      if (issue === 'MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED') {
        throw new Error(
          `MAX_PAYMENT_ATTEMPTS_EXCEEDED: Maximum payment attempts exceeded for this PayPal order.`
        );
      }
      if (response.status === 401) {
        throw new Error(`PayPal authentication error: Client credentials rejected or token expired.`);
      }

      throw new Error(
        `PayPal payment capture failed (${response.status}) ${issue ? `[${issue}] ` : ''}: ${desc}`
      );
    }

    const captureData = await response.json();

    // Verify capture unit
    const purchaseUnit = captureData.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];

    if (!capture) {
      throw new Error(
        `PayPal capture response missing payment details for order ${paypalOrderId}. Overall status: ${captureData.status}`
      );
    }

    const capturedStatus = capture.status;
    const capturedAmountStr = capture.amount?.value || '0';
    const capturedCurrency = capture.amount?.currency_code || '';
    const capturedAmountNum = parseFloat(capturedAmountStr);

    // Verify amount matches expected total within 0.01 tolerance
    if (Math.abs(capturedAmountNum - expectedAmount) > 0.01) {
      throw new Error(
        `Security Alert: Captured amount ($${capturedAmountStr} ${capturedCurrency}) does not match authorized Purchase Pact amount ($${expectedAmount.toFixed(2)} ${expectedCurrency})`
      );
    }

    if (capturedCurrency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      throw new Error(
        `Security Alert: Captured currency (${capturedCurrency}) does not match authorized currency (${expectedCurrency})`
      );
    }

    if (capturedStatus !== 'COMPLETED') {
      throw new Error(
        `Payment was not completed. Authoritative PayPal status is: ${capturedStatus}`
      );
    }

    const payer = captureData.payer;
    return {
      captureId: capture.id,
      paypalOrderId: captureData.id,
      status: capturedStatus,
      amount: capturedAmountStr,
      currency: capturedCurrency,
      createTime: capture.create_time || new Date().toISOString(),
      updateTime: capture.update_time || new Date().toISOString(),
      payerEmail: payer?.email_address,
      payerName: payer?.name?.given_name ? `${payer.name.given_name} ${payer.name.surname || ''}`.trim() : undefined,
    };
  }

  /**
   * Verifies incoming webhook signatures against PayPal's verification API.
   */
  public async verifyWebhookSignature(params: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
    webhookId: string;
    webhookEvent: Record<string, unknown>;
  }): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const accessToken = await this.getAccessToken();
      const payload = {
        transmission_id: params.transmissionId,
        transmission_time: params.transmissionTime,
        cert_url: params.certUrl,
        auth_algo: params.authAlgo,
        transmission_sig: params.transmissionSig,
        webhook_id: params.webhookId,
        webhook_event: params.webhookEvent,
      };

      const response = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.verification_status === 'SUCCESS';
    } catch (err) {
      console.error('[PayPalService] Webhook signature verification failed:', err);
      return false;
    }
  }
}

export const paypalService = new PayPalService();
