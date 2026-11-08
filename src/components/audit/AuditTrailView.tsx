import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  AlertTriangle,
  CreditCard,
  Filter,
} from 'lucide-react';
import { AuditEvent } from '../../lib/types.js';
import { fetchAuditEvents } from '../../lib/api.js';

export const AuditTrailView: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetchAuditEvents(150);
      setEvents(res.events);
    } catch (err) {
      console.error('Failed to load audit events', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = events.filter((e) => {
    if (filterType === 'all') return true;
    if (filterType === 'security')
      return e.eventType === 'GUARDRAIL_BLOCKED' || e.eventType === 'APPROVAL_INVALIDATED';
    if (filterType === 'payment')
      return (
        e.eventType === 'PAYPAL_ORDER_CREATED' ||
        e.eventType === 'PAYPAL_PAYMENT_CAPTURED'
      );
    if (filterType === 'approval')
      return e.eventType === 'PACT_APPROVED' || e.eventType === 'PACT_GENERATED';
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#19211C] font-display">
            Activity & Security Audit Trail
          </h2>
          <p className="text-xs text-[#637267]">
            Immutable record of AI recommendations, buyer approvals, and PayPal captures
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'all', label: 'All Events' },
            { id: 'security', label: 'Guardrail Blocks & Invalidation' },
            { id: 'approval', label: 'Pact Approvals' },
            { id: 'payment', label: 'PayPal Payments' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                filterType === f.id
                  ? 'bg-[#153E2E] text-white shadow-xs'
                  : 'bg-white text-[#455448] border border-[#E3E7E4] hover:bg-[#F2F5F3]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white border border-[#E3E7E4] rounded-xl overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#79887D]">
            Loading audit ledger...
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="divide-y divide-[#EAEFEA]">
            {filteredEvents.map((event) => {
              const isBlocked =
                event.eventType === 'GUARDRAIL_BLOCKED' ||
                event.eventType === 'APPROVAL_INVALIDATED';
              const isPayment = event.eventType === 'PAYPAL_PAYMENT_CAPTURED';
              const isApproval = event.eventType === 'PACT_APPROVED';

              return (
                <div
                  key={event.id}
                  className="p-5 hover:bg-[#F9FAF9] transition-colors flex items-start gap-4 text-xs"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isBlocked
                        ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5]'
                        : isPayment
                        ? 'bg-[#EEF4F0] text-[#153E2E] border border-[#C5DFC9]'
                        : isApproval
                        ? 'bg-[#EBF5FB] text-[#2980B9] border border-[#AED6F1]'
                        : 'bg-[#F5F7F5] text-[#637267] border border-[#E3E7E4]'
                    }`}
                  >
                    {isBlocked ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : isPayment ? (
                      <CreditCard className="w-4 h-4" />
                    ) : isApproval ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#19211C]">
                          {event.eventType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-[#79887D]">
                          by {event.actor}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#79887D] font-mono-data">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-[#2D3A31] leading-relaxed">
                      {event.summary}
                    </p>

                    {event.snapshotHash && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F2F5F3] border border-[#E0E6E1] rounded text-[10px] font-mono-data text-[#24523F]">
                        <Lock className="w-3 h-3 text-[#153E2E]" />
                        <span className="truncate max-w-md">
                          Seal: {event.snapshotHash}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-[#79887D]">
            No audit events found for selected category.
          </div>
        )}
      </div>
    </div>
  );
};
