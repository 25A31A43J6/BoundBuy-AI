import React, { useState, useEffect } from 'react';
import {
  Layers,
  Sparkles,
  DollarSign,
  Zap,
  Award,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Info,
  ExternalLink,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import {
  AppConfig,
  StructuredPurchaseIntent,
  RecommendationStrategy,
  RecommendationResponse,
  ScoredProductRecommendation,
} from '../../lib/types.js';
import { fetchMultiStrategyRecommendations } from '../../lib/api.js';
import { useCart } from '../../context/CartContext.js';
import { ProductImage } from '../common/ProductImage.js';

interface ProductInsightsTabProps {
  config: AppConfig | null;
  intent: StructuredPurchaseIntent | null;
  onSelectPactItems?: () => void;
  onViewCatalog?: () => void;
}

const STRATEGIES: {
  id: RecommendationStrategy;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'best_match',
    label: 'Best Overall Match',
    description: 'Optimal balance of cost, material quality, and reliable supplier rating',
    icon: Sparkles,
  },
  {
    id: 'lowest_cost',
    label: 'Lowest Total Cost',
    description: 'Strict budget optimization minimizing per-unit cost and shipping fees',
    icon: DollarSign,
  },
  {
    id: 'quality_first',
    label: 'Quality & Eco First',
    description: 'Prioritizes GOTS organic textiles, post-consumer paper, and A+ sustainability',
    icon: Award,
  },
  {
    id: 'fastest_delivery',
    label: 'Fastest Eligible Delivery',
    description: 'Selects suppliers with guaranteed 1-2 day turnaround and next-day dispatch',
    icon: Zap,
  },
];

