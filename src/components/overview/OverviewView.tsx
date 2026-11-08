import React from 'react';
import {
  Sparkles,
  ShoppingBag,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Truck,
  Package,
} from 'lucide-react';
import { DashboardStats, OrderRecord } from '../../lib/types.js';
import { generateOrderPdfReceipt } from '../../lib/pdf.js';

interface OverviewViewProps {
  stats: DashboardStats | null;
  onNavigateNewPurchase: () => void;
  onNavigateOrders: () => void;
  onNavigateAudit: () => void;
  onNavigateCatalog: () => void;
  onNavigateIntelligence?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  onNavigateNewPurchase,
  onNavigateOrders,
  onNavigateAudit,
  onNavigateCatalog,
  onNavigateIntelligence,
}) => {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#153E2E] to-[#1E4D3A] text-white p-7 shadow-sm">
        <div className="max-w-2xl relative z-10 space-y-2.5">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#A6E3BF]">
            <ShieldCheck className="w-4 h-4" />
            <span>BoundBuy AI · Institutional Purchasing Guardrails</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight font-display text-white">
            Set the buying rules. AI finds the option. PayPal pays.
          </h2>
          <p className="text-sm text-[#D1EBDC] leading-relaxed">
            BoundBuy enforces hard budget limits, delivery deadlines, and zero
            unauthorized substitutions. Every transaction requires your explicit
            review through a cryptographic Purchase Pact before PayPal checkout.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => (onNavigateIntelligence ? onNavigateIntelligence() : onNavigateNewPurchase())}
              className="px-4 py-2 bg-[#88D4A8] hover:bg-[#A6E3BF] text-[#0F2E22] text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0F2E22]" />
              <span>Procurement Intelligence Engine</span>
            </button>
            <button
              onClick={onNavigateNewPurchase}
              className="px-4 py-2 bg-white text-[#153E2E] text-xs font-bold rounded-lg hover:bg-[#F2F5F3] transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <span>Quick Purchase Flow</span>
            </button>
            <button
              onClick={onNavigateCatalog}
              className="px-4 py-2 bg-[#205541] hover:bg-[#28644E] text-white text-xs font-medium rounded-lg transition-colors border border-[#357B61] flex items-center gap-1.5 cursor-pointer"
            >
              <span>Explore Catalog</span>
            </button>
          </div>
        </div>
      </div>

      {/* Persisted Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1 */}
        <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs">
          <div className="text-xs font-medium text-[#637267] flex items-center justify-between">
            <span>Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-[#79887D]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#19211C] font-mono-data">
              {stats?.totalOrders ?? 0}
            </span>
            <span className="text-[11px] text-[#79887D]">persisted</span>
          </div>
          <div className="mt-2 text-[11px] text-[#79887D]">
            Includes sample demo orders
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs">
          <div className="text-xs font-medium text-[#637267] flex items-center justify-between">
            <span>Captured Payments</span>
            <CheckCircle2 className="w-4 h-4 text-[#153E2E]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#153E2E] font-mono-data">
              {stats?.successfulCaptures ?? 0}
            </span>
            <span className="text-[11px] text-[#153E2E] font-medium">verified</span>
          </div>
          <div className="mt-2 text-[11px] text-[#79887D]">
            Official PayPal Sandbox status
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs">
          <div className="text-xs font-medium text-[#637267] flex items-center justify-between">
            <span>Total Test Spent</span>
            <span className="text-[10px] font-semibold text-[#637267] uppercase">
              {stats?.currency || 'USD'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-[#19211C] font-mono-data">
              ${stats?.totalSpent ? stats.totalSpent.toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[#79887D]">
            Sandbox test transactions only
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs">
          <div className="text-xs font-medium text-[#637267] flex items-center justify-between">
            <span>Pending Approvals</span>
            <Clock className="w-4 h-4 text-[#C27803]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#C27803] font-mono-data">
              {stats?.pendingApprovals ?? 0}
            </span>
            <span className="text-[11px] text-[#79887D]">awaiting sign-off</span>
          </div>
          <div className="mt-2 text-[11px] text-[#79887D]">
            Requires buyer authorization
          </div>
        </div>

        {/* Metric 5 */}
        <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs">
          <div className="text-xs font-medium text-[#637267] flex items-center justify-between">
            <span>Guardrail Blocks</span>
            <ShieldAlert className="w-4 h-4 text-[#991B1B]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#991B1B] font-mono-data">
              {stats?.blockedEventsCount ?? 0}
            </span>
            <span className="text-[11px] text-[#991B1B]">prevented</span>
          </div>
          <div className="mt-2 text-[11px] text-[#79887D]">
            Policy & price-change triggers
          </div>
        </div>
      </div>

      {/* BoundBuy Track Delivery Intelligence Compact Banner */}
      <div className="p-5 bg-white border border-[#E3E7E4] rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EEF4F0] text-[#153E2E] flex items-center justify-center border border-[#C5DFC9] shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#19211C] font-display">
                BoundBuy Track · Delivery Intelligence
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EEF4F0] text-[#153E2E] border border-[#C5DFC9]">
                Carrier Checkpoints
              </span>
            </div>
            <p className="text-xs text-[#637267]">
              Real-time shipment tracking, multi-parcel timelines, and grounded AI delivery answers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="px-3 py-1.5 bg-[#F8FAF8] border border-[#EAEFEA] rounded-lg">
            <span className="text-[#637267]">Active Shipments: </span>
            <strong className="font-mono-data text-[#19211C] ml-1">
              {stats?.activeShipmentsCount ?? 1}
            </strong>
          </div>
          <div className="px-3 py-1.5 bg-[#F8FAF8] border border-[#EAEFEA] rounded-lg">
            <span className="text-[#637267]">In Transit: </span>
            <strong className="font-mono-data text-[#153E2E] ml-1">
              {stats?.inTransitShipmentsCount ?? 1}
            </strong>
          </div>
          <div className="px-3 py-1.5 bg-[#F8FAF8] border border-[#EAEFEA] rounded-lg">
            <span className="text-[#637267]">Delivered: </span>
            <strong className="font-mono-data text-[#19211C] ml-1">
              {stats?.deliveredShipmentsCount ?? 0}
            </strong>
          </div>
          <button
            onClick={onNavigateOrders}
            className="px-3.5 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>Track Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Two Column Layout: Recent Orders & Guardrail Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Recent Purchases */}
        <div className="bg-white border border-[#E3E7E4] rounded-xl shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#19211C] font-display">
                Recent Orders
              </h3>
              <p className="text-xs text-[#637267]">
                Verified transactions captured via PayPal Sandbox
              </p>
            </div>
            <button
              onClick={onNavigateOrders}
              className="text-xs font-semibold text-[#153E2E] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {stats?.recentPurchases && stats.recentPurchases.length > 0 ? (
              stats.recentPurchases.map((order) => (
                <div
                  key={order.id}
                  className="p-3.5 border border-[#EAEFEA] rounded-lg hover:border-[#D5E2D9] transition-colors flex items-center justify-between"
                >
                  <div className="space-y-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#19211C]">
                        {order.orderNumber}
                      </span>
                      <span className="text-[10px] text-[#637267]">
                        · {new Date(order.transactionTimestamp).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-[#EEF4F0] text-[#153E2E] font-medium rounded">
                        Sandbox Verified
                      </span>
                    </div>
                    <div className="text-xs text-[#637267] truncate">
                      {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                    </div>
                    <div className="text-[10px] text-[#79887D] font-mono-data truncate">
                      Capture ID: {order.paypalCaptureId}
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1.5">
                    <div className="text-sm font-bold text-[#19211C] font-mono-data">
                      ${order.grandTotal.toFixed(2)} {order.currency}
                    </div>
                    <button
                      onClick={() => generateOrderPdfReceipt(order)}
                      className="text-[11px] text-[#153E2E] hover:text-[#1F5C45] font-semibold flex items-center gap-1 justify-end cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                      <span>PDF Receipt</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[#79887D]">
                No orders placed yet. Start your first procurement request!
              </div>
            )}
          </div>
        </div>

        {/* Right: Security & Guardrail Activity */}
        <div className="bg-white border border-[#E3E7E4] rounded-xl shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#19211C] font-display">
                Guardrail & Security Ledger
              </h3>
              <p className="text-xs text-[#637267]">
                Live enforcement of budget ceilings and cryptographic approvals
              </p>
            </div>
            <button
              onClick={onNavigateAudit}
              className="text-xs font-semibold text-[#153E2E] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Audit Trail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {stats?.recentEvents && stats.recentEvents.length > 0 ? (
              stats.recentEvents.slice(0, 5).map((evt) => {
                const isBlocked =
                  evt.eventType === 'GUARDRAIL_BLOCKED' ||
                  evt.eventType === 'APPROVAL_INVALIDATED';
                const isPayment = evt.eventType === 'PAYPAL_PAYMENT_CAPTURED';

                return (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      isBlocked
                        ? 'bg-[#FEF2F2] border-[#FCA5A5]/60 text-[#991B1B]'
                        : isPayment
                        ? 'bg-[#F2F7F4] border-[#C4DFC9] text-[#153E2E]'
                        : 'bg-[#FBFBFA] border-[#EAEFEA] text-[#2D3A31]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {isBlocked ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                        ) : isPayment ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#153E2E]" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-[#637267]" />
                        )}
                        <span>{evt.eventType.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] text-[#79887D]">
                        {new Date(evt.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-[11px] leading-relaxed">{evt.summary}</p>
                    {evt.snapshotHash && (
                      <div className="text-[9px] font-mono-data opacity-75 truncate">
                        Hash: {evt.snapshotHash}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-[#79887D]">
                No audit events recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
