import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Edit2,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  FileText,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { ProductImage } from '../common/ProductImage.js';
import {
  StructuredPurchaseIntent,
  CatalogProduct,
  PurchasePact,
  OrderRecord,
  AppConfig,
  PayPalDiagnosticsData,
  DeliveryPreference,
} from '../../lib/types.js';
import {
  parseIntent,
  updateIntent,
  getRecommendations,
  createPurchasePact,
  approvePact,
  revalidatePact,
  simulatePriceChange,
  createPayPalOrder,
  capturePayPalOrder,
  cancelPayPalOrder,
  approveSimulatedPayPalOrder,
} from '../../lib/api.js';
import { generateOrderPdfReceipt } from '../../lib/pdf.js';
import { useCart } from '../../context/CartContext.js';
import { PayPalDiagnosticsPanel } from '../diagnostics/PayPalDiagnosticsPanel.js';
import { PreferredDeliveryScheduler } from '../delivery/PreferredDeliveryScheduler.js';
import { DeliveryScheduleCard } from '../delivery/DeliveryScheduleCard.js';

interface NewPurchaseFlowProps {
  config: AppConfig | null;
  onConfigUpdated?: (config: AppConfig) => void;
  onOrderCompleted: (order: OrderRecord) => void;
  onViewCatalog: () => void;
  initialStep?: Step;
}

type Step = 'input' | 'requirements' | 'recommendations' | 'pact' | 'completed';

export type AnalysisProgressStage =
  | 'idle'
  | 'understanding'
  | 'matching'
  | 'comparing'
  | 'validating'
  | 'preparing';

const PROGRESS_STAGES: { id: AnalysisProgressStage; label: string; subtext: string }[] = [
  { id: 'understanding', label: 'Understanding your requirements', subtext: 'Extracting item specifications, quantities, and hard constraints' },
  { id: 'matching', label: 'Finding matching products', subtext: 'Querying catalog SKUs and stock inventory' },
  { id: 'comparing', label: 'Comparing supplier options', subtext: 'Evaluating unit costs, lead times, and sustainability metrics' },
  { id: 'validating', label: 'Validating your budget and constraints', subtext: 'Enforcing institutional procurement guardrails' },
  { id: 'preparing', label: 'Preparing your purchase plan', subtext: 'Compiling structured rules and candidate recommendations' },
];

const EXAMPLE_PROMPTS = [
  'I need 30 notebooks and 30 reusable bags for a college event. Keep the total below $80 including shipping. Delivery must be before Friday. Do not substitute any products without asking me.',
  'Need 4 ergonomic LED desk lamps for our new workspace studio under $180 total with fast delivery.',
  'Order 100 compostable cups and 2 bags of organic whole bean coffee for the department meeting under $75.',
];

/**
 * Child watcher to listen to PayPal JS SDK script load states
 */
const ScriptStatusWatcher: React.FC<{
  onStatusChange: (status: 'initial' | 'pending' | 'resolved' | 'rejected') => void;
}> = ({ onStatusChange }) => {
  const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();
  const lastReportedStatusRef = useRef<string | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let currentStatus: 'initial' | 'pending' | 'resolved' | 'rejected' = 'initial';
    if (isResolved) {
      currentStatus = 'resolved';
    } else if (isRejected) {
      currentStatus = 'rejected';
    } else if (isPending) {
      currentStatus = 'pending';
    }

    if (lastReportedStatusRef.current !== currentStatus) {
      lastReportedStatusRef.current = currentStatus;
      onStatusChangeRef.current(currentStatus);
    }
  }, [isPending, isResolved, isRejected]);

  return null;
};

