import React, { useState, useEffect } from 'react';
import {
  Sliders,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  DollarSign,
  Package,
  Truck,
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import {
  AppConfig,
  StructuredPurchaseIntent,
  WhatIfScenarioInput,
  WhatIfSimulationResult,
} from '../../lib/types.js';
import { runWhatIfSimulation } from '../../lib/api.js';
import { useCart } from '../../context/CartContext.js';

interface WhatIfSimulatorTabProps {
  config: AppConfig | null;
  intent: StructuredPurchaseIntent | null;
  onReviewPact?: () => void;
}

export const WhatIfSimulatorTab: React.FC<WhatIfSimulatorTabProps> = ({
  config,
  intent,
  onReviewPact,
}) => {
  const { selectedItems } = useCart();

  // Baseline items: use current cart or fallback default sample items
  const baselineItems =
    selectedItems.length > 0
      ? selectedItems.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
      : [
          { productId: 'prod_tote_canvas_premium', quantity: 30 },
          { productId: 'prod_notebook_recycled_a5', quantity: 30 },
        ];

  const budgetLimit = intent?.budgetLimit || 150;

  const [scenarioType, setScenarioType] = useState<WhatIfScenarioInput['scenarioType']>('PRICE_INCREASE');
  const [percentageChange, setPercentageChange] = useState<number>(15);
  const [quantityDelta, setQuantityDelta] = useState<number>(20);
  const [shippingSurcharge, setShippingSurcharge] = useState<number>(12);
  const [budgetCap, setBudgetCap] = useState<number>(110);

  const [simulation, setSimulation] = useState<WhatIfSimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSimulate = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const scenario: WhatIfScenarioInput = {
      scenarioType,
      targetProductId: baselineItems[0]?.productId,
      percentageChange,
      newQuantity: (baselineItems[0]?.quantity || 10) + quantityDelta,
      shippingSurcharge,
      budgetCap,
    };

    try {
      const res = await runWhatIfSimulation(scenario, baselineItems, budgetLimit);
      setSimulation(res.simulation);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Simulation evaluation failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleSimulate();
  }, [scenarioType]);

  return (
    <div className="space-y-6">
      {/* Sandbox Isolation Header */}
      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 text-[#92400E] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#FEF3C7] text-amber-700">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-amber-900 block">
              Simulation Sandbox Active
            </span>
            <span className="text-[11px] text-[#78350F]">
              Hypothetical modeling only. Zero actual catalog prices, stock, or PayPal transactions are altered.
            </span>
          </div>
        </div>

        <div className="text-[11px] font-semibold bg-white px-2.5 py-1 rounded-md border border-[#FDE68A] text-amber-900 shrink-0">
          State: Read-Only Simulation
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Scenario Control Panel */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#19211C] font-display flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#153E2E]" />
                <span>Scenario Parameters</span>
              </h3>
              <span className="text-[10px] bg-[#EEF4F0] text-[#153E2E] font-bold px-2 py-0.5 rounded">
                7 Scenarios
              </span>
            </div>

            {/* Scenario Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#4F5E53] uppercase">
                Select What-If Event:
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  {
                    id: 'PRICE_INCREASE',
                    label: 'Product Price Spike (+15%)',
                    desc: 'Simulate inflation or raw material surcharge',
                  },
                  {
                    id: 'OUT_OF_STOCK',
                    label: 'Supplier Stockout (0 stock)',
                    desc: 'Item suddenly unavailable before checkout',
                  },
                  {
                    id: 'QUANTITY_CHANGE',
                    label: 'Order Volume Scaling (+20 units)',
                    desc: 'Higher attendance or team scale requirements',
                  },
                  {
                    id: 'SHIPPING_HIKE',
                    label: 'Logistics Surge (+$12.00 fee)',
                    desc: 'Carrier fuel rate or peak season surcharge',
                  },
                  {
                    id: 'EXPEDITED_DELIVERY',
                    label: 'Priority Express Delivery (1-day dispatch)',
                    desc: 'Guaranteed 24-hr turnaround upgrade',
                  },
                  {
                    id: 'ALTERNATIVE_SUPPLIER',
                    label: 'Supplier Migration',
                    desc: 'Switch to alternative catalog provider',
                  },
                  {
                    id: 'BUDGET_TIGHTENING',
                    label: 'Budget Ceiling Reduction',
                    desc: 'Organization reduces authorized spending limit',
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setScenarioType(s.id as WhatIfScenarioInput['scenarioType'])}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                      scenarioType === s.id
                        ? 'bg-[#EEF4F0] border-[#153E2E] font-bold text-[#153E2E]'
                        : 'bg-[#FBFBFA] border-[#E8ECE8] text-[#19211C] hover:bg-[#F4F6F4]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{s.label}</span>
                      {scenarioType === s.id && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-[10px] text-[#637267] block font-normal">
                      {s.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario Variable Controls */}
            {scenarioType === 'PRICE_INCREASE' && (
              <div className="space-y-1.5 pt-2 border-t border-[#F0F2F0]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#4F5E53]">Price Spike Percentage:</span>
                  <span className="font-bold text-[#19211C]">+{percentageChange}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={percentageChange}
                  onChange={(e) => setPercentageChange(Number(e.target.value))}
                  className="w-full accent-[#153E2E]"
                />
              </div>
            )}

            {scenarioType === 'QUANTITY_CHANGE' && (
              <div className="space-y-1.5 pt-2 border-t border-[#F0F2F0]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#4F5E53]">Additional Quantity:</span>
                  <span className="font-bold text-[#19211C]">+{quantityDelta} units</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={quantityDelta}
                  onChange={(e) => setQuantityDelta(Number(e.target.value))}
                  className="w-full accent-[#153E2E]"
                />
              </div>
            )}

            {scenarioType === 'BUDGET_TIGHTENING' && (
              <div className="space-y-1.5 pt-2 border-t border-[#F0F2F0]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#4F5E53]">New Constrained Budget:</span>
                  <span className="font-bold text-[#19211C]">${budgetCap.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="140"
                  step="10"
                  value={budgetCap}
                  onChange={(e) => setBudgetCap(Number(e.target.value))}
                  className="w-full accent-[#153E2E]"
                />
              </div>
            )}

            <button
              onClick={handleSimulate}
              disabled={isLoading}
              className="w-full py-2.5 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing Sandbox Impact...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#88D4A8]" />
                  <span>Run What-If Simulation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Simulation Results & Impact Analysis */}
        <div className="lg:col-span-7">
          {simulation ? (
            <div className="bg-white border border-[#E3E7E4] rounded-2xl p-6 shadow-xs space-y-6">
              {/* Header Description */}
              <div className="space-y-1 border-b border-[#F0F2F0] pb-4">
                <span className="text-[10px] font-bold text-[#153E2E] bg-[#EEF4F0] px-2 py-0.5 rounded">
                  Simulation Outcome
                </span>
                <h3 className="text-sm font-bold text-[#19211C] font-display">
                  {simulation.scenarioDescription}
                </h3>
              </div>

              {/* Side-by-side Financial Impact Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8] space-y-1">
                  <span className="text-[10px] font-semibold text-[#79887D] uppercase">Original Total</span>
                  <div className="text-base font-extrabold text-[#19211C]">
                    ${simulation.originalGrandTotal.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-[#637267] block">
                    Subtotal: ${simulation.originalSubtotal.toFixed(2)}
                  </span>
                </div>

                <div className="p-3.5 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8] space-y-1">
                  <span className="text-[10px] font-semibold text-[#79887D] uppercase">Simulated Total</span>
                  <div className="text-base font-extrabold text-[#19211C]">
                    ${simulation.simulatedGrandTotal.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-[#637267] block">
                    Subtotal: ${simulation.simulatedSubtotal.toFixed(2)}
                  </span>
                </div>

                <div className={`p-3.5 rounded-xl border space-y-1 ${
                  simulation.budgetDifference > 0
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : simulation.budgetDifference < 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}>
                  <span className="text-[10px] font-semibold uppercase">Financial Variance</span>
                  <div className="text-base font-extrabold">
                    {simulation.budgetDifference > 0 ? '+' : ''}${simulation.budgetDifference.toFixed(2)}
                  </div>
                  <span className="text-[10px] block">
                    {simulation.isOverBudget
                      ? '⚠️ Over Budget Limit'
                      : `$${simulation.budgetRemainingOrExcess.toFixed(2)} headroom`}
                  </span>
                </div>
              </div>

              {/* Purchase Pact Guardrail Integrity Impact Banner */}
              <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                simulation.pactApprovalImpact === 'INVALIDATED'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {simulation.pactApprovalImpact === 'INVALIDATED' ? (
                    <>
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Pact Integrity Impact: Earlier Approval Would Be INVALIDATED</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Pact Integrity Impact: PRESERVED</span>
                    </>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed">
                  {simulation.approvalInvalidationReason ||
                    'Terms remain compliant with earlier signed specifications.'}
                </p>
              </div>

              {/* Ineligible Items or Affected Rules */}
              {simulation.ineligibleProducts.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs space-y-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span>Ineligible Products Identified:</span>
                  </span>
                  <div className="space-y-1">
                    {simulation.ineligibleProducts.map((p, idx) => (
                      <div key={idx} className="text-[11px] bg-white p-2 rounded border border-red-200">
                        <span className="font-bold">{p.name}</span> — {p.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Commercial Explanation */}
              <div className="p-4 bg-[#F8FAF8] border border-[#DCE4DE] rounded-xl text-xs space-y-2">
                <span className="font-bold text-[#153E2E] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Commercial Assessment</span>
                </span>
                <p className="text-[11px] text-[#19211C] leading-relaxed">
                  {simulation.aiExplanation}
                </p>
                <div className="pt-2 border-t border-[#E8ECE8] text-[11px] text-[#4F5E53]">
                  <span className="font-bold">Recommended Mitigation: </span>
                  <span>{simulation.suggestedAction}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-[#F0F2F0] flex items-center justify-between">
                <span className="text-[10px] text-[#79887D]">
                  Ready to apply or revise actual purchase terms?
                </span>
                {onReviewPact && (
                  <button
                    onClick={onReviewPact}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <span>Review Active Purchase Pact</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[350px] bg-white border border-dashed border-[#DCE4DE] rounded-2xl flex items-center justify-center p-8 text-center">
              <RefreshCw className="w-6 h-6 text-[#153E2E] animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
