import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Info,
  Lock,
} from 'lucide-react';
import {
  AppConfig,
  StructuredPurchaseIntent,
  RiskAnalysisResult,
  RiskFlag,
} from '../../lib/types.js';
import { reviewPurchaseRisks } from '../../lib/api.js';
import { useCart } from '../../context/CartContext.js';

interface RiskReviewTabProps {
  config: AppConfig | null;
  intent: StructuredPurchaseIntent | null;
  onProceedCheckout?: () => void;
}

export const RiskReviewTab: React.FC<RiskReviewTabProps> = ({
  config,
  intent,
  onProceedCheckout,
}) => {
  const { selectedItems } = useCart();

  const baselineItems =
    selectedItems.length > 0
      ? selectedItems.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
      : [
          { productId: 'prod_tote_canvas_premium', quantity: 30 },
          { productId: 'prod_notebook_recycled_a5', quantity: 30 },
        ];

  const budgetLimit = intent?.budgetLimit || 150;
  const deadlineDays = intent?.shippingDeadlineDays ?? 4;

  const [riskData, setRiskData] = useState<RiskAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'blockers' | 'warnings'>('all');

  const runAudit = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await reviewPurchaseRisks(baselineItems, budgetLimit, deadlineDays);
      setRiskData(res.riskAnalysis);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Risk review analysis failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [baselineItems.length, budgetLimit, deadlineDays]);

  const filteredFlags = riskData?.flags.filter((flag) => {
    if (filterSeverity === 'blockers') return flag.isBlocker;
    if (filterSeverity === 'warnings') return !flag.isBlocker;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header Overview Card */}
      <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#153E2E] bg-[#EEF4F0] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Deterministic Sourcing Guardrail</span>
              </span>
              <span className="text-xs text-[#79887D]">
                Evaluated: {baselineItems.length} active SKUs
              </span>
            </div>
            <h2 className="text-base font-bold text-[#19211C] font-display">
              Explainable Purchase Risk Analyst
            </h2>
            <p className="text-xs text-[#637267]">
              Multi-dimensional audit spanning pricing anomalies, supplier headroom, transit conflict, and policy ceilings
            </p>
          </div>

          <button
            onClick={runAudit}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F4F6F4] hover:bg-[#EEF4F0] text-[#153E2E] rounded-xl text-xs font-bold border border-[#DCE4DE] cursor-pointer transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-evaluate Evidence</span>
          </button>
        </div>

        {/* Quick KPI Metric Chips */}
        {riskData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#F0F2F0]">
            <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
              <span className="text-[10px] font-semibold text-[#79887D] uppercase">Overall Risk Level</span>
              <div className={`text-base font-extrabold mt-0.5 ${
                riskData.overallRiskLevel === 'CRITICAL'
                  ? 'text-red-700'
                  : riskData.overallRiskLevel === 'HIGH'
                  ? 'text-orange-700'
                  : riskData.overallRiskLevel === 'MEDIUM'
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}>
                {riskData.overallRiskLevel}
              </div>
            </div>

            <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
              <span className="text-[10px] font-semibold text-[#79887D] uppercase">Hard Blockers</span>
              <div className="text-base font-extrabold text-[#19211C] mt-0.5">
                {riskData.hardBlockersCount} issues
              </div>
              <span className="text-[10px] text-[#637267]">Must resolve to buy</span>
            </div>

            <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
              <span className="text-[10px] font-semibold text-[#79887D] uppercase">Advisory Warnings</span>
              <div className="text-base font-extrabold text-[#19211C] mt-0.5">
                {riskData.warningsCount} notices
              </div>
              <span className="text-[10px] text-[#637267]">Informational notices</span>
            </div>

            <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
              <span className="text-[10px] font-semibold text-[#79887D] uppercase">Checkout Clearance</span>
              <div className={`text-base font-extrabold mt-0.5 ${
                riskData.canProceedToCheckout ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {riskData.canProceedToCheckout ? 'CLEARED' : 'BLOCKED'}
              </div>
              <span className="text-[10px] text-[#637267]">
                {riskData.canProceedToCheckout ? 'All rules passed' : 'Guardrails active'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* AI Synthesis Executive Brief */}
      {riskData && (
        <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
          riskData.canProceedToCheckout
            ? 'bg-[#F4F9F6] border-[#D0E6D8] text-[#153E2E]'
            : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Executive Synthesis</span>
            </span>
            <span className="text-[10px]">
              Evaluated {new Date(riskData.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs leading-relaxed font-medium">
            {riskData.executiveSummary}
          </p>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex items-center gap-2">
        {[
          { id: 'all', label: `All Findings (${riskData?.flags.length || 0})` },
          { id: 'blockers', label: `Hard Blockers (${riskData?.hardBlockersCount || 0})` },
          { id: 'warnings', label: `Advisory Notices (${riskData?.warningsCount || 0})` },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterSeverity(f.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              filterSeverity === f.id
                ? 'bg-[#153E2E] text-white font-bold'
                : 'bg-white border border-[#DCE4DE] text-[#4F5E53] hover:bg-[#F4F6F4]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Risk Flags List */}
      <div className="space-y-3">
        {filteredFlags.length > 0 ? (
          filteredFlags.map((flag, idx) => {
            const isBlocker = flag.isBlocker;
            return (
              <div
                key={`${flag.id}-${idx}`}
                className={`bg-white border rounded-2xl p-5 shadow-xs space-y-3 transition-colors ${
                  isBlocker ? 'border-red-300' : 'border-[#E3E7E4]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      flag.severity === 'CRITICAL'
                        ? 'bg-red-100 text-red-800'
                        : flag.severity === 'HIGH'
                        ? 'bg-orange-100 text-orange-800'
                        : flag.severity === 'MEDIUM'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {flag.severity}
                    </span>

                    <span className="font-bold text-xs text-[#19211C]">
                      {flag.title}
                    </span>

                    <span className="text-[10px] text-[#79887D] font-mono">
                      [{flag.category}]
                    </span>
                  </div>

                  <div className="shrink-0">
                    {isBlocker ? (
                      <span className="text-[10px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                        ⛔ HARD BLOCKER (Checkout Disabled)
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        ℹ️ ADVISORY WARNING (Checkout Allowed)
                      </span>
                    )}
                  </div>
                </div>

                {/* Evidence Box */}
                <div className="p-3 bg-[#FBFBFA] border border-[#E8ECE8] rounded-xl text-xs space-y-1.5">
                  <div>
                    <span className="font-bold text-[#19211C] text-[11px]">Direct Empirical Evidence:</span>
                    <p className="text-[11px] text-[#4F5E53] leading-relaxed">
                      {flag.evidence}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-[#19211C] text-[11px]">Contextual Explanation:</span>
                    <p className="text-[11px] text-[#637267] leading-relaxed">
                      {flag.explanation}
                    </p>
                  </div>
                </div>

                {/* Recommended Remediation */}
                <div className="pt-2 border-t border-[#F0F2F0] flex items-center justify-between text-xs">
                  <div className="text-[11px] text-[#19211C]">
                    <span className="font-bold text-[#153E2E]">Recommended Action: </span>
                    <span>{flag.recommendedAction}</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 bg-white border border-[#E3E7E4] rounded-2xl text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h4 className="text-sm font-bold text-[#19211C]">
              Zero Matching Risk Flags
            </h4>
            <p className="text-xs text-[#637267]">
              All items in the current selection comply with empirical safety benchmarks.
            </p>
          </div>
        )}
      </div>

      {/* Checkout Guidance Footer */}
      {riskData && (
        <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-[#19211C]">
              Procurement Audit Status
            </span>
            <p className="text-xs text-[#637267]">
              {riskData.canProceedToCheckout
                ? 'All mandatory risk checks passed. Ready for Purchase Pact approval.'
                : `${riskData.hardBlockersCount} blocker(s) require remediation before buyer sign-off.`}
            </p>
          </div>

          {onProceedCheckout && (
            <button
              onClick={onProceedCheckout}
              disabled={!riskData.canProceedToCheckout}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-colors shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 text-[#88D4A8]" />
              <span>Proceed to Purchase Pact</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
