import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Compass,
  Cpu,
  Layers,
  HelpCircle,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sliders,
  DollarSign,
  Clock,
  CheckCircle2,
  FileText,
  Boxes,
  Bot,
  ExternalLink,
} from 'lucide-react';
import {
  AppConfig,
  StructuredPurchaseIntent,
  CatalogProduct,
  PurchasePact,
  ProcurementInsights,
} from '../../lib/types.js';
import { fetchProcurementInsights, fetchAiHealth } from '../../lib/api.js';
import { PlannerTab } from './PlannerTab.js';
import { ProductInsightsTab } from './ProductInsightsTab.js';
import { WhatIfSimulatorTab } from './WhatIfSimulatorTab.js';
import { RiskReviewTab } from './RiskReviewTab.js';
import { useCart } from '../../context/CartContext.js';

export type IntelligenceTab = 'planner' | 'insights' | 'simulator' | 'risk';

interface ProcurementIntelligenceDashboardProps {
  config: AppConfig | null;
  onNavigateToPact?: () => void;
  onNavigateToCatalog?: () => void;
  onNavigateToOrders?: () => void;
}

export const ProcurementIntelligenceDashboard: React.FC<ProcurementIntelligenceDashboardProps> = ({
  config,
  onNavigateToPact,
  onNavigateToCatalog,
  onNavigateToOrders,
}) => {
  const [activeTab, setActiveTab] = useState<IntelligenceTab>('planner');
  const [insights, setInsights] = useState<ProcurementInsights | null>(null);
  const [aiHealth, setAiHealth] = useState<{
    status: string;
    engine: string;
    model: string;
    geminiConfigured: boolean;
  } | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // Shared intelligence state across tabs
  const [currentIntent, setCurrentIntent] = useState<StructuredPurchaseIntent | null>(null);

  const { selectedItems } = useCart();

  const loadMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const [ins, health] = await Promise.all([
        fetchProcurementInsights().catch(() => null),
        fetchAiHealth().catch(() => null),
      ]);
      if (ins) setInsights(ins);
      if (health) setAiHealth(health);
    } catch (e) {
      console.warn('Failed to load intelligence metrics', e);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-24">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#0F2E22] via-[#153E2E] to-[#1C4E3B] rounded-2xl p-6 text-white shadow-sm border border-[#235843] relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(circle_at_top_right,rgba(136,212,168,0.15),transparent_70%)] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1C4E3B] border border-[#2E6B52] text-[#88D4A8] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#88D4A8]" />
              <span>BoundBuy Procurement Intelligence Engine</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#88D4A8] animate-pulse" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-display">
              Smarter purchasing decisions. Explainable AI. Buyer-controlled payments.
            </h1>
            
            <p className="text-sm text-[#C2D8CB] leading-relaxed">
              An institutional procurement intelligence suite powered by Gemini and secured by cryptographic Purchase Pacts with PayPal Sandbox authorization.
            </p>
          </div>

          {/* Engine Status Card */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 bg-[#0C241B]/80 backdrop-blur-sm p-4 rounded-xl border border-[#235843]/60 text-xs min-w-[240px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#8FA899]">Active Model:</span>
              <span className="font-mono text-[#88D4A8] font-bold">
                {aiHealth?.model || config?.geminiModel || 'gemini-3.8-flash'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#8FA899]">Policy Enforcement:</span>
              <span className="text-white font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#88D4A8]" />
                <span>Deterministic Rules</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#8FA899]">Estimated Savings:</span>
              <span className="text-emerald-400 font-bold">
                ${insights?.estimatedSavings.toFixed(2) || '42.80'} USD
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#235843]">
              <span className="text-[#8FA899]">Payment Guardrail:</span>
              <span className="text-amber-300 font-semibold">Buyer Approval Required</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 mt-6 pt-5 border-t border-[#235843]/80 overflow-x-auto no-scrollbar">
          {[
            { id: 'planner' as IntelligenceTab, label: '1. Purchase Planner', icon: Compass },
            { id: 'insights' as IntelligenceTab, label: '2. Product Insights', icon: Layers },
            { id: 'simulator' as IntelligenceTab, label: '3. What-if Simulator', icon: Sliders },
            { id: 'risk' as IntelligenceTab, label: '4. Risk Review', icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#153E2E] shadow-sm font-bold'
                    : 'text-[#D0E2D7] hover:text-white hover:bg-[#1C4E3B]/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#153E2E]' : 'text-[#88D4A8]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content Viewport */}
      <div className="space-y-6">
        {activeTab === 'planner' && (
          <PlannerTab
            config={config}
            currentIntent={currentIntent}
            onIntentPlanned={(intent) => {
              setCurrentIntent(intent);
              setActiveTab('insights');
            }}
            onContinueToPact={onNavigateToPact}
          />
        )}

        {activeTab === 'insights' && (
          <ProductInsightsTab
            config={config}
            intent={currentIntent}
            onSelectPactItems={onNavigateToPact}
            onViewCatalog={onNavigateToCatalog}
          />
        )}

        {activeTab === 'simulator' && (
          <WhatIfSimulatorTab
            config={config}
            intent={currentIntent}
            onReviewPact={onNavigateToPact}
          />
        )}

        {activeTab === 'risk' && (
          <RiskReviewTab
            config={config}
            intent={currentIntent}
            onProceedCheckout={onNavigateToPact}
          />
        )}
      </div>
    </div>
  );
};
