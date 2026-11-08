import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  Receipt,
  ShieldCheck,
  Clock,
  ArrowRight,
  ExternalLink,
  Lock,
  RefreshCw,
  FileText,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { askPostPurchaseAssistant } from '../../lib/api.js';
import { AssistantGroundedRecord } from '../../lib/types.js';

interface AssistantTabProps {
  onNavigateOrders?: () => void;
  onNavigateCatalog?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  groundedRecords?: AssistantGroundedRecord[];
}

const PRESET_QUESTIONS = [
  'Show me the details of my latest order.',
  'How much did I spend on completed orders?',
  'Why was my recent purchase blocked by guardrails?',
  'What changed in my approved Purchase Pact?',
  'Summarize my completed purchases this month.',
  'Why is this payment still pending approval?',
];

export const AssistantTab: React.FC<AssistantTabProps> = ({
  onNavigateOrders,
  onNavigateCatalog,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'assistant',
      text: "Hello! I am your BoundBuy Post-Purchase Intelligence Assistant. I am directly grounded in your authorized purchase records, Purchase Pacts, audit trails, and PayPal Sandbox transactions. How can I help you review your institutional purchases today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAsk = async (questionText: string) => {
    if (!questionText.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setIsLoading(true);
    setErrorMessage(null);

    const historyPayload = messages.map((m) => ({
      role: m.sender,
      content: m.text,
    }));

    try {
      const res = await askPostPurchaseAssistant(questionText, historyPayload);
      const aiMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        groundedRecords: res.groundedRecords,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to query post-purchase assistant.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#E3E7E4] rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[600px]">
      {/* Top Assistant Header */}
      <div className="p-4 border-b border-[#E3E7E4] bg-[#FBFBFA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#153E2E] flex items-center justify-center text-white">
            <Bot className="w-5 h-5 text-[#88D4A8]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#19211C] font-display flex items-center gap-2">
              <span>BoundBuy Post-Purchase Assistant</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Grounded Q&A
              </span>
            </h2>
            <p className="text-xs text-[#637267]">
              Contextual analysis of real orders, Purchase Pacts, and audit logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 text-[11px] text-[#79887D] bg-white border border-[#DCE4DE] px-2.5 py-1 rounded-lg">
            <Lock className="w-3 h-3 text-[#153E2E]" />
            <span>Read-Only Support (Cannot Trigger Payments)</span>
          </div>
        </div>
      </div>

      {/* Suggested Quick Question Chips */}
      <div className="p-3 bg-[#F8FAF8] border-b border-[#E8ECE8] flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#79887D] shrink-0">
          Suggested Queries:
        </span>
        {PRESET_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleAsk(q)}
            disabled={isLoading}
            className="text-[11px] px-3 py-1.5 bg-white border border-[#DCE4DE] hover:border-[#153E2E] hover:bg-[#EEF4F0] text-[#19211C] rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Message Chat Feed */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[500px]">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div className="flex items-center gap-2 text-[10px] text-[#79887D] px-1">
                <span>{isUser ? 'Procurement Buyer' : 'BoundBuy Intelligence'}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-[#153E2E] text-white rounded-br-xs shadow-xs font-medium'
                    : 'bg-[#F8FAF8] text-[#19211C] border border-[#E3E7E4] rounded-bl-xs'
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>

                {/* Grounded Database Records Citing */}
                {!isUser && msg.groundedRecords && msg.groundedRecords.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#E8ECE8] space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#153E2E] flex items-center gap-1">
                      <Receipt className="w-3 h-3" />
                      <span>Referenced Database Records:</span>
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {msg.groundedRecords.map((rec, rIdx) => (
                        <div
                          key={rIdx}
                          className="p-2 bg-white rounded-lg border border-[#DCE4DE] text-[11px] space-y-0.5"
                        >
                          <div className="font-bold text-[#19211C] flex items-center justify-between">
                            <span>{rec.title}</span>
                            <span className="text-[9px] bg-[#EEF4F0] text-[#153E2E] px-1 rounded">
                              {rec.type}
                            </span>
                          </div>
                          <p className="text-[#637267] text-[10px]">{rec.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-[#F8FAF8] rounded-xl text-xs text-[#637267] w-fit">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#153E2E]" />
            <span>Consulting database records & generating grounded response...</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Input Form Bar */}
      <div className="p-4 border-t border-[#E3E7E4] bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(inputQuestion);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder="Ask a question about your orders, spending, or Purchase Pacts..."
            disabled={isLoading}
            className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-[#DCE4DE] focus:border-[#153E2E] focus:ring-1 focus:ring-[#153E2E] focus:outline-none placeholder:text-[#8E9B92]"
          />
          <button
            type="submit"
            disabled={isLoading || !inputQuestion.trim()}
            className="px-4 py-2.5 bg-[#153E2E] hover:bg-[#1C4E3B] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask AI</span>
          </button>
        </form>
      </div>
    </div>
  );
};
