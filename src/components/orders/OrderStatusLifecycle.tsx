import React from 'react';
import {
  Clock,
  ShieldCheck,
  CreditCard,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Package,
} from 'lucide-react';
import { OrderRecord } from '../../lib/types.js';

export interface OrderStatusLifecycleProps {
  order: OrderRecord;
  variant?: 'full' | 'compact';
  className?: string;
}

export type LifecycleStage = 'pending_approval' | 'approved' | 'captured' | 'dispatched' | 'cancelled' | 'failed';

export function getOrderLifecycleStage(order: OrderRecord): {
  stage: LifecycleStage;
  currentStepIndex: number;
  label: string;
  badgeColor: { bg: string; text: string; border: string; dot: string };
} {
  const payment = order.paymentStatus;
  const business = order.businessStatus;

  if (payment === 'cancelled') {
    return {
      stage: 'cancelled',
      currentStepIndex: -1,
      label: 'Cancelled',
      badgeColor: { bg: 'bg-[#F3F4F6]', text: 'text-[#4B5563]', border: 'border-[#E5E7EB]', dot: 'bg-[#9CA3AF]' },
    };
  }

  if (payment === 'failed' || business === 'blocked') {
    return {
      stage: 'failed',
      currentStepIndex: -1,
      label: 'Payment Failed',
      badgeColor: { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', border: 'border-[#FECACA]', dot: 'bg-[#EF4444]' },
    };
  }

  if (payment === 'pending_approval' || payment === 'pending') {
    return {
      stage: 'pending_approval',
      currentStepIndex: 1,
      label: 'Pending Approval',
      badgeColor: { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', border: 'border-[#FDE68A]', dot: 'bg-[#F59E0B]' },
    };
  }

  if (payment === 'approved' || payment === 'capture_pending') {
    return {
      stage: 'approved',
      currentStepIndex: 2,
      label: 'Buyer Authorized',
      badgeColor: { bg: 'bg-[#E0F2FE]', text: 'text-[#0369A1]', border: 'border-[#BAE6FD]', dot: 'bg-[#0EA5E9]' },
    };
  }

  // When paid: if businessStatus is procured, delivered, or confirmed with valid capture
  if (payment === 'paid') {
    if (business === 'procured' || business === 'delivered') {
      return {
        stage: 'dispatched',
        currentStepIndex: 4,
        label: 'Dispatched & In Transit',
        badgeColor: { bg: 'bg-[#EEF4F0]', text: 'text-[#153E2E]', border: 'border-[#C5DFC9]', dot: 'bg-[#2E7D5B]' },
      };
    }

    // Default paid state: Captured & Dispatched
    return {
      stage: 'dispatched',
      currentStepIndex: 4,
      label: 'Captured & Dispatched',
      badgeColor: { bg: 'bg-[#EEF4F0]', text: 'text-[#153E2E]', border: 'border-[#C5DFC9]', dot: 'bg-[#153E2E]' },
    };
  }

  return {
    stage: 'pending_approval',
    currentStepIndex: 1,
    label: 'Pending',
    badgeColor: { bg: 'bg-[#F9FAFB]', text: 'text-[#4B5563]', border: 'border-[#E5E7EB]', dot: 'bg-[#9CA3AF]' },
  };
}

export const OrderStatusLifecycle: React.FC<OrderStatusLifecycleProps> = ({
  order,
  variant = 'compact',
  className = '',
}) => {
  const lifecycle = getOrderLifecycleStage(order);
  const maxDays = Math.max(...(order.items?.map((i) => i.deliveryDays) || [3]), 2);
  const suppliers = Array.from(new Set(order.items?.map((i) => i.supplierName) || [])).join(', ') || 'Authorized Suppliers';

  // Format delivery timeline
  const orderDate = new Date(order.transactionTimestamp || Date.now());
  const estDeliveryDate = new Date(orderDate.getTime() + maxDays * 24 * 60 * 60 * 1000);
  const estDeliveryStr = estDeliveryDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });

  // Steps definition for Full Stepper
  const steps = [
    {
      id: 1,
      title: 'Pact & Order Created',
      subtitle: 'Awaiting PayPal Sandbox authorization',
      detail: order.orderNumber,
      timestamp: order.transactionTimestamp ? new Date(order.transactionTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      icon: Clock,
    },
    {
      id: 2,
      title: 'Buyer Authorized',
      subtitle: 'Explicit cryptographic approval',
      detail: order.buyerEmail || 'Buyer Session',
      timestamp: order.approvalTimestamp ? new Date(order.approvalTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
      icon: ShieldCheck,
    },
    {
      id: 3,
      title: 'Payment Captured',
      subtitle: 'PayPal Orders v2 verified capture',
      detail: order.paypalCaptureId || 'Capture ID Pending',
      timestamp: order.paymentStatus === 'paid' ? 'Completed' : null,
      icon: CreditCard,
    },
    {
      id: 4,
      title: 'Dispatched & Fulfillment',
      subtitle: `Dispatched via ${suppliers}`,
      detail: `Est. Arrival: ${estDeliveryStr} (${maxDays}d)`,
      timestamp: order.paymentStatus === 'paid' ? 'In Transit' : null,
      icon: Truck,
    },
  ];

  // 1. Compact / Badge View (For Table or Summaries)
  if (variant === 'compact') {
    if (lifecycle.stage === 'cancelled') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${lifecycle.badgeColor.bg} ${lifecycle.badgeColor.text} ${lifecycle.badgeColor.border} ${className}`}
        >
          <XCircle className="w-3 h-3 text-[#6B7280]" />
          <span>Cancelled</span>
        </span>
      );
    }

    if (lifecycle.stage === 'failed') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${lifecycle.badgeColor.bg} ${lifecycle.badgeColor.text} ${lifecycle.badgeColor.border} ${className}`}
        >
          <AlertCircle className="w-3 h-3 text-[#EF4444]" />
          <span>Payment Failed</span>
        </span>
      );
    }

    return (
      <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${lifecycle.badgeColor.bg} ${lifecycle.badgeColor.text} ${lifecycle.badgeColor.border}`}
        >
          {lifecycle.currentStepIndex === 4 ? (
            <Truck className="w-3 h-3 text-[#153E2E]" />
          ) : lifecycle.currentStepIndex === 3 ? (
            <CheckCircle2 className="w-3 h-3 text-[#153E2E]" />
          ) : lifecycle.currentStepIndex === 2 ? (
            <ShieldCheck className="w-3 h-3 text-[#0284C7]" />
          ) : (
            <Clock className="w-3 h-3 text-[#D97706] animate-pulse" />
          )}
          <span>{lifecycle.label}</span>
        </span>

        {/* 4-Step Progress Indicator Bar */}
        <div className="flex items-center gap-1" title={`Order Lifecycle: Step ${lifecycle.currentStepIndex} of 4`}>
          {[1, 2, 3, 4].map((step) => {
            const isCompleted = lifecycle.currentStepIndex >= step;
            const isCurrent = lifecycle.currentStepIndex === step;
            return (
              <span
                key={step}
                className={`h-1.5 rounded-full transition-all ${
                  isCurrent
                    ? 'w-4 bg-[#153E2E]'
                    : isCompleted
                    ? 'w-2 bg-[#2E7D5B]'
                    : 'w-2 bg-[#E3E7E4]'
                }`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // 2. Full Stepper / Timeline View (For Order Details Modal)
  return (
    <div className={`bg-white border border-[#E3E7E4] rounded-2xl p-5 shadow-xs space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EAEFEA] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#EEF4F0] text-[#153E2E]">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
              Order Lifecycle Tracking
            </h4>
            <p className="text-[11px] text-[#637267]">
              End-to-end execution from Purchase Pact to PayPal Capture and Supplier Dispatch
            </p>
          </div>
        </div>

        <span
          className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${lifecycle.badgeColor.bg} ${lifecycle.badgeColor.text} ${lifecycle.badgeColor.border}`}
        >
          <span className={`w-2 h-2 rounded-full ${lifecycle.badgeColor.dot} ${lifecycle.currentStepIndex < 4 && lifecycle.currentStepIndex > 0 ? 'animate-ping' : ''}`} />
          <span>{lifecycle.label}</span>
        </span>
      </div>

      {/* Stepper Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 relative pt-2">
        {steps.map((s, idx) => {
          const isCompleted = lifecycle.currentStepIndex > s.id || (lifecycle.currentStepIndex === 4 && s.id === 4);
          const isCurrent = lifecycle.currentStepIndex === s.id;
          const isPending = lifecycle.currentStepIndex < s.id;
          const Icon = s.icon;

          return (
            <div
              key={s.id}
              className={`relative flex flex-col p-3 rounded-xl border transition-all ${
                isCurrent
                  ? 'border-[#153E2E] bg-[#F7FAF8] shadow-xs ring-1 ring-[#153E2E]/20'
                  : isCompleted
                  ? 'border-[#C5DFC9] bg-[#F9FCFA]'
                  : 'border-[#EAEFEA] bg-[#FAFBFA] opacity-75'
              }`}
            >
              {/* Top Row: Step Index & Status Icon */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    isCompleted
                      ? 'bg-[#153E2E] text-white'
                      : isCurrent
                      ? 'bg-[#153E2E] text-white'
                      : 'bg-[#E3E7E4] text-[#79887D]'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
                </span>

                <div
                  className={`p-1 rounded-md ${
                    isCurrent
                      ? 'bg-[#EEF4F0] text-[#153E2E]'
                      : isCompleted
                      ? 'text-[#2E7D5B]'
                      : 'text-[#9AA59D]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#19211C] flex items-center gap-1">
                  <span>{s.title}</span>
                </div>
                <div className="text-[10px] text-[#637267] line-clamp-1">
                  {s.subtitle}
                </div>
              </div>

              {/* Detail info & timestamp */}
              <div className="mt-3 pt-2 border-t border-[#EAEFEA]/80 text-[10px] font-mono-data space-y-0.5">
                <div className="text-[#2D3A31] font-semibold truncate" title={s.detail}>
                  {s.detail}
                </div>
                {s.timestamp && (
                  <div className="text-[#79887D] flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{s.timestamp}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transit & Fulfillment Banner */}
      {order.paymentStatus === 'paid' && (
        <div className="bg-[#EEF4F0] border border-[#C5DFC9] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-[#153E2E]">
            <div className="p-1.5 rounded-lg bg-[#DDEEE1]">
              <Truck className="w-4 h-4 text-[#153E2E]" />
            </div>
            <div>
              <span className="font-bold block">Dispatched & In Transit</span>
              <span className="text-[11px] text-[#24523F]">
                Fulfillment partner assigned. Expected delivery on or before{' '}
                <strong className="underline decoration-[#153E2E]/40 font-semibold">{estDeliveryStr}</strong>.
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono-data text-[#153E2E] bg-white/70 px-2.5 py-1 rounded-md border border-[#C5DFC9] self-start sm:self-auto">
            Max Turnaround: {maxDays} Days
          </div>
        </div>
      )}
    </div>
  );
};
