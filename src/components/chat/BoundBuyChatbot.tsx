import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Minimize2,
  Package,
  FileText,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { askPostPurchaseAssistant } from '../../lib/api.js';
import { AssistantGroundedRecord } from '../../lib/types.js';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  groundedRecords?: AssistantGroundedRecord[];
}

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome_1',
  sender: 'assistant',
  text: "Hi! I'm BoundBuy AI. I can help you compare products, plan purchases, understand your orders and track deliveries. What would you like to do?",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

const SUGGESTED_PROMPTS = [
  'What delivery time did I choose?',
  'Can I change my delivery time?',
  'Is my evening delivery confirmed?',
  'Track my order.',
  'Find products within my budget.',
];

const STORAGE_KEY = 'boundbuy_chatbot_history_v1';

export const BoundBuyChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not restore chat session:', e);
    }
    return [INITIAL_WELCOME];
  });

  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync conversation to sessionStorage for cross-tab/screen persistence
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('Could not persist chat session:', e);
    }
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);

    // Format history for Gemini API
    const historyPayload = messages.map((m) => ({
      role: m.sender,
      content: m.text,
    }));

    try {
      const res = await askPostPurchaseAssistant(query, historyPayload);
      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        groundedRecords: res.groundedRecords,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (!isOpen) {
        setHasUnread(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Assistant failed to respond.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([INITIAL_WELCOME]);
    setErrorMessage(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 select-none font-sans">
      {/* Floating Action Chat Button (when closed or minimized) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-[#153E2E] hover:bg-[#1E4D3A] text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer border border-[#2B604A] active:scale-98"
          title="Ask BoundBuy AI"
          aria-label="Open AI Purchasing Assistant"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-[#88D4A8] group-hover:scale-110 transition-transform" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
            )}
          </div>
          <span className="text-xs font-bold tracking-tight pr-1">Ask BoundBuy AI</span>
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        </button>
      )}

      {/* Floating Chat Panel (when open) */}
      {isOpen && (
        <div className="w-[380px] sm:w-[420px] max-w-[calc(100vw-28px)] h-[560px] max-h-[calc(100vh-100px)] bg-white rounded-3xl shadow-2xl border border-[#D5DDD7] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-[#153E2E] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#235843] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#235843] text-[#88D4A8] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white truncate">BoundBuy AI</h3>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] text-[#A6E3BF] truncate">
                  Your intelligent purchasing assistant
                </p>
              </div>
            </div>

            {/* Header Action Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleClearChat}
                className="p-1.5 text-[#A6E3BF] hover:text-white hover:bg-[#235843] rounded-lg transition-colors cursor-pointer"
                title="Start new conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-[#A6E3BF] hover:text-white hover:bg-[#235843] rounded-lg transition-colors cursor-pointer"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Conversation Viewport */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#FBFBFA] text-xs">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-1 text-[10px] text-[#79887D] px-1">
                    <span>{isUser ? 'You' : 'BoundBuy AI'}</span>
                    <span>·</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[88%] p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words shadow-2xs ${
                      isUser
                        ? 'bg-[#153E2E] text-white rounded-br-xs'
                        : 'bg-white text-[#19211C] border border-[#E3E7E4] rounded-bl-xs'
                    }`}
                  >
                    {msg.text}

                    {/* Grounded Records References */}
                    {msg.groundedRecords && msg.groundedRecords.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-[#EAEFEA] space-y-1">
                        <span className="text-[10px] font-bold text-[#637267] block uppercase tracking-wider">
                          Verified Records Cited:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.groundedRecords.map((rec, rIdx) => (
                            <div
                              key={rIdx}
                              className="px-2 py-0.5 bg-[#F2F5F3] border border-[#D5DDD7] rounded text-[10px] text-[#19211C] flex items-center gap-1 font-mono-data"
                            >
                              {rec.type === 'order' && <FileText className="w-2.5 h-2.5 text-[#153E2E]" />}
                              {rec.type === 'catalog' && <Package className="w-2.5 h-2.5 text-blue-600" />}
                              <span className="font-bold">{rec.title}:</span>
                              <span className="text-[#637267]">{rec.summary}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-start gap-2 pt-1">
                <div className="w-6 h-6 rounded-lg bg-[#153E2E] text-white flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-[#88D4A8]" />
                </div>
                <div className="bg-white border border-[#E3E7E4] rounded-2xl px-3.5 py-2.5 shadow-2xs flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#153E2E] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-[#153E2E] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-[#153E2E] rounded-full animate-bounce" />
                  </div>
                  <span className="text-[11px] text-[#637267] font-medium">Checking verified records...</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>Assistant Unavailable</span>
                </div>
                <p className="text-[11px] leading-relaxed">{errorMessage}</p>
                <button
                  onClick={() => handleSend(messages[messages.length - 1]?.text)}
                  className="mt-1 text-[11px] font-bold text-red-900 underline cursor-pointer"
                >
                  Retry Request
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggested Prompts Carousel */}
          <div className="px-3.5 py-2 bg-white border-t border-[#EAEFEA] shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {SUGGESTED_PROMPTS.map((promptText) => (
                <button
                  key={promptText}
                  onClick={() => handleSend(promptText)}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-[#F2F5F3] hover:bg-[#EAEFEA] disabled:opacity-50 text-[#19211C] rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer border border-[#E3E7E4] shrink-0 shadow-2xs"
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>

          {/* Input & Send Form */}
          <div className="p-3 bg-white border-t border-[#E3E7E4] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Ask about products, orders, tracking, or pacts..."
                className="flex-1 py-2 px-3 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E] resize-none max-h-24"
              />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs shrink-0"
                title="Send message"
              >
                <Send className="w-4 h-4 text-[#88D4A8]" />
              </button>
            </form>

            <div className="text-[10px] text-[#79887D] mt-1 text-center">
              Advisory only · Cannot alter prices or approve PayPal payments automatically
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
