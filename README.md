# BoundBuy AI — Rules-Bound Institutional Purchasing Agent

> **PayPal AI Hackathon 2026 Submission**  
> *“You set the buying rules. AI finds the best option. You approve the purchase. PayPal handles the payment.”*

BoundBuy AI is an institutional purchasing agent designed for college clubs, non-profits, small businesses, and distributed teams. It combines the reasoning capabilities of Google Gemini with cryptographic purchase contracts (**Purchase Pacts**) and payment execution via the **PayPal Orders v2 REST API**.

---

## 💡 The Core Innovation: Guardrailed Autonomous Procurement

AI shopping assistants often hallucinate prices, pick unauthorized substitutions, or overspend budgets. BoundBuy AI solves this by introducing a deterministic **Policy Engine** and cryptographic **Purchase Pact**:

1. **Natural-Language Understanding**: A user states their needs in plain English (*“I need 30 notebooks and 30 reusable bags for a college event under $80 total with delivery before Friday. No substitutions.”*).
2. **Schema-Validated Buying Rules**: The server-side Gemini API extracts explicit constraints (budget ceiling, mandatory attributes, hard delivery deadlines, substitution permissions).
3. **Deterministic Catalog Sourcing**: Sourced exclusively from verified catalog SKUs with live inventory, shipping tables, and supplier ratings. AI explains the trade-offs but cannot override hard limits.
4. **Cryptographic Purchase Pact**: The server calculates subtotal, consolidated shipping, and grand total. Once the buyer reviews and authorizes the pact, the server computes a **SHA-256 canonical hash** of the exact terms.
5. **Pre-Checkout Revalidation & Guardrail Interception**: If a supplier changes prices, inventory runs low, or delivery times slip before checkout, the canonical hash fails, the pact approval is automatically invalidated, and checkout is blocked until renewed buyer consent.
6. **Authoritative PayPal Sandbox Payment**: Orders are created with `CAPTURE` intent. Payment is only confirmed after backend verification of the PayPal capture response against authorized amounts.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, `@paypal/react-paypal-js`, jsPDF (for official downloadable receipts).
- **Backend**: Node.js, Express, TypeScript (`tsx`), Zod (schema validation), `@google/genai` (server-side Gemini 3.8 SDK).
- **Payment Gateway**: PayPal Orders v2 REST API (OAuth 2.0 Client Credentials, Capture Intent, Webhook Verification).
- **Persistence**: MongoDB Atlas support with resilient local atomic persistent storage fallback (`.data/boundbuy_store.json`).

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+ installed
- npm or yarn
- Google Gemini API Key
- (Optional) PayPal Developer Sandbox Account & MongoDB Atlas Connection String

### 2. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
PORT=3000
NODE_ENV=development

# Gemini AI API Key
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.8-flash"

# PayPal Sandbox Credentials (from developer.paypal.com)
PAYPAL_CLIENT_ID="your-paypal-sandbox-client-id"
PAYPAL_CLIENT_SECRET="your-paypal-sandbox-client-secret"
PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com"

# Storage
MONGODB_URI="" # Leave blank for local persistent storage mode
MONGODB_DB_NAME="boundbuy"
DEFAULT_CURRENCY="USD"
```

### 3. Install Dependencies & Run

```bash
# Install packages
npm install

# Run full-stack dev server (Express backend + Vite frontend on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 4. Running Automated Tests

Run the deterministic policy and guardrail test suite:

```bash
npm test
```

This verifies:
- Natural-language intent schema parsing
- Budget ceiling and quantity constraint enforcement
- Delivery deadline compliance
- Deterministic SHA-256 canonical snapshot hashing
- Dynamic supplier price hike invalidating approval

---

## 📦 Deployment to Render

