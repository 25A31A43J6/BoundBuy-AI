import React, { useState } from 'react';
import {
  Compass,
  Sparkles,
  Send,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Edit3,
  Layers,
} from 'lucide-react';
import { AppConfig, StructuredPurchaseIntent } from '../../lib/types.js';
import { planPurchaseWithAi, clarifyPurchaseWithAi } from '../../lib/api.js';

interface PlannerTabProps {
  config: AppConfig | null;
  currentIntent: StructuredPurchaseIntent | null;
  onIntentPlanned: (intent: StructuredPurchaseIntent) => void;
  onContinueToPact?: () => void;
}

const EXAMPLE_PROMPTS = [
  'I am organizing a college event for 50 students. I need notebooks, reusable bags and name badges. Keep the total under $150 including shipping. Quality matters, and delivery must be before Friday.',
  'Need 4 ergonomic LED desk lamps for our new workspace studio under $180 total with fast delivery. Organic or sustainable materials preferred.',
  'Order 100 compostable cups and 2 bags of organic whole bean coffee for the department meeting under $75. Strict no substitutions.',
];

export const PlannerTab: React.FC<PlannerTabProps> = ({
  config,
  currentIntent,
  onIntentPlanned,
  onContinueToPact,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active plan & conversational history
  const [intent, setIntent] = useState<StructuredPurchaseIntent | null>(currentIntent);
  const [conversationHistory, setConversationHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [clarificationInput, setClarificationInput] = useState('');

  const handlePlan = async (text: string) => {
    if (!text.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);

    const history = [...conversationHistory, { role: 'user' as const, content: text }];
    setConversationHistory(history);

    try {
      const res = await planPurchaseWithAi(text, conversationHistory);
      setIntent(res.intent);
      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Planned: ${res.intent.purchaseGoal}. Budget: $${res.intent.budgetLimit} ${res.intent.currency}. ${
            res.intent.isClarificationNeeded
              ? `Clarifications needed: ${res.intent.clarificationQuestions.join(' ')}`
              : 'All constraints extracted successfully.'
          }`,
        },
      ]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to process purchase plan with Gemini AI.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarify = async () => {
    if (!clarificationInput.trim() || !intent) return;
    setIsLoading(true);
    setErrorMessage(null);

    const userText = clarificationInput;
    setClarificationInput('');
    const history = [...conversationHistory, { role: 'user' as const, content: userText }];
    setConversationHistory(history);

    try {
      const res = await clarifyPurchaseWithAi(userText, intent.id, history);
      setIntent(res.intent);
      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Updated requirements: ${res.intent.purchaseGoal}. Budget: $${res.intent.budgetLimit} ${res.intent.currency}.`,
        },
      ]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to clarify purchase plan.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Input & Clarification Panel */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#EEF4F0] text-[#153E2E]">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#19211C] font-display">
                Intelligent Purchase Planner
              </h2>
              <p className="text-xs text-[#637267]">
                Natural language goal extraction & relative calendar date calculation
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePlan(promptInput);
            }}
            className="space-y-3"
          >
            <div className="relative">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe your procurement goal (e.g. 50 notebooks and 50 bags under $150 by Friday)..."
                rows={4}
                className="w-full text-xs p-3 rounded-xl border border-[#DCE4DE] focus:border-[#153E2E] focus:ring-1 focus:ring-[#153E2E] focus:outline-none resize-none placeholder:text-[#8E9B92]"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#79887D]">
                Uses configured Gemini model
              </span>
              <button
                type="submit"
                disabled={isLoading || !promptInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[#88D4A8]" />
                    <span>Plan Procurement</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Preset Prompts */}
          <div className="pt-2 border-t border-[#F0F2F0] space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887D]">
              Try institutional scenarios:
            </span>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPromptInput(sample);
                    handlePlan(sample);
                  }}
                  className="w-full text-left text-[11px] p-2.5 rounded-lg bg-[#F8FAF8] hover:bg-[#EEF4F0] text-[#19211C] border border-[#E8ECE8] transition-colors leading-relaxed cursor-pointer"
                >
                  "{sample}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Conversational Refinement & Clarification Box */}
        {intent && (
          <div className="bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#19211C] flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-[#153E2E]" />
                <span>Conversational Refinement</span>
              </span>
              <span className="text-[10px] bg-[#EEF4F0] text-[#153E2E] px-2 py-0.5 rounded-full font-bold">
                Live Intent ID: {intent.id.substring(0, 12)}
              </span>
            </div>

            <p className="text-[11px] text-[#637267] leading-relaxed">
              Refine your request conversationally (e.g. "Actually make it 60 notebooks", "Strict organic cotton only", or answer any clarification questions).
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={clarificationInput}
                onChange={(e) => setClarificationInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleClarify()}
                placeholder="Clarify or modify requirements..."
                className="flex-1 text-xs px-3 py-2 rounded-xl border border-[#DCE4DE] focus:border-[#153E2E] focus:outline-none"
              />
              <button
                onClick={handleClarify}
                disabled={isLoading || !clarificationInput.trim()}
                className="px-3 py-2 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Right Extracted Intent & Constraints Viewer */}
      <div className="lg:col-span-7">
        {intent ? (
          <div className="bg-white border border-[#E3E7E4] rounded-2xl p-6 shadow-xs space-y-6">
            {/* Goal Banner */}
            <div className="space-y-2 border-b border-[#F0F2F0] pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#153E2E] bg-[#EEF4F0] px-2 py-0.5 rounded">
                  Validated Purchase Intent
                </span>
                <span className="text-[11px] text-[#79887D]">
                  Created {new Date(intent.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h3 className="text-base font-bold text-[#19211C] font-display">
                {intent.purchaseGoal}
              </h3>
            </div>

            {/* Key Constraint Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
                <div className="text-[10px] font-semibold text-[#79887D] uppercase">Budget Ceiling</div>
                <div className="text-base font-extrabold text-[#19211C] mt-0.5">
                  ${intent.budgetLimit.toFixed(2)}
                </div>
                <div className="text-[10px] text-[#637267] mt-0.5">{intent.currency} max</div>
              </div>

              <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
                <div className="text-[10px] font-semibold text-[#79887D] uppercase">Delivery Target</div>
                <div className="text-base font-extrabold text-[#19211C] mt-0.5">
                  {intent.shippingDeadlineDays ? `≤ ${intent.shippingDeadlineDays} Days` : 'Flexible'}
                </div>
                <div className="text-[10px] text-[#637267] mt-0.5">
                  {intent.shippingDeadlineDate ? `By ${intent.shippingDeadlineDate}` : 'No hard deadline'}
                </div>
              </div>

              <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
                <div className="text-[10px] font-semibold text-[#79887D] uppercase">Substitutions</div>
                <div className={`text-base font-extrabold mt-0.5 ${intent.allowSubstitutions ? 'text-amber-700' : 'text-[#153E2E]'}`}>
                  {intent.allowSubstitutions ? 'Permitted' : 'Strict (No)'}
                </div>
                <div className="text-[10px] text-[#637267] mt-0.5">
                  {intent.allowSubstitutions ? 'Alternatives allowed' : 'Exact match only'}
                </div>
              </div>

              <div className="p-3 bg-[#F8FAF8] rounded-xl border border-[#E8ECE8]">
                <div className="text-[10px] font-semibold text-[#79887D] uppercase">Items Required</div>
                <div className="text-base font-extrabold text-[#19211C] mt-0.5">
                  {intent.requiredItems.length} Categories
                </div>
                <div className="text-[10px] text-[#637267] mt-0.5">
                  {intent.requiredItems.reduce((acc, i) => acc + i.quantity, 0)} total units
                </div>
              </div>
            </div>

            {/* Extracted Required Line Items */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
                Extracted Line Item Requirements & Budget Allocation
              </h4>
              <div className="space-y-2">
                {intent.requiredItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-[#FBFBFA] border border-[#E8ECE8] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#19211C]">{item.categoryOrName}</span>
                        <span className="px-2 py-0.5 bg-[#EEF4F0] text-[#153E2E] font-bold rounded text-[10px]">
                          Qty: {item.quantity}
                        </span>
                      </div>
                      {item.mandatoryAttributes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.mandatoryAttributes.map((attr, aIdx) => (
                            <span
                              key={aIdx}
                              className="text-[10px] bg-white border border-[#DCE4DE] text-[#4F5E53] px-1.5 py-0.5 rounded"
                            >
                              Mandatory: {attr}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-[#637267]">Target Allocation</span>
                      <div className="font-bold text-[#19211C]">
                        ~${((intent.budgetLimit / intent.requiredItems.length) * 0.9).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Missing Info & Clarification Warnings */}
            {intent.isClarificationNeeded && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Clarification Recommended Before Purchase</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[#78350F] text-[11px]">
                  {intent.clarificationQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps Actions */}
            <div className="pt-4 border-t border-[#F0F2F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[11px] text-[#79887D]">
                Plan ready for sourcing across 5 verified suppliers
              </span>
              <button
                onClick={() => onIntentPlanned(intent)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                <Layers className="w-3.5 h-3.5 text-[#88D4A8]" />
                <span>Investigate Product Recommendations</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full min-h-[350px] bg-white border border-dashed border-[#DCE4DE] rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#EEF4F0] flex items-center justify-center text-[#153E2E]">
              <Sparkles className="w-6 h-6 text-[#153E2E]" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-bold text-[#19211C]">
                Ready for Procurement Intelligence
              </h3>
              <p className="text-xs text-[#637267] leading-relaxed">
                Enter your buying goal or select one of the institutional presets to begin extraction and schedule modeling.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