export const NewPurchaseFlow: React.FC<NewPurchaseFlowProps> = ({
  config,
  onConfigUpdated,
  onOrderCompleted,
  onViewCatalog,
  initialStep = 'input',
}) => {
  const [step, setStep] = useState<Step>(initialStep);
  const [promptInput, setPromptInput] = useState('');
  const [selectedExamplePrompt, setSelectedExamplePrompt] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<AnalysisProgressStage>('idle');
  const [analysisTelemetry, setAnalysisTelemetry] = useState<{
    correlationId?: string;
    intentParsingDurationMs?: number;
    totalDurationMs?: number;
    isFallback?: boolean;
    fallbackReason?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearStageTimers = () => {
    stageTimersRef.current.forEach((t) => clearTimeout(t));
    stageTimersRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearStageTimers();
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  const { selectedItems, totalQuantity, selectedSubtotal, clearSelection } = useCart();

  // Flow State
  const [intent, setIntent] = useState<StructuredPurchaseIntent | null>(null);
  const [candidates, setCandidates] = useState<
    { product: CatalogProduct; quantity: number; lineTotal: number }[]
  >([]);
  const [aiExplanation, setAiExplanation] = useState<{
    executiveSummary: string;
    productExplanations: {
      productId: string;
      whyRecommended: string;
      comparisonWithAlternatives: string;
      tradeOffsOrNotes: string;
    }[];
    budgetAnalysis: string;
  } | null>(null);

  const [pact, setPact] = useState<PurchasePact | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);
  const [deliveryPreference, setDeliveryPreference] = useState<DeliveryPreference | null>(null);

  // Edit Requirements Modal / State
  const [isEditingReqs, setIsEditingReqs] = useState(false);
  const [editBudget, setEditBudget] = useState(80);
  const [editAllowSubs, setEditAllowSubs] = useState(false);

  // PayPal checkout state
  const [checkoutStatus, setCheckoutStatus] = useState<
    'IDLE' | 'CREATING_ORDER' | 'WAITING_BUYER_APPROVAL' | 'CAPTURE_PENDING' | 'COMPLETED' | 'CANCELLED' | 'ERROR'
  >('IDLE');
  const [currentPayPalOrderId, setCurrentPayPalOrderId] = useState<string | null>(null);
  const [currentApprovalUrl, setCurrentApprovalUrl] = useState<string | null>(null);
  const [payPalStatusMessage, setPayPalStatusMessage] = useState<string | null>(null);
  const [payPalError, setPayPalError] = useState<string | null>(null);
  const [simulatedPriceNotice, setSimulatedPriceNotice] = useState<string | null>(null);
  const [isSimulatedOrderCreated, setIsSimulatedOrderCreated] = useState<boolean>(false);
  const [isSimulatedOrderApproved, setIsSimulatedOrderApproved] = useState<boolean>(false);

  // Real-time diagnostics panel telemetry
  const [diagData, setDiagData] = useState<PayPalDiagnosticsData>({
    sdkVersion: '@paypal/react-paypal-js: 10.6.0',
    sdkLoaded: false,
    sdkLoadingStatus: 'initial',
    environment: 'sandbox',
    clientIdConfigured: Boolean(config?.paypal?.clientId),
    clientIdPreview: config?.paypal?.clientId
      ? `${config.paypal.clientId.substring(0, 8)}... (${config.paypal.clientId.length} chars)`
      : undefined,
    oauthAuthStatus: 'not_tested',
    createOrderHttpStatus: null,
    createOrderStatus: null,
    paypalOrderId: null,
    hasApproveLink: false,
    approveLinkHostname: null,
    approveUrl: null,
    sanitizedError: null,
    buyerApprovalFired: false,
    buyerApprovalTimestamp: null,
    captureInvoked: false,
    captureHttpStatus: null,
    captureId: null,
  });

  const handleScriptStatusChange = useCallback(
    (status: 'initial' | 'pending' | 'resolved' | 'rejected') => {
      setDiagData((prev) => {
        const isLoaded = status === 'resolved';
        if (prev.sdkLoaded === isLoaded && prev.sdkLoadingStatus === status) {
          return prev;
        }
        return {
          ...prev,
          sdkLoaded: isLoaded,
          sdkLoadingStatus: status,
        };
      });
    },
    []
  );

  // Keep diagnostics state in sync with config without causing unnecessary re-renders
  useEffect(() => {
    const configured = Boolean(config?.paypal?.clientId);
    const preview = config?.paypal?.clientId
      ? `${config.paypal.clientId.substring(0, 8)}... (${config.paypal.clientId.length} chars)`
      : undefined;

    setDiagData((prev) => {
      if (
        prev.clientIdConfigured === configured &&
        prev.clientIdPreview === preview &&
        prev.environment === 'sandbox'
      ) {
        return prev;
      }
      return {
        ...prev,
        clientIdConfigured: configured,
        clientIdPreview: preview,
        environment: 'sandbox',
      };
    });
  }, [config?.paypal?.clientId]);

  // Handle return flow from PayPal hosted checkout (e.g. redirect or popup fallback)
  const handledApprovalTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (step === 'pact' && pact?.approvalStatus === 'approved') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const payerId = params.get('PayerID');
      if (token && token !== handledApprovalTokenRef.current && (payerId || !params.get('cancel'))) {
        handledApprovalTokenRef.current = token;
        window.history.replaceState({}, document.title, window.location.pathname);
        handleApprovePayment(token);
      }
    }
  }, [step, pact?.approvalStatus]);

  // 1. Submit Natural Language Prompt
  const handleParsePrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Abort prior in-flight request if user clicked another brief or retried
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    clearStageTimers();

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    setIsAiLoading(true);
    setErrorMessage(null);
    setProgressStage('understanding');

    // Progressive stage feedback
    stageTimersRef.current.push(setTimeout(() => setProgressStage('matching'), 350));
    stageTimersRef.current.push(setTimeout(() => setProgressStage('comparing'), 750));
    stageTimersRef.current.push(setTimeout(() => setProgressStage('validating'), 1150));
    stageTimersRef.current.push(setTimeout(() => setProgressStage('preparing'), 1550));

    try {
      const res = await parseIntent(trimmed, undefined, abortController.signal);
      clearStageTimers();
      setIntent(res.intent);
      setEditBudget(res.intent.budgetLimit);
      setEditAllowSubs(res.intent.allowSubstitutions);
      setAnalysisTelemetry({
        correlationId: res.correlationId,
        intentParsingDurationMs: res.timings?.intentParsingDurationMs,
        totalDurationMs: res.timings?.totalDurationMs,
        isFallback: res.intent.isFallbackGenerated,
        fallbackReason: res.intent.fallbackReason,
      });
      setStep('requirements');
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      clearStageTimers();
      console.error('[NewPurchaseFlow] Intent parse failed:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to interpret purchase intent. Please retry.'
      );
    } finally {
      clearStageTimers();
      setIsAiLoading(false);
      setProgressStage('idle');
    }
  };

  // 2. Save Updated Requirements
  const handleSaveRequirements = async () => {
    if (!intent) return;
    try {
      const res = await updateIntent(intent.id, {
        budgetLimit: editBudget,
        allowSubstitutions: editAllowSubs,
      });
      setIntent(res.intent);
      setIsEditingReqs(false);
    } catch (err) {
      setErrorMessage('Failed to update requirements');
    }
  };

  // 3. Request Recommendations from Catalog
  const handleFetchRecommendations = async () => {
    if (!intent) return;
    setIsAiLoading(true);
    setErrorMessage(null);

    try {
      const res = await getRecommendations(intent.id);
      setCandidates(res.candidates);
      setAiExplanation(res.aiExplanation);
      setStep('recommendations');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate product recommendations.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  // 4. Generate Purchase Pact from AI Flow
  const handleGeneratePact = async () => {
    if (!intent || candidates.length === 0) return;
    setIsAiLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        intentId: intent.id,
        items: candidates.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
        })),
        maxBudget: intent.budgetLimit,
        shippingDeadlineDays: intent.shippingDeadlineDays,
        allowSubstitutions: intent.allowSubstitutions,
      };

      const res = await createPurchasePact(payload);
      setPact(res.pact);
      setStep('pact');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate Purchase Pact.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  // Generate Purchase Pact directly from selected catalog items
  const handleGeneratePactFromSelection = async () => {
    if (selectedItems.length === 0) return;
    setIsAiLoading(true);
    setErrorMessage(null);

    const candidateList = selectedItems.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      lineTotal: Number((item.product.unitPrice * item.quantity).toFixed(2)),
    }));
    setCandidates(candidateList);

    try {
      const subtotal = candidateList.reduce((sum, c) => sum + c.lineTotal, 0);
      const budgetLimit = Math.max(100, Math.ceil(subtotal * 1.3));

      const payload = {
        items: candidateList.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
        })),
        maxBudget: budgetLimit,
        allowSubstitutions: false,
      };

      const res = await createPurchasePact(payload);
      setPact(res.pact);
      setStep('pact');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate Purchase Pact from selected items.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  const hasGeneratedInitialPactRef = useRef(false);
  useEffect(() => {
    if (initialStep === 'pact' && selectedItems.length > 0 && !pact && !hasGeneratedInitialPactRef.current) {
      hasGeneratedInitialPactRef.current = true;
      handleGeneratePactFromSelection();
    }
  }, [initialStep]);

  // 5. Approve Purchase Pact
  const handleApprovePact = async () => {
    if (!pact) return;
    setIsAiLoading(true);
    setErrorMessage(null);
    setCheckoutStatus('IDLE');
    setPayPalError(null);
    setCurrentPayPalOrderId(null);
    setCurrentApprovalUrl(null);
    setIsSimulatedOrderCreated(false);
    setIsSimulatedOrderApproved(false);

    try {
      const res = await approvePact(pact.id, pact.buyerEmail || 'alex.chen@boundbuy.org');
      setPact(res.pact);
      setSimulatedPriceNotice(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Approval rejected due to policy violation.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  // 6. Test Guardrails (Simulate Price Hike)
  const handleTestGuardrails = async () => {
    if (!pact) return;
    setIsAiLoading(true);
    setPayPalError(null);

    try {
      const res = await simulatePriceChange(pact.id, 1.45); // 45% price surge
      setPact(res.pact);
      setCheckoutStatus('IDLE');
      setCurrentPayPalOrderId(null);
      setSimulatedPriceNotice(
        `🚨 Guardrail Triggered: Supplier "${res.affectedProduct.supplierName}" increased the price of "${res.affectedProduct.name}". The existing approval hash was invalidated and checkout has been blocked!`
      );
    } catch (err) {
      setErrorMessage('Guardrail simulation error');
    } finally {
      setIsAiLoading(false);
    }
  };

  // 7. Proper PayPal JavaScript SDK Flow Handlers
  const handleCreateOrder = async (): Promise<string> => {
    if (!pact) throw new Error('No Purchase Pact found');
    if (pact.approvalStatus !== 'approved') {
      throw new Error('Purchase Pact must be explicitly approved before checkout.');
    }

    setCheckoutStatus('CREATING_ORDER');
    setPayPalStatusMessage('Validating Purchase Pact on server and creating PayPal order...');
    setPayPalError(null);

    setDiagData((prev) => ({
      ...prev,
      createOrderHttpStatus: null,
      createOrderStatus: 'CREATING...',
      paypalOrderId: null,
      hasApproveLink: false,
      approveLinkHostname: null,
      approveUrl: null,
      sanitizedError: null,
      buyerApprovalFired: false,
      captureInvoked: false,
    }));

    try {
      const orderRes = await createPayPalOrder(pact.id, false, deliveryPreference || undefined);
      setCurrentPayPalOrderId(orderRes.paypalOrderId);

      if (!orderRes.paypalOrderId) {
        throw new Error('PayPal Orders v2 did not return an order ID');
      }

      const approveLink = orderRes.links?.find((l) => l.rel === 'approve');
      let approveHostname = 'www.sandbox.paypal.com';
      if (approveLink?.href) {
        try {
          approveHostname = new URL(approveLink.href).hostname;
        } catch {
          approveHostname = 'www.sandbox.paypal.com';
        }
        setCurrentApprovalUrl(approveLink.href);
      }

      if (!approveLink || !approveLink.href) {
        throw new Error('PayPal order was created but missing rel: "approve" link in links array.');
      }

      // Update developer diagnostics with verified createOrder details
      setDiagData((prev) => ({
        ...prev,
        createOrderHttpStatus: 201,
        createOrderStatus: orderRes.status || 'CREATED',
        paypalOrderId: orderRes.paypalOrderId,
        hasApproveLink: true,
        approveLinkHostname: approveHostname,
        approveUrl: approveLink.href,
        sanitizedError: null,
      }));

      setCheckoutStatus('WAITING_BUYER_APPROVAL');
      setPayPalStatusMessage('PayPal checkout opened. Please complete buyer approval.');
      return orderRes.paypalOrderId;
    } catch (err: any) {
      setCheckoutStatus('ERROR');
      const msg = err?.message || 'Failed to create PayPal order';
      setPayPalError(msg);

      setDiagData((prev) => ({
        ...prev,
        createOrderHttpStatus: err?.status || 400,
        createOrderStatus: 'FAILED',
        sanitizedError: {
          name: err?.errorName || 'ORDER_CREATION_FAILED',
          message: msg,
          issue: err?.issue || null,
          debugId: err?.debugId || null,
          statusCode: err?.status || 400,
        },
      }));

      throw err;
    }
  };

  const handleApprovePayment = async (paypalOrderId: string) => {
    if (!pact) return;
    setCheckoutStatus('CAPTURE_PENDING');
    setPayPalStatusMessage('Buyer approval confirmed by PayPal! Capturing and verifying transaction on server...');
    setPayPalError(null);

    setDiagData((prev) => ({
      ...prev,
      buyerApprovalFired: true,
      buyerApprovalTimestamp: new Date().toLocaleTimeString(),
      captureInvoked: true,
      captureHttpStatus: null,
      captureId: null,
    }));

    try {
      const captureRes = await capturePayPalOrder(paypalOrderId, pact.id, false, deliveryPreference || undefined);
      setCheckoutStatus('COMPLETED');
      setCompletedOrder(captureRes.order);
      onOrderCompleted(captureRes.order);
      clearSelection();

      setDiagData((prev) => ({
        ...prev,
        captureHttpStatus: 200,
        captureId: captureRes.order.paypalCaptureId,
        sanitizedError: null,
      }));

      setStep('completed');
    } catch (err: any) {
      setCheckoutStatus('ERROR');
      const msg = err?.message || 'Payment capture failed or was rejected by server-side verification.';
      setPayPalError(msg);

      setDiagData((prev) => ({
        ...prev,
        captureHttpStatus: err?.status || 422,
        sanitizedError: {
          name: err?.errorName || 'CAPTURE_FAILED',
          message: msg,
          issue: err?.issue || null,
          debugId: err?.debugId || null,
          statusCode: err?.status || 422,
        },
      }));
    }
  };

  const handleCancelPayment = async (paypalOrderId?: string) => {
    const orderIdToCancel = paypalOrderId || currentPayPalOrderId;
    setCheckoutStatus('CANCELLED');
    setPayPalStatusMessage('Buyer cancelled checkout. The order has not been charged.');
    if (orderIdToCancel && pact) {
      cancelPayPalOrder(orderIdToCancel, pact.id).catch(() => {});
    }
  };

  const handlePaymentError = (err: any) => {
    setCheckoutStatus('ERROR');
    const msg = typeof err === 'string' ? err : err?.message || 'An error occurred during PayPal checkout.';
    setPayPalError(msg);

    setDiagData((prev) => ({
      ...prev,
      sanitizedError: {
        name: err?.errorName || 'PAYPAL_SDK_ERROR',
        message: msg,
        issue: err?.issue || null,
        debugId: err?.debugId || null,
      },
    }));
  };

  // Interactive Sandbox Simulation Handlers (for sandbox tests & demonstration)
  const handleSimulatedCreate = async () => {
    if (!pact) return;
    setCheckoutStatus('CREATING_ORDER');
    setPayPalError(null);
    try {
      const res = await createPayPalOrder(pact.id, true, deliveryPreference || undefined);
      setCurrentPayPalOrderId(res.paypalOrderId);
      setIsSimulatedOrderCreated(true);
      setIsSimulatedOrderApproved(false);
      setCheckoutStatus('WAITING_BUYER_APPROVAL');
      setPayPalStatusMessage(`Created Sandbox order ${res.paypalOrderId} in PENDING_APPROVAL state.`);

      setDiagData((prev) => ({
        ...prev,
        createOrderHttpStatus: 201,
        createOrderStatus: 'CREATED (Simulation)',
        paypalOrderId: res.paypalOrderId,
        hasApproveLink: true,
        approveLinkHostname: 'www.sandbox.paypal.com',
        approveUrl: res.approveUrl || `https://www.sandbox.paypal.com/checkoutnow?token=${res.paypalOrderId}`,
        sanitizedError: null,
      }));
    } catch (err: any) {
      setCheckoutStatus('ERROR');
      setPayPalError(err?.message || 'Failed to create simulated order');
      setDiagData((prev) => ({
        ...prev,
        createOrderHttpStatus: err?.status || 400,
        sanitizedError: {
          name: err?.errorName || 'SIMULATION_ERROR',
          message: err?.message || 'Failed to create simulated order',
          issue: err?.issue || null,
          debugId: err?.debugId || null,
        },
      }));
    }
  };

  const handleSimulatedBuyerApproval = async () => {
    if (!currentPayPalOrderId) return;
    try {
      await approveSimulatedPayPalOrder(currentPayPalOrderId);
      setIsSimulatedOrderApproved(true);
      setCheckoutStatus('WAITING_BUYER_APPROVAL');
      setPayPalStatusMessage('Buyer approval completed! Order is APPROVED. Ready for backend capture.');

      setDiagData((prev) => ({
        ...prev,
        buyerApprovalFired: true,
        buyerApprovalTimestamp: new Date().toLocaleTimeString(),
      }));
    } catch (err: any) {
      setPayPalError(err?.message || 'Failed to record simulated approval');
    }
  };

  const handleDirectCaptureAttempt = async () => {
    if (!currentPayPalOrderId || !pact) return;
    setCheckoutStatus('CAPTURE_PENDING');
    setPayPalError(null);

    setDiagData((prev) => ({
      ...prev,
      captureInvoked: true,
    }));

    try {
      const captureRes = await capturePayPalOrder(currentPayPalOrderId, pact.id, true, deliveryPreference || undefined);
      setCompletedOrder(captureRes.order);
      onOrderCompleted(captureRes.order);
      clearSelection();
      setCheckoutStatus('COMPLETED');

      setDiagData((prev) => ({
        ...prev,
        captureHttpStatus: 200,
        captureId: captureRes.order.paypalCaptureId,
        sanitizedError: null,
      }));

      setStep('completed');
    } catch (err: any) {
      setCheckoutStatus('ERROR');
      const msg = err?.message || 'Capture blocked as expected';
      setPayPalError(msg);

      setDiagData((prev) => ({
        ...prev,
        captureHttpStatus: err?.status || 422,
        sanitizedError: {
          name: err?.errorName || 'ORDER_NOT_APPROVED',
          message: msg,
          issue: err?.issue || 'ORDER_NOT_APPROVED',
          debugId: err?.debugId || null,
          statusCode: err?.status || 422,
        },
      }));
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Step Indicator Header */}
      <div className="flex items-center justify-between border-b border-[#E3E7E4] pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#153E2E] flex items-center justify-center text-white text-xs font-bold font-mono">
            {step === 'input'
              ? '1'
              : step === 'requirements'
              ? '2'
              : step === 'recommendations'
              ? '3'
              : step === 'pact'
              ? '4'
              : '✓'}
          </div>
          <h2 className="text-lg font-bold text-[#19211C] font-display">
            {step === 'input' && 'Step 1: Describe Your Procurement Goal'}
            {step === 'requirements' && 'Step 2: Review Structured Buying Rules'}
            {step === 'recommendations' && 'Step 3: Supplier Recommendations & Trade-offs'}
            {step === 'pact' && 'Step 4: Authorize Purchase Pact & PayPal Checkout'}
            {step === 'completed' && 'Procurement Verified & Captured'}
          </h2>
        </div>

        {step !== 'input' && step !== 'completed' && (
          <button
            onClick={() => {
              if (step === 'pact') setStep('recommendations');
              else if (step === 'recommendations') setStep('requirements');
              else if (step === 'requirements') setStep('input');
            }}
            className="text-xs font-semibold text-[#637267] hover:text-[#19211C] cursor-pointer"
          >
            ← Previous Step
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs text-[#991B1B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
            <div className="space-y-1">
              <span className="font-bold">Analysis Notice:</span>
              <p className="leading-relaxed">{errorMessage}</p>
              {analysisTelemetry?.correlationId && (
                <p className="text-[10px] text-[#B91C1C] font-mono">
                  Ref Trace ID: {analysisTelemetry.correlationId}
                </p>
              )}
            </div>
          </div>
          {promptInput.trim() && (
            <button
              onClick={() => handleParsePrompt(promptInput)}
              disabled={isAiLoading}
              className="px-3.5 py-1.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold rounded-lg shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 self-start sm:self-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
              <span>Retry Analysis</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 1: NATURAL LANGUAGE INPUT                            */}
      {/* ========================================================= */}
      {step === 'input' && (
        <div className="space-y-6 max-w-3xl">
          {/* Selected Items Banner if user selected products from catalog */}
          {selectedItems.length > 0 && (
            <div className="bg-[#EEF4F0] border border-[#C5DFC9] rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#153E2E] text-white flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-4 h-4 text-[#88D4A8]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#19211C]">
                      {selectedItems.length} {selectedItems.length === 1 ? 'Product' : 'Products'} Selected from Catalog ({totalQuantity} units)
                    </h3>
                    <p className="text-[11px] text-[#24523F]">
                      Subtotal: <strong className="font-mono-data">${selectedSubtotal.toFixed(2)} USD</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleGeneratePactFromSelection}
                    disabled={isAiLoading}
                    className="px-4 py-2 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>Generate Pact from Selection</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#88D4A8]" />
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2.5 py-2 text-xs text-[#991B1B] hover:bg-white/50 rounded-lg cursor-pointer"
                    title="Clear selected items"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-[#425046] flex flex-wrap gap-1.5 pt-2 border-t border-[#D5E6D9]">
                {selectedItems.map((item, idx) => (
                  <span
                    key={`${item.product.id}-${idx}`}
                    className="px-2 py-0.5 bg-white border border-[#D5E6D9] rounded text-[10px] text-[#19211C]"
                  >
                    {item.quantity}x {item.product.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 shadow-xs space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="procurement-prompt"
                className="text-sm font-bold text-[#19211C] flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-[#153E2E]" />
                <span>What does your team or organization need to purchase?</span>
              </label>
              <p className="text-xs text-[#637267]">
                State the items, quantities, budget limit, delivery deadline, and
                substitution rules in everyday English.
              </p>
            </div>

            <textarea
              id="procurement-prompt"
              rows={4}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="e.g. I need 30 notebooks and 30 reusable bags for a college event. Keep the total below $80 including shipping. Delivery must be before Friday. Do not substitute any products without asking me."
              className="w-full p-3.5 border border-[#D5DDD7] rounded-lg text-sm text-[#19211C] focus:outline-none focus:ring-2 focus:ring-[#153E2E]/20 focus:border-[#153E2E] resize-none"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#79887D]">
                Powered by Gemini AI · Schema-validated structured output
              </span>
              <button
                onClick={() => handleParsePrompt(promptInput)}
                disabled={isAiLoading || !promptInput.trim()}
                className="px-5 py-2.5 bg-[#153E2E] text-white text-xs font-bold rounded-lg hover:bg-[#1E4D3A] transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#88D4A8]" />
                    <span>Analyzing Requirements...</span>
                  </>
                ) : (
                  <>
                    <span>Convert to Buying Rules</span>
                    <Send className="w-3.5 h-3.5 text-[#88D4A8]" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress Card during Active Analysis */}
          {isAiLoading && (
            <div className="bg-white border border-[#C5DFC9] rounded-xl p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-[#EAEFEA] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#153E2E] animate-pulse" />
                  <h4 className="text-xs font-bold text-[#19211C]">
                    BoundBuy Procurement Intelligence Engine
                  </h4>
                </div>
                <span className="text-[10px] font-semibold text-[#153E2E] bg-[#EEF4F0] px-2 py-0.5 rounded-full border border-[#C4DFC9]">
                  Active Analysis
                </span>
              </div>

              <div className="space-y-2">
                {PROGRESS_STAGES.map((s, idx) => {
                  const stageIndex = PROGRESS_STAGES.findIndex((p) => p.id === progressStage);
                  const isCompleted = stageIndex > idx;
                  const isCurrent = stageIndex === idx;

                  return (
                    <div
                      key={s.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg text-xs transition-all duration-200 ${
                        isCurrent
                          ? 'bg-[#F2F7F4] border border-[#BCE1C7] text-[#19211C]'
                          : isCompleted
                          ? 'text-[#2D3A31] opacity-90'
                          : 'text-[#8C9B90] opacity-50'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                        ) : isCurrent ? (
                          <RefreshCw className="w-4 h-4 text-[#153E2E] animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[#D5DDD7] flex items-center justify-center text-[9px] text-[#8C9B90]">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold ${isCurrent ? 'text-[#153E2E]' : ''}`}>
                            {s.label}
                          </span>
                          {isCompleted && (
                            <span className="text-[10px] text-[#15803D] font-medium">Done</span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] text-[#153E2E] font-medium animate-pulse">
                              Analyzing...
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#637267] mt-0.5">{s.subtext}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Example Prompts with Distinct Selection vs Analysis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#637267] uppercase tracking-wider">
                Example Procurement Briefs
              </div>
              <span className="text-[11px] text-[#79887D]">
                Select brief to review &middot; Click "Analyze Brief" to submit
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {EXAMPLE_PROMPTS.map((example, idx) => {
                const isSelected = selectedExamplePrompt === example || promptInput.trim() === example.trim();
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedExamplePrompt(example);
                      setPromptInput(example);
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 border rounded-lg text-left text-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group ${
                      isSelected
                        ? 'bg-[#EEF4F0] border-[#153E2E] shadow-xs ring-1 ring-[#153E2E]/20'
                        : 'bg-[#F5F7F5] border-[#E3E7E4] hover:bg-[#EEF4F0] hover:border-[#C4DFC9]'
                    }`}
                  >
                    <div className="space-y-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/80 border border-[#D5E2D9] text-[#24523F]">
                          Brief {idx + 1}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-[#15803D] flex items-center gap-1 bg-white/90 px-1.5 py-0.5 rounded border border-[#C5DFC9]">
                            <CheckCircle2 className="w-3 h-3 text-[#15803D]" />
                            Loaded in Prompt Box
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed text-[#2D3A31] font-medium">"{example}"</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedExamplePrompt(example);
                          setPromptInput(example);
                          handleParsePrompt(example);
                        }}
                        disabled={isAiLoading}
                        className="px-3.5 py-2 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isAiLoading && isSelected ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin text-[#88D4A8]" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <span>Analyze Brief</span>
                            <ArrowRight className="w-3 h-3 text-[#88D4A8]" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 2: STRUCTURED REQUIREMENTS REVIEW                   */}
      {/* ========================================================= */}
      {step === 'requirements' && intent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Parsed Rules & Quantities */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#EAEFEA] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#19211C]">
                    Extracted Buying Rules & Guardrails
                  </h3>
                  <p className="text-xs text-[#637267]">
                    Deterministic rules that BoundBuy AI will enforce against suppliers
                  </p>
                </div>
                <button
                  onClick={() => setIsEditingReqs(!isEditingReqs)}
                  className="text-xs font-semibold text-[#153E2E] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{isEditingReqs ? 'Close Edit' : 'Edit Rules'}</span>
                </button>
              </div>

              {/* Institutional Policy Status Banner */}
              {intent.isFallbackGenerated ? (
                <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-[#14532D] flex items-center gap-2">
                      <span>Deterministic Procurement Policy Active</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                        Safe Institutional Extraction
                      </span>
                    </div>
                    <p className="text-[11px] text-[#166534]">
                      {intent.fallbackReason || 'Applied verified institutional buying rules and constraints.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#F8FAF8] border border-[#D5E2D9] rounded-lg text-xs flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#153E2E] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-[#153E2E] flex items-center gap-2">
                      <span>Gemini AI Schema-Validated Output</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EEF4F0] text-[#153E2E] border border-[#C4DFC9]">
                        Verified
                      </span>
                    </div>
                    <p className="text-[11px] text-[#425046]">
                      Extracted semantic requirements and constraint boundaries via Gemini model.
                    </p>
                  </div>
                </div>
              )}

              {/* Latency & Correlation Telemetry */}
              {analysisTelemetry && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#637267] bg-[#F7F9F7] px-3 py-1.5 rounded-md border border-[#E3E7E4] gap-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#153E2E]" />
                    <span>
                      Analysis Latency:{' '}
                      <strong className="font-mono text-[#19211C]">
                        {analysisTelemetry.intentParsingDurationMs ?? analysisTelemetry.totalDurationMs ?? 0}ms
                      </strong>
                      {analysisTelemetry.intentParsingDurationMs !== undefined && analysisTelemetry.intentParsingDurationMs < 10
                        ? ' (In-Memory Cache Hit)'
                        : ''}
                    </span>
                  </div>
                  {analysisTelemetry.correlationId && (
                    <span className="font-mono text-[10px] text-[#79887D]">
                      Trace: {analysisTelemetry.correlationId}
                    </span>
                  )}
                </div>
              )}

              {isEditingReqs ? (
                <div className="p-4 bg-[#F8FAF8] border border-[#D5E2D9] rounded-lg space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-bold text-[#19211C]">
                      Maximum Total Budget Limit (USD)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={editBudget}
                      onChange={(e) => setEditBudget(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-[#C5D0C8] rounded bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allow-subs"
                      checked={editAllowSubs}
                      onChange={(e) => setEditAllowSubs(e.target.checked)}
                      className="rounded border-[#C5D0C8] text-[#153E2E]"
                    />
                    <label htmlFor="allow-subs" className="font-medium text-[#19211C]">
                      Permit intelligent item substitution if stock is low
                    </label>
                  </div>

                  <button
                    onClick={handleSaveRequirements}
                    className="px-3 py-1.5 bg-[#153E2E] text-white text-xs font-semibold rounded hover:bg-[#1E4D3A] cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              ) : null}

              {/* Goal & Hard Constraints Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
                  <div className="text-[11px] font-semibold text-[#637267]">
                    Purchasing Goal
                  </div>
                  <div className="font-bold text-[#19211C]">
                    {intent.purchaseGoal}
                  </div>
                </div>

                <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
                  <div className="text-[11px] font-semibold text-[#637267]">
                    Budget Boundary
                  </div>
                  <div className="font-bold text-[#153E2E] text-base font-mono-data">
                    ${intent.budgetLimit.toFixed(2)} {intent.currency}
                  </div>
                </div>

                <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
                  <div className="text-[11px] font-semibold text-[#637267]">
                    Delivery Timeline
                  </div>
                  <div className="font-semibold text-[#19211C]">
                    {intent.shippingDeadlineDays
                      ? `Within ${intent.shippingDeadlineDays} days max`
                      : 'Standard commercial dispatch'}
                  </div>
                </div>

                <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
                  <div className="text-[11px] font-semibold text-[#637267]">
                    Substitution Policy
                  </div>
                  <div className="font-semibold text-[#19211C]">
                    {intent.allowSubstitutions
                      ? 'Substitutions permitted'
                      : 'Strict: No unauthorized substitutions'}
                  </div>
                </div>
              </div>

              {/* Required Items Table */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-[#19211C]">
                  Required Line Items
                </div>
                <div className="border border-[#EAEFEA] rounded-lg divide-y divide-[#EAEFEA] text-xs">
                  {intent.requiredItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 flex items-center justify-between hover:bg-[#F9FAF9]"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-[#19211C] capitalize">
                          {item.categoryOrName}
                        </span>
                        {item.mandatoryAttributes.length > 0 && (
                          <div className="text-[11px] text-[#637267]">
                            Required attributes: {item.mandatoryAttributes.join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="font-mono-data font-bold text-[#153E2E] px-2.5 py-1 bg-[#EEF4F0] rounded">
                        Qty: {item.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Clarification & Action */}
          <div className="space-y-4">
            <div className="bg-[#F6FAF7] border border-[#D1E2D6] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#153E2E]">
                <ShieldCheck className="w-4 h-4 text-[#153E2E]" />
                <span>Enforcement Guarantee</span>
              </div>
              <p className="text-xs text-[#2D3A31] leading-relaxed">
                Before any PayPal order is created, BoundBuy's backend policy engine
                will independently verify that the total does not exceed{' '}
                <strong className="font-mono-data text-[#153E2E]">
                  ${intent.budgetLimit.toFixed(2)}
                </strong>
                .
              </p>
            </div>

            {intent.isClarificationNeeded && intent.clarificationQuestions.length > 0 && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4 space-y-2 text-xs text-[#92400E]">
                <div className="font-bold flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  <span>Clarification Note</span>
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  {intent.clarificationQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleFetchRecommendations}
              disabled={isAiLoading}
              className="w-full py-3 bg-[#153E2E] text-white text-xs font-bold rounded-xl hover:bg-[#1E4D3A] transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isAiLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#88D4A8]" />
                  <span>Matching Catalog Options...</span>
                </>
              ) : (
                <>
                  <span>Find Best Supplier Matches</span>
                  <ArrowRight className="w-4 h-4 text-[#88D4A8]" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 3: RECOMMENDATIONS & TRADE-OFFS                     */}
      {/* ========================================================= */}
      {step === 'recommendations' && (
        <div className="space-y-6">
          {aiExplanation && (
            <div className="p-5 bg-[#EEF4F0] border border-[#C5DDCB] rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#153E2E]">
                <Sparkles className="w-4 h-4 text-[#153E2E]" />
                <span>AI Sourcing Analysis</span>
              </div>
              <p className="text-xs text-[#19211C] leading-relaxed">
                {aiExplanation.executiveSummary}
              </p>
              <div className="text-[11px] text-[#24523F] font-medium pt-1">
                {aiExplanation.budgetAnalysis}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#19211C]">
              Matched Products from Catalog
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {candidates.map((cand, idx) => {
                const prod = cand.product;
                const explanation = aiExplanation?.productExplanations.find(
                  (e) => e.productId === prod.id
                );

                return (
                  <div
                    key={`${prod.id}-${idx}`}
                    className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-[#EAEFEA] shrink-0">
                          <ProductImage
                            productId={prod.id}
                            name={prod.name}
                            category={prod.category}
                            imageUrl={prod.imageUrl}
                            aspectRatio="h-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[#19211C] leading-snug">
                            {prod.name}
                          </h4>
                          <div className="text-[11px] text-[#637267] mt-0.5">
                            Supplier: {prod.supplierName} · Ships in {prod.estimatedDeliveryDays}d
                          </div>
                          <div className="text-xs font-bold text-[#153E2E] mt-1 font-mono-data">
                            ${prod.unitPrice.toFixed(2)} each · Total for {cand.quantity}: $
                            {cand.lineTotal.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {explanation && (
                        <div className="p-2.5 bg-[#F9FAF9] border border-[#EAEFEA] rounded text-[11px] text-[#2D3A31] space-y-1">
                          <div className="font-semibold text-[#153E2E]">
                            Why Recommended:
                          </div>
                          <p>{explanation.whyRecommended}</p>
                          {explanation.tradeOffsOrNotes && (
                            <div className="text-[#637267] text-[10px]">
                              Note: {explanation.tradeOffsOrNotes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[#EAEFEA] flex items-center justify-between text-xs">
                      <span className="text-[#637267]">In Stock: {prod.stockQuantity} units</span>
                      <span className="font-bold text-[#153E2E]">Verified SKU</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 bg-white border border-[#E3E7E4] rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-[#637267]">Ready to prepare Purchase Pact</div>
              <div className="text-sm font-bold text-[#19211C]">
                Calculated items total:{' '}
                <span className="text-[#153E2E] font-mono-data">
                  $
                  {candidates
                    .reduce((sum, c) => sum + c.lineTotal, 0)
                    .toFixed(2)}{' '}
                  USD
                </span>
              </div>
            </div>

            <button
              onClick={handleGeneratePact}
              disabled={isAiLoading}
              className="px-6 py-2.5 bg-[#153E2E] text-white text-xs font-bold rounded-lg hover:bg-[#1E4D3A] transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <span>Generate Purchase Pact</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#88D4A8]" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 4: PURCHASE PACT & GUARDRAIL APPROVAL               */}
      {/* ========================================================= */}
      {step === 'pact' && pact && (
        <div className="space-y-6">
          {/* Simulated Notice if Guardrail Triggered */}
          {simulatedPriceNotice && (
            <div className="p-4 bg-[#FEF2F2] border border-[#F87171] rounded-xl text-xs text-[#991B1B] space-y-1 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-[#DC2626]" />
                <span>Guardrail Test Fired: Material Term Changed</span>
              </div>
              <p className="leading-relaxed">{simulatedPriceNotice}</p>
            </div>
          )}

          <div className="bg-white border border-[#E3E7E4] rounded-xl p-7 shadow-xs space-y-6">
            {/* Pact Status Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EAEFEA] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#19211C] font-display">
                    Purchase Pact #{pact.id}
                  </h3>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded ${
                      pact.approvalStatus === 'approved'
                        ? 'bg-[#E3F2E8] text-[#153E2E]'
                        : pact.approvalStatus === 'invalidated_by_changes'
                        ? 'bg-[#FEE2E2] text-[#991B1B]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {pact.approvalStatus === 'approved'
                      ? '✓ Approved & Locked'
                      : pact.approvalStatus === 'invalidated_by_changes'
                      ? '⚠ Approval Invalidated'
                      : 'Awaiting Buyer Approval'}
                  </span>
                </div>
                <p className="text-xs text-[#637267] mt-1">
                  Binding procurement specification. Authoritative total calculated by server.
                </p>
              </div>

              {/* Simulation Helper */}
              <button
                onClick={handleTestGuardrails}
                className="px-3.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Simulates supplier raising product price in catalog to demonstrate cryptographic guardrail block"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                <span>Test Purchase Guardrails (Simulate Price Hike)</span>
              </button>
            </div>

            {/* Policy Rule Checklist */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
                Automated Policy Guardrails
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {pact.ruleEvaluations.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                      rule.passed
                        ? 'bg-[#F9FAF9] border-[#E2EBE5] text-[#2D3A31]'
                        : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                    }`}
                  >
                    {rule.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-[#153E2E] mt-0.5 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold">{rule.ruleName}</div>
                      <div className="text-[11px] text-[#637267] mt-0.5">
                        {rule.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Itemized Table */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
                Itemized Products & Quantities
              </div>
              <div className="border border-[#EAEFEA] rounded-lg divide-y divide-[#EAEFEA] text-xs">
                {pact.items.map((it, idx) => (
                  <div
                    key={`${it.productId}-${idx}`}
                    className="p-3.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-[#19211C]">
                        {it.productName}
                      </div>
                      <div className="text-[11px] text-[#637267]">
                        Supplier: {it.supplierName} ({it.supplierId}) · Dispatch: {it.deliveryDays}d
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-data font-bold text-[#19211C]">
                        {it.quantity} × ${it.unitPrice.toFixed(2)} = $
                        {it.itemTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preferred Delivery Time Scheduling Section */}
            <PreferredDeliveryScheduler
              value={deliveryPreference}
              onChange={setDeliveryPreference}
              minLeadDays={Math.max(1, ...pact.items.map((i) => i.deliveryDays || 1))}
              initialAddress={{
                recipientName: pact.buyerEmail,
                street: '452 Innovation Blvd, Tech Park',
                unit: 'Suite 3B',
                city: 'Bengaluru',
                state: 'Karnataka',
                postalCode: '560100',
                country: 'India',
              }}
              readOnly={pact.approvalStatus === 'approved'}
            />

            {/* Financial Summary */}
            <div className="p-4 bg-[#F9FAF9] border border-[#E3E7E4] rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1 text-xs">
                <div className="text-[#637267]">
                  Subtotal: ${pact.subtotal.toFixed(2)} · Shipping: $
                  {pact.shippingCost.toFixed(2)}
                </div>
                <div className="text-[#19211C] font-semibold">
                  Authorized Budget Ceiling: ${pact.maxBudget.toFixed(2)}{' '}
                  {pact.currency}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-[#637267] uppercase font-semibold">
                  Server Calculated Grand Total
                </div>
                <div className="text-2xl font-bold text-[#153E2E] font-mono-data">
                  ${pact.grandTotal.toFixed(2)} {pact.currency}
                </div>
              </div>
            </div>

            {/* Cryptographic Hash Seal (if approved) */}
            {pact.canonicalSnapshotHash && (
              <div className="p-3.5 bg-[#F2F7F4] border border-[#C5DFC9] rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#153E2E]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Canonical Cryptographic Seal</span>
                </div>
                <div className="font-mono-data text-[10px] text-[#24523F] break-all">
                  SHA-256: {pact.canonicalSnapshotHash}
                </div>
                <div className="text-[10px] text-[#637267]">
                  Authorized by {pact.approvedBy} on{' '}
                  {new Date(pact.approvedAt || '').toLocaleString()}
                </div>
              </div>
            )}

            {/* Status Messages */}
            {checkoutStatus === 'CREATING_ORDER' && (
              <div className="p-3.5 bg-[#EEF4F0] border border-[#C5DFC9] text-[#153E2E] rounded-lg text-xs flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#153E2E] shrink-0" />
                <span>Creating verified PayPal Sandbox order with server-calculated amounts...</span>
              </div>
            )}

            {checkoutStatus === 'WAITING_BUYER_APPROVAL' && (
              <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] rounded-lg text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB] shrink-0" />
                  <span>Waiting for Buyer Approval in PayPal</span>
                </div>
                <p>The PayPal checkout interface has opened. Please log in with your PayPal Sandbox buyer account and complete buyer approval.</p>
                {currentPayPalOrderId && (
                  <div className="text-[11px] font-mono-data text-[#1E3A8A]">
                    PayPal Order ID: <strong>{currentPayPalOrderId}</strong> · Status: <strong>PENDING_APPROVAL</strong>
                  </div>
                )}
                {currentApprovalUrl && (
                  <a
                    href={currentApprovalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white rounded text-xs font-semibold hover:bg-[#1D4ED8] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open PayPal Approval Window</span>
                  </a>
                )}
              </div>
            )}

            {checkoutStatus === 'CAPTURE_PENDING' && (
              <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-lg text-xs flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#16A34A] shrink-0" />
                <span><strong>Verifying & Capturing:</strong> Buyer approval confirmed! Server is validating amounts and executing PayPal capture...</span>
              </div>
            )}

            {checkoutStatus === 'CANCELLED' && (
              <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] rounded-lg text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />
                  <span><strong>Buyer cancelled checkout:</strong> No payment was captured. You can safely resume or restart checkout.</span>
                </div>
                <button
                  onClick={() => {
                    setCheckoutStatus('IDLE');
                    setPayPalError(null);
                  }}
                  className="px-3 py-1 bg-white border border-[#FDE68A] rounded text-xs font-semibold hover:bg-[#FEF3C7] cursor-pointer"
                >
                  Resume Checkout
                </button>
              </div>
            )}

            {payPalError && (
              <div className="p-3.5 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg text-xs text-[#991B1B] space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>Checkout Blocked / Payment Failed</span>
                </div>
                <p className="leading-relaxed">{payPalError}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setCheckoutStatus('IDLE');
                      setPayPalError(null);
                    }}
                    className="px-3 py-1 bg-white border border-[#FCA5A5] rounded text-xs font-semibold hover:bg-[#FEE2E2] cursor-pointer text-[#991B1B]"
                  >
                    Retry Checkout
                  </button>
                </div>
              </div>
            )}

            {/* Developer-Only PayPal Diagnostics Panel (Visible in Dev & Preview) */}
            <div id="paypal-diagnostics-panel">
              <PayPalDiagnosticsPanel
                data={diagData}
                config={config}
                onConfigUpdated={onConfigUpdated}
              />
            </div>

            {/* Action Buttons: Sign-off or Pay */}
            <div className="pt-2 flex flex-wrap gap-6 items-start justify-between border-t border-[#EAEFEA]">
              <div>
                {pact.approvalStatus !== 'approved' ? (
                  <button
                    onClick={handleApprovePact}
                    disabled={isAiLoading || !pact.isCompliant}
                    className="px-6 py-2.5 bg-[#153E2E] text-white text-xs font-bold rounded-lg hover:bg-[#1E4D3A] transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#88D4A8]" />
                    <span>Approve this Purchase Pact (Buyer Sign-off)</span>
                  </button>
                ) : (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#153E2E] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#153E2E]" />
                      <span>Terms Approved & Cryptographically Sealed</span>
                    </div>
                    <div className="text-[11px] text-[#637267]">
                      Order ready for buyer approval in PayPal Sandbox
                    </div>
                  </div>
                )}
              </div>

              {/* PayPal Checkout Buttons Container */}
              {pact.approvalStatus === 'approved' && (
                <div className="w-full sm:w-80 flex flex-col items-end gap-3">
                  <div className="w-full space-y-2">
                    {config?.paypal?.clientId ? (
                      <PayPalScriptProvider
                        key={`paypal-sdk-${config.paypal.clientId}-${pact.currency}-${config.paypal.mode || 'sandbox'}`}
                        options={{
                          clientId: config.paypal.clientId,
                          currency: pact.currency || 'USD',
                          intent: 'capture',
                          environment: 'sandbox',
                        }}
                      >
                        <ScriptStatusWatcher onStatusChange={handleScriptStatusChange} />
                        <PayPalButtons
                          style={{
                            layout: 'vertical',
                            color: 'gold',
                            shape: 'rect',
                            label: 'paypal',
                            height: 44,
                          }}
                          disabled={
                            checkoutStatus === 'CAPTURE_PENDING' ||
                            checkoutStatus === 'CREATING_ORDER'
                          }
                          createOrder={async () => {
                            return await handleCreateOrder();
                          }}
                          onApprove={async (data) => {
                            await handleApprovePayment(data.orderID);
                          }}
                          onCancel={async (data: Record<string, unknown>) => {
                            const orderId = typeof data?.orderID === 'string' ? data.orderID : undefined;
                            await handleCancelPayment(orderId);
                          }}
                          onError={(err) => {
                            handlePaymentError(err);
                          }}
                        />
                      </PayPalScriptProvider>
                    ) : (
                      <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] rounded-xl text-xs space-y-2 text-left w-full shadow-xs">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>PayPal Sandbox Keys Required</span>
                        </div>
                        <p className="text-[11px] text-[#78350F] leading-relaxed">
                          To prevent "Things don't appear to be working at the moment" errors, your Sandbox Client ID is needed to load the PayPal JavaScript SDK.
                        </p>
                        <div className="pt-1">
                          <button
                            onClick={() => {
                              const elem = document.getElementById('paypal-diagnostics-panel');
                              elem?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-3 py-1.5 bg-[#B45309] hover:bg-[#92400E] text-white rounded font-bold text-[11px] cursor-pointer"
                          >
                            Set Sandbox Keys in Diagnostics Panel
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-[#79887D] text-right flex items-center justify-end gap-1">
                      <CreditCard className="w-3 h-3 text-[#153E2E]" />
                      <span>PayPal Sandbox Orders v2 · Intent: CAPTURE</span>
                    </div>
                  </div>

                  {/* Sandbox Verification & Guardrail Test Panel */}
                  <div className="p-3 bg-[#F8FAF8] border border-[#DCE4DE] rounded-xl text-xs space-y-2 w-full text-left">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#19211C] flex items-center gap-1.5 text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#153E2E]" />
                        <span>Sandbox Testing & Rejection Verification</span>
                      </span>
                      <span className="text-[9px] font-bold text-[#153E2E] bg-[#EEF4F0] px-1.5 py-0.5 rounded">
                        Verification Console
                      </span>
                    </div>
                    <p className="text-[10px] text-[#637267] leading-relaxed">
                      Verify that PayPal capture is strictly blocked with HTTP 422 until buyer approval:
                    </p>
                    <div className="flex flex-col gap-1.5 pt-1">
                      {!isSimulatedOrderCreated ? (
                        <button
                          onClick={handleSimulatedCreate}
                          disabled={checkoutStatus === 'CREATING_ORDER'}
                          className="px-2.5 py-1.5 bg-[#153E2E] text-white rounded text-[11px] font-semibold hover:bg-[#1E4D3A] transition-colors cursor-pointer disabled:opacity-50 text-center"
                        >
                          Step 1: Create Sandbox Order (Pending Approval)
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={handleDirectCaptureAttempt}
                            disabled={isSimulatedOrderApproved || checkoutStatus === 'CAPTURE_PENDING'}
                            className="px-2.5 py-1.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] rounded text-[10px] font-semibold hover:bg-[#FEF3C7] transition-colors cursor-pointer disabled:opacity-40 text-center"
                            title="Directly calls capture without approval to demonstrate HTTP 422 ORDER_NOT_APPROVED rejection"
                          >
                            ⚡ Test Direct Capture Before Approval (Returns 422)
                          </button>

                          {!isSimulatedOrderApproved ? (
                            <button
                              onClick={handleSimulatedBuyerApproval}
                              className="px-2.5 py-1.5 bg-[#0070BA] text-white rounded text-[11px] font-semibold hover:bg-[#005EA6] transition-colors cursor-pointer text-center"
                            >
                              Step 2: Sign-in & Approve as Sandbox Buyer
                            </button>
                          ) : (
                            <button
                              onClick={handleDirectCaptureAttempt}
                              disabled={checkoutStatus === 'CAPTURE_PENDING'}
                              className="px-2.5 py-1.5 bg-[#153E2E] text-white rounded text-[11px] font-semibold hover:bg-[#1E4D3A] transition-colors cursor-pointer disabled:opacity-50 text-center"
                            >
                              Step 3: Capture Payment (Verified)
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 5: COMPLETED ORDER & OFFICIAL RECEIPT                */}
      {/* ========================================================= */}
      {step === 'completed' && completedOrder && (
        <div className="bg-white border border-[#E3E7E4] rounded-xl p-8 shadow-xs max-w-2xl mx-auto space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-[#EEF4F0] text-[#153E2E] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-[#153E2E]" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EEF4F0] border border-[#C5DFC9] text-[#153E2E] text-xs font-bold rounded-full mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#153E2E]" />
              <span>PayPal Sandbox — Test Transaction</span>
            </div>
            <h3 className="text-xl font-bold text-[#19211C] font-display">
              Payment Captured & Verified
            </h3>
            <p className="text-xs text-[#637267]">
              Internal Order Reference:{' '}
              <span className="font-bold text-[#19211C]">
                {completedOrder.orderNumber}
              </span>
            </p>
          </div>

          <div className="p-4 bg-[#F9FAF9] border border-[#EAEFEA] rounded-lg text-left text-xs space-y-2.5 font-mono-data">
            <div className="flex justify-between">
              <span className="text-[#637267]">Payment Provider:</span>
              <span className="font-bold text-[#19211C]">
                PayPal Sandbox (Test Transaction)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">PayPal Order ID:</span>
              <span className="font-bold text-[#19211C]">
                {completedOrder.paypalOrderId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Actual Capture ID:</span>
              <span className="font-bold text-[#153E2E]">
                {completedOrder.paypalCaptureId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Payment Status:</span>
              <span className="font-bold text-[#153E2E] uppercase">
                {completedOrder.paymentStatus} (Verified)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Captured Total:</span>
              <span className="font-bold text-[#19211C]">
                ${completedOrder.grandTotal.toFixed(2)} {completedOrder.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Buyer Email:</span>
              <span className="text-[#19211C]">
                {completedOrder.buyerEmail}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Approval Timestamp:</span>
              <span>{new Date(completedOrder.approvalTimestamp).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#637267]">Capture Timestamp:</span>
              <span>{new Date(completedOrder.transactionTimestamp).toLocaleString()}</span>
            </div>
            {completedOrder.snapshotHashAtCheckout && (
              <div className="pt-2 border-t border-[#EAEFEA] text-[10px] space-y-0.5">
                <span className="text-[#637267] block">Purchase Pact Cryptographic Seal:</span>
                <span className="text-[#24523F] break-all">{completedOrder.snapshotHashAtCheckout}</span>
              </div>
            )}
          </div>

          {/* BoundBuy Delivery Schedule Card */}
          <div className="text-left">
            <DeliveryScheduleCard order={completedOrder} onOrderUpdated={setCompletedOrder} />
          </div>

          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <button
              onClick={() => generateOrderPdfReceipt(completedOrder)}
              className="px-5 py-2.5 bg-[#153E2E] text-white text-xs font-bold rounded-lg hover:bg-[#1E4D3A] transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#88D4A8]" />
              <span>Download Official PDF Receipt</span>
            </button>

            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-[#D5DDD7] hover:bg-[#F2F5F3] text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer text-[#19211C]"
            >
              <span>Print Invoice</span>
            </button>

            <button
              onClick={() => {
                setStep('input');
                setPromptInput('');
                setIntent(null);
                setPact(null);
                setCompletedOrder(null);
                setCheckoutStatus('IDLE');
                setCurrentPayPalOrderId(null);
                setIsSimulatedOrderCreated(false);
                setIsSimulatedOrderApproved(false);
              }}
              className="px-4 py-2 bg-[#F2F5F3] hover:bg-[#EAEFEA] text-[#19211C] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Start Another Procurement
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