BoundBuy AI is configured for one-click deployment on [Render](https://render.com) as a Web Service.

1. **Build Command**: `npm run build`
2. **Start Command**: `npm start` (or `node dist/server.js` / `tsx server.ts`)
3. **Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `GEMINI_API_KEY`: *(Your key)*
   - `PAYPAL_CLIENT_ID`: *(Your PayPal Sandbox Client ID)*
   - `PAYPAL_CLIENT_SECRET`: *(Your PayPal Sandbox Secret)*
   - `PAYPAL_BASE_URL`: `https://api-m.sandbox.paypal.com`
   - `MONGODB_URI`: *(Your MongoDB Atlas connection URI, optional)*

---

## 📑 Backend API Contract

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | GET | Health check, service status, and active persistence mode |
| `/api/config` | GET | Public configuration (safe PayPal client ID, currency, model) |
| `/api/catalog` | GET | List verified catalog products with supplier details |
| `/api/catalog/:id` | GET | Retrieve individual catalog SKU |
| `/api/catalog/reset` | POST | Restore baseline prices after running guardrail tests |
| `/api/intent/parse` | POST | Parse natural language request into structured JSON via Gemini |
| `/api/intents/:id/recommend` | POST | Filter catalog matches & generate AI trade-off analysis |
| `/api/pacts/create` | POST | Calculate independent totals & evaluate compliance rules |
| `/api/pacts/:id/approve` | POST | Explicit buyer sign-off; generates canonical snapshot hash |
| `/api/pacts/:id/revalidate` | POST | Check current catalog against approved snapshot hash |
| `/api/pacts/:id/simulate-price-change` | POST | Interactive demo: simulates price hike to trigger guardrail block |
| `/api/paypal/orders` | POST | Creates PayPal order with CAPTURE intent for approved pact |
| `/api/paypal/orders/:id/capture` | POST | Captures payment & verifies amount/currency server-side |
| `/api/orders` | GET | List all persisted orders and transaction references |
| `/api/orders/:id/receipt` | GET | Structured official receipt data |
| `/api/events` | GET | Chronological immutable security & audit ledger |
| `/api/carriers` | GET | Supported shipping carrier list & slugs |
| `/api/orders/:id/tracking` | GET | Full tracking bundle & chronological checkpoint events |
| `/api/orders/:id/shipments` | POST | Register or update shipment tracking for an order |
| `/api/shipments/:id/refresh` | POST | Synchronize latest checkpoints from carrier / AfterShip |
| `/api/shipments/:id/manual-event` | POST | Record manual carrier milestone or status update |
| `/api/orders/:id/delivery-intelligence` | POST | Ask AI questions grounded in verified tracking checkpoints |
| `/api/tracking/webhook` | POST | AfterShip webhook receiver with HMAC signature verification |
| `/api/settings` | GET/POST | Configure team limits, currency, tracking, and strictness mode |

---

## 🚚 BoundBuy Track — Shipment Tracking & Delivery Intelligence

BoundBuy Track brings enterprise logistics visibility and post-payment intelligence to every order:

1. **Decoupled Payment & Fulfillment**: PayPal payment capture confirms settlement (`PAID`), while shipment tracking operates independently (`LABEL_CREATED` -> `IN_TRANSIT` -> `OUT_FOR_DELIVERY` -> `DELIVERED`). Carrier events never alter payment records.
2. **AfterShip Live Integration**: Support for live carrier tracking via official AfterShip API (`v4/trackings`), normalizing carrier checkpoints across USPS, FedEx, UPS, DHL, and international couriers.
3. **Resilient Manual Fallback**: If AfterShip credentials are not configured, authorized operators can register manual tracking checkpoints, transparently labeled `MANUAL_UPDATE` (or `DEMO`) without pretending to be live carrier feeds.
4. **Signature-Verified Webhooks**: `POST /api/tracking/webhook` verifies AfterShip HMAC SHA-256 signatures against the raw request body with idempotency protection against duplicate event ingestion.
5. **AI Delivery Intelligence**: Powered by Google Gemini, buyers can ask conversational questions (*"Where is my order now?"*, *"When will it arrive?"*, *"Has my package encountered a delay?"*). The model is strictly grounded in real checkpoint records, never invents delivery dates, and warns if ETAs have not been supplied by the carrier.

---

## 🛡️ Security & Payment Integrity

1. **Zero Secret Leakage**: PayPal client secrets and Gemini API keys are strictly server-side.
2. **Never Trust Frontend Calculations**: All totals, shipping, and taxes are calculated deterministically on the server.
3. **Canonical Hash Snapshot**: A SHA-256 hash ensures no product, quantity, or price changes between approval and payment.
4. **Authoritative Capture Verification**: An order is marked `PAID` only when the PayPal REST API returns `status === 'COMPLETED'` with exact matching amount and currency.
5. **Idempotency Protection**: Repeated capture attempts for the same transaction return the existing verified record without double-charging.
6. **Explicit Test Transaction Notice**: Every receipt and screen clearly designates Sandbox transactions as test payments.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