export const ProductInsightsTab: React.FC<ProductInsightsTabProps> = ({
  config,
  intent,
  onSelectPactItems,
  onViewCatalog,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<RecommendationStrategy>('best_match');
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal / detail view for source data
  const [inspectItem, setInspectItem] = useState<ScoredProductRecommendation | null>(null);

  const { addProduct, clearSelection } = useCart();

  // Fallback demo intent if none is passed in from Planner
  const activeIntent: StructuredPurchaseIntent = intent || {
    id: 'demo_intent',
    rawPrompt: 'Default college event procurement',
    purchaseGoal: 'College event kits for 50 attendees',
    budgetLimit: 150,
    currency: 'USD',
    categories: ['event_supplies', 'office_stationery'],
    requiredItems: [
      { categoryOrName: 'notebooks', quantity: 30, mandatoryAttributes: ['recycled'] },
      { categoryOrName: 'tote bags', quantity: 30, mandatoryAttributes: ['cotton'] },
    ],
    optionalPreferences: ['Eco-friendly preferred'],
    shippingDeadlineDays: 4,
    allowSubstitutions: false,
    missingInformation: [],
    clarificationQuestions: [],
    isClarificationNeeded: false,
    createdAt: new Date().toISOString(),
  };

  const loadRecommendations = async (strategy: RecommendationStrategy) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchMultiStrategyRecommendations(activeIntent, strategy);
      setResponse(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate multi-strategy recommendations.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations(selectedStrategy);
  }, [selectedStrategy, activeIntent.id]);

  const handleApplyToCartAndPact = () => {
    if (!response) return;
    clearSelection();
    response.scoredItems.forEach((item) => {
      addProduct(item.product, item.quantity);
    });
    if (onSelectPactItems) {
      onSelectPactItems();
    }
  };

  return (
    <div className="space-y-6">
      {/* Strategy Switcher Bar */}
      <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#19211C] font-display flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#153E2E]" />
              <span>Recommendation Strategies</span>
            </h2>
            <p className="text-xs text-[#637267]">
              Deterministic hard constraint filtering + Gemini trade-off synthesis
            </p>
          </div>

          <div className="text-xs font-semibold text-[#153E2E] bg-[#EEF4F0] px-3 py-1 rounded-full">
            Goal: {activeIntent.purchaseGoal} (Max: ${activeIntent.budgetLimit.toFixed(2)})
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STRATEGIES.map((strat) => {
            const Icon = strat.icon;
            const isSelected = selectedStrategy === strat.id;
            return (
              <button
                key={strat.id}
                onClick={() => setSelectedStrategy(strat.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1.5 ${
                  isSelected
                    ? 'bg-[#EEF4F0] border-[#153E2E] ring-1 ring-[#153E2E]'
                    : 'bg-[#FBFBFA] border-[#E8ECE8] hover:border-[#153E2E]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#19211C]">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#153E2E]' : 'text-[#79887D]'}`} />
                    <span>{strat.label}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#153E2E]" />}
                </div>
                <p className="text-[11px] text-[#637267] leading-relaxed line-clamp-2">
                  {strat.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="p-12 bg-white rounded-2xl border border-[#E3E7E4] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#153E2E] animate-spin" />
          <p className="text-xs text-[#637267] font-medium">
            Evaluating catalog SKUs against {selectedStrategy.replace('_', ' ')} criteria...
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Recommendations Display */}
      {!isLoading && response && (
        <div className="space-y-6">
          {/* Executive Strategy Brief */}
          <div className="bg-[#F8FAF8] border border-[#DCE4DE] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#153E2E] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Strategy Trade-Off Synthesis</span>
              </span>
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${
                response.totals.withinBudget
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                Total: ${response.totals.grandTotal.toFixed(2)} / ${activeIntent.budgetLimit.toFixed(2)}
              </span>
            </div>

            <p className="text-xs text-[#19211C] font-medium leading-relaxed">
              {response.explanation.executiveSummary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#E8ECE8] text-[11px]">
              <div className="space-y-0.5">
                <span className="font-bold text-[#4F5E53]">Alternative Trade-Offs:</span>
                <p className="text-[#637267] leading-relaxed">
                  {response.explanation.alternativeTradeOffs}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-[#4F5E53]">Budget Headroom:</span>
                <p className="text-[#637267] leading-relaxed">
                  {response.explanation.budgetUtilization}
                </p>
              </div>
            </div>
          </div>

          {/* Recommended SKU Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {response.scoredItems.map((item, idx) => (
              <div
                key={`${item.product.id}-${idx}`}
                className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#D5DDD7] bg-[#F4F6F4]">
                        <ProductImage
                          productId={item.product.id}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#153E2E] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            #{item.strategyRank}
                          </span>
                          <span className="text-xs font-bold text-[#19211C] line-clamp-1">
                            {item.product.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#637267] truncate block mt-0.5">
                          Supplier: {item.product.supplierName}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-extrabold text-[#19211C]">
                        ${item.product.unitPrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-[#79887D] block">/ unit</span>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] bg-[#EEF4F0] text-[#153E2E] font-bold px-2 py-0.5 rounded">
                      Match: {item.matchScore}%
                    </span>
                    {item.highlightBadges.map((badge, bIdx) => (
                      <span
                        key={bIdx}
                        className="text-[10px] bg-[#F4F6F4] text-[#4F5E53] px-2 py-0.5 rounded border border-[#E3E7E4]"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>

                  {/* AI Explanation & Trade-offs */}
                  <div className="p-3 bg-[#FBFBFA] border border-[#E8ECE8] rounded-xl text-xs space-y-1.5">
                    <div>
                      <span className="font-bold text-[#19211C] text-[11px]">Why Recommended:</span>
                      <p className="text-[11px] text-[#4F5E53] leading-relaxed">
                        {item.whyRecommended}
                      </p>
                    </div>
                    <div>
                      <span className="font-bold text-[#19211C] text-[11px]">Trade-Offs:</span>
                      <p className="text-[11px] text-[#637267] leading-relaxed">
                        {item.tradeOffs}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer: Line Total & Source Data Action */}
                <div className="pt-3 border-t border-[#F0F2F0] flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-[#79887D]">Required Qty: {item.quantity}</span>
                    <div className="font-bold text-[#19211C]">
                      Line Total: ${item.lineTotal.toFixed(2)}
                    </div>
                  </div>

                  <button
                    onClick={() => setInspectItem(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F4F6F4] hover:bg-[#EEF4F0] text-[#153E2E] rounded-lg text-xs font-semibold cursor-pointer transition-colors border border-[#DCE4DE]"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Inspect Evidence</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action Bar: Adopt Strategy */}
          <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[#19211C]">
                Ready to seal these recommendations into a Purchase Pact?
              </div>
              <p className="text-xs text-[#637267]">
                Calculated Grand Total: ${response.totals.grandTotal.toFixed(2)} (Subtotal: ${response.totals.subtotal.toFixed(2)} + Shipping: ${response.totals.shipping.toFixed(2)})
              </p>
            </div>

            <div className="flex items-center gap-2">
              {onViewCatalog && (
                <button
                  onClick={onViewCatalog}
                  className="px-4 py-2 border border-[#DCE4DE] hover:bg-[#F4F6F4] text-[#19211C] rounded-xl text-xs font-bold cursor-pointer"
                >
                  Browse Catalog
                </button>
              )}
              <button
                onClick={handleApplyToCartAndPact}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-[#88D4A8]" />
                <span>Adopt Plan & Form Purchase Pact</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source Data Inspect Modal */}
      {inspectItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[#E3E7E4]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#D5DDD7] bg-[#F4F6F4]">
                  <ProductImage
                    productId={inspectItem.product.id}
                    alt={inspectItem.product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#153E2E] bg-[#EEF4F0] px-2 py-0.5 rounded">
                    SKU Evidence Verification
                  </span>
                  <h3 className="text-sm font-bold text-[#19211C] mt-1 font-display">
                    {inspectItem.product.name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setInspectItem(null)}
                className="text-[#79887D] hover:text-[#19211C] text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-[#F8FAF8] p-3 rounded-xl border border-[#E8ECE8]">
                <div>
                  <span className="text-[10px] text-[#79887D]">Catalog ID:</span>
                  <div className="font-mono font-bold text-[#19211C]">{inspectItem.product.id}</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D]">Supplier Name:</span>
                  <div className="font-bold text-[#19211C]">{inspectItem.product.supplierName}</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D]">Available Stock:</span>
                  <div className="font-bold text-emerald-800">{inspectItem.sourceData.stockAvailable} units</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D]">Transit Days:</span>
                  <div className="font-bold text-[#19211C]">{inspectItem.sourceData.estimatedDeliveryDays} calendar days</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D]">Supplier Rating:</span>
                  <div className="font-bold text-[#19211C]">★ {inspectItem.sourceData.supplierRating} / 5.0</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D]">Sustainability Grade:</span>
                  <div className="font-bold text-emerald-700">{inspectItem.sourceData.sustainabilityRating}</div>
                </div>
              </div>

              {inspectItem.sourceData.certifications.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-[#19211C]">Verified Certifications:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {inspectItem.sourceData.certifications.map((c, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 text-[10px]">
                        ✓ {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#F0F2F0] flex justify-end">
              <button
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 bg-[#153E2E] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Evidence Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
