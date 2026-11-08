import React, { useState, useEffect } from 'react';
import {
  Truck,
  RotateCw,
  ExternalLink,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PlusCircle,
  ShieldCheck,
  Package,
  Calendar,
  Send,
  HelpCircle,
} from 'lucide-react';
import {
  OrderRecord,
  ShipmentRecord,
  ShipmentEventRecord,
  NormalizedShipmentStatus,
  DeliveryIntelligenceResult,
} from '../../lib/types.js';
import {
  fetchOrderTracking,
  refreshShipmentTracking,
  addManualShipmentEvent,
  queryDeliveryIntelligence,
} from '../../lib/api.js';
import { DeliveryScheduleCard } from '../delivery/DeliveryScheduleCard.js';

interface ShipmentTrackingSectionProps {
  order: OrderRecord;
  onOpenRegisterModal?: () => void;
  className?: string;
  onOrderUpdated?: (order: OrderRecord) => void;
}

export const getStatusBadgeStyle = (status: NormalizedShipmentStatus) => {
  switch (status) {
    case 'DELIVERED':
      return {
        bg: 'bg-[#DCFCE7]',
        text: 'text-[#14532D]',
        border: 'border-[#BBF7D0]',
        dot: 'bg-[#15803D]',
        label: 'Delivered',
      };
    case 'OUT_FOR_DELIVERY':
      return {
        bg: 'bg-[#EFF6FF]',
        text: 'text-[#1E40AF]',
        border: 'border-[#DBEAFE]',
        dot: 'bg-[#2563EB]',
        label: 'Out for Delivery',
      };
    case 'IN_TRANSIT':
      return {
        bg: 'bg-[#EEF4F0]',
        text: 'text-[#153E2E]',
        border: 'border-[#C5DFC9]',
        dot: 'bg-[#153E2E]',
        label: 'In Transit',
      };
    case 'INFORMATION_RECEIVED':
    case 'LABEL_CREATED':
      return {
        bg: 'bg-[#FEF3C7]',
        text: 'text-[#92400E]',
        border: 'border-[#FDE68A]',
        dot: 'bg-[#D97706]',
        label: status === 'LABEL_CREATED' ? 'Label Created' : 'Carrier Notified',
      };
    case 'AVAILABLE_FOR_PICKUP':
      return {
        bg: 'bg-[#F3E8FF]',
        text: 'text-[#6B21A8]',
        border: 'border-[#E9D5FF]',
        dot: 'bg-[#9333EA]',
        label: 'Available for Pickup',
      };
    case 'DELIVERY_EXCEPTION':
    case 'FAILED_DELIVERY_ATTEMPT':
      return {
        bg: 'bg-[#FEE2E2]',
        text: 'text-[#991B1B]',
        border: 'border-[#FECACA]',
        dot: 'bg-[#DC2626]',
        label: status === 'FAILED_DELIVERY_ATTEMPT' ? 'Attempt Failed' : 'Delivery Exception',
      };
    case 'RETURN_TO_SENDER':
    case 'CANCELLED':
      return {
        bg: 'bg-[#F3F4F6]',
        text: 'text-[#374151]',
        border: 'border-[#E5E7EB]',
        dot: 'bg-[#4B5563]',
        label: status === 'RETURN_TO_SENDER' ? 'Returned to Sender' : 'Cancelled',
      };
    case 'NOT_SHIPPED':
    default:
      return {
        bg: 'bg-[#F7F8F7]',
        text: 'text-[#637267]',
        border: 'border-[#E3E7E4]',
        dot: 'bg-[#9CA3AF]',
        label: 'Not Yet Shipped',
      };
  }
};

export const ShipmentTrackingSection: React.FC<ShipmentTrackingSectionProps> = ({
  order,
  onOpenRegisterModal,
  className = '',
  onOrderUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [eventsMap, setEventsMap] = useState<Record<string, ShipmentEventRecord[]>>({});
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

  // Manual Event Form state
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [manualStatus, setManualStatus] = useState<NormalizedShipmentStatus>('IN_TRANSIT');
  const [manualDescription, setManualDescription] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Delivery Intelligence AI state
  const [aiQuestion, setAiQuestion] = useState('');
  const [isQueryingAi, setIsQueryingAi] = useState(false);
  const [aiResult, setAiResult] = useState<DeliveryIntelligenceResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadTracking = async () => {
    setLoading(true);
    try {
      const data = await fetchOrderTracking(order.id, order.buyerEmail);
      if (data.shipments && data.shipments.length > 0) {
        setShipments(data.shipments.map((s) => s.shipment));
        const evMap: Record<string, ShipmentEventRecord[]> = {};
        data.shipments.forEach((s) => {
          evMap[s.shipment.id] = s.events;
        });
        setEventsMap(evMap);
        setSelectedShipmentId(data.shipments[0].shipment.id);
      } else {
        setShipments([]);
        setEventsMap({});
      }
    } catch (err) {
      console.error('Failed to load tracking', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracking();
  }, [order.id]);

  const activeShipment = shipments.find((s) => s.id === selectedShipmentId) || shipments[0];
  const activeEvents = activeShipment ? eventsMap[activeShipment.id] || [] : [];
  const latestEvent = activeEvents.length > 0 ? activeEvents[activeEvents.length - 1] : undefined;

  const handleRefresh = async () => {
    if (!activeShipment) return;
    setRefreshing(true);
    try {
      const res = await refreshShipmentTracking(activeShipment.id);
      if (res.success && res.shipment) {
        setShipments((prev) =>
          prev.map((s) => (s.id === res.shipment.id ? res.shipment : s))
        );
        if (res.events) {
          setEventsMap((prev) => ({ ...prev, [res.shipment.id]: res.events }));
        }
      }
    } catch (err) {
      console.error('Failed to refresh tracking', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddManualEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipment || !manualDescription.trim()) return;

    setIsSubmittingEvent(true);
    try {
      const res = await addManualShipmentEvent(activeShipment.id, {
        status: manualStatus,
        description: manualDescription.trim(),
        location: manualLocation.trim() || undefined,
        timestamp: new Date().toISOString(),
        userEmail: order.buyerEmail,
      });

      if (res.success && res.event && res.shipment) {
        setShipments((prev) =>
          prev.map((s) => (s.id === res.shipment.id ? res.shipment : s))
        );
        setEventsMap((prev) => ({
          ...prev,
          [res.shipment.id]: [...(prev[res.shipment.id] || []), res.event!].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          ),
        }));
        setIsAddingEvent(false);
        setManualDescription('');
        setManualLocation('');
      }
    } catch (err) {
      console.error('Failed to add manual event', err);
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleAskDeliveryIntelligence = async (promptText: string) => {
    const q = promptText.trim();
    if (!q) return;

    setIsQueryingAi(true);
    setAiError(null);
    try {
      const result = await queryDeliveryIntelligence(order.id, q, order.buyerEmail);
      setAiResult(result);
    } catch (err: any) {
      setAiError(err.message || 'Failed to generate delivery intelligence response.');
    } finally {
      setIsQueryingAi(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-6 bg-white border border-[#E3E7E4] rounded-xl flex items-center justify-center gap-2 text-xs text-[#79887D] ${className}`}>
        <RotateCw className="w-4 h-4 animate-spin text-[#153E2E]" />
        <span>Loading verified shipment tracking records...</span>
      </div>
    );
  }

  // State A: Order has not shipped yet
  if (shipments.length === 0) {
    return (
      <div className={`p-6 bg-[#FBFBFA] border border-[#EAEFEA] rounded-xl space-y-4 ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F2F5F3] text-[#79887D] flex items-center justify-center border border-[#E3E7E4]">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-[#19211C] font-display">
                  BoundBuy Track · Shipment Tracking
                </h4>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F2F5F3] text-[#637267] border border-[#E3E7E4]">
                  Not Yet Shipped
                </span>
              </div>
              <p className="text-xs text-[#637267]">
                Order {order.orderNumber} is confirmed and awaiting carrier fulfillment
              </p>
            </div>
          </div>

          {onOpenRegisterModal && (
            <button
              onClick={onOpenRegisterModal}
              className="px-3.5 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Register Shipment Tracking</span>
            </button>
          )}
        </div>

        {/* Your Delivery Schedule Card */}
        <DeliveryScheduleCard order={order} onOrderUpdated={onOrderUpdated} />

        <div className="p-4 bg-white border border-[#E3E7E4] rounded-lg text-xs space-y-2 text-[#425046]">
          <div className="flex items-center gap-1.5 font-bold text-[#153E2E]">
            <CheckCircle2 className="w-4 h-4 text-[#153E2E]" />
            <span>Payment Captured via PayPal Sandbox ({order.currency} ${order.grandTotal.toFixed(2)})</span>
          </div>
          <p className="text-[#637267] leading-relaxed">
            Payment has been captured and verified. Tracking details have not yet been registered by participating suppliers. Once the parcels are dispatched, carrier tracking numbers and live event checkpoints will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const badge = getStatusBadgeStyle(activeShipment.status);

  return (
    <div className={`p-6 bg-white border border-[#E3E7E4] rounded-xl space-y-6 ${className}`}>
      {/* Your Delivery Schedule Card */}
      <DeliveryScheduleCard order={order} onOrderUpdated={onOrderUpdated} />

      {/* Shipment Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#EAEFEA]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-[#19211C] font-display flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#153E2E]" />
              <span>BoundBuy Track · {activeShipment.carrierName}</span>
            </h4>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 ${badge.bg} ${badge.text} ${badge.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
            {activeShipment.trackingSource === 'LIVE_PROVIDER' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 bg-[#DCFCE7] text-[#14532D] border border-[#BBF7D0] shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                LIVE AFTERSHIP DATA
              </span>
            ) : activeShipment.trackingSource === 'DEMO' ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#64748B]" />
                DEMO DATA
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center gap-1.5 bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                MANUAL FALLBACK (AFTERSHIP QUOTA)
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#637267]">
            <span>
              Tracking #:{' '}
              <strong className="font-mono-data text-[#19211C]">
                {activeShipment.trackingNumber}
              </strong>
            </span>
            <span>·</span>
            <span>Order: <strong>{activeShipment.orderNumber}</strong></span>
            {activeShipment.dispatchedAt && (
              <>
                <span>·</span>
                <span>Dispatched: {new Date(activeShipment.dispatchedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 border border-[#CDD6CF] hover:bg-[#F2F5F3] text-[#425046] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          {activeShipment.trackingUrl && (
            <a
              href={activeShipment.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <span>Carrier Page</span>
              <ExternalLink className="w-3 h-3 text-[#A6E3BF]" />
            </a>
          )}

          {onOpenRegisterModal && (
            <button
              onClick={onOpenRegisterModal}
              title="Add another parcel or edit"
              className="px-2.5 py-1.5 border border-[#CDD6CF] hover:bg-[#F2F5F3] text-[#153E2E] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              + Add Parcel
            </button>
          )}
        </div>
      </div>

      {/* Quota Fallback Notice if Manual Tracking */}
      {activeShipment.trackingSource === 'MANUAL_UPDATE' && (
        <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">AfterShip Free Tier Quota Reached:</span> Operating in{' '}
            <strong>Manual Tracking Fallback</strong> mode (AfterShip 100 req/day free API quota exceeded).
            Checkpoints are tracked via official carrier records, and direct carrier tracking links remain active.
          </div>
        </div>
      )}

      {/* Multiple Shipments Tabs (if split shipment) */}
      {shipments.length > 1 && (
        <div className="flex items-center gap-2 border-b border-[#EAEFEA] pb-2">
          <span className="text-xs font-medium text-[#79887D]">Parcels:</span>
          {shipments.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setSelectedShipmentId(s.id)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                s.id === activeShipment.id
                  ? 'bg-[#153E2E] text-white'
                  : 'bg-[#F2F5F3] text-[#425046] hover:bg-[#EAEFEA]'
              }`}
            >
              Parcel #{idx + 1} ({s.carrierName})
            </button>
          ))}
        </div>
      )}

      {/* Delivery Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
          <div className="text-[10px] uppercase font-sans text-[#79887D] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Estimated Delivery</span>
          </div>
          <div className="text-xs font-bold text-[#19211C]">
            {activeShipment.estimatedDeliveryDate
              ? new Date(activeShipment.estimatedDeliveryDate).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Not provided by carrier'}
          </div>
          {activeShipment.estimatedDeliveryDate && activeShipment.trackingSource === 'LIVE_PROVIDER' && (
            <span className="text-[10px] text-[#15803D] font-medium block">
              Carrier ETA (via AfterShip)
            </span>
          )}
        </div>

        <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
          <div className="text-[10px] uppercase font-sans text-[#79887D] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Last Verified Update</span>
          </div>
          <div className="text-xs font-bold text-[#19211C]">
            {activeShipment.lastSyncAt
              ? new Date(activeShipment.lastSyncAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }) +
                ' (' +
                new Date(activeShipment.lastSyncAt).toLocaleDateString() +
                ')'
              : 'Never'}
          </div>
        </div>

        <div className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1">
          <div className="text-[10px] uppercase font-sans text-[#79887D] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Latest Checkpoint</span>
          </div>
          <div className="text-xs font-bold text-[#19211C] truncate" title={latestEvent?.description}>
            {latestEvent ? latestEvent.description : 'Awaiting initial carrier scan'}
          </div>
        </div>
      </div>

      {/* Chronological Tracking Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
            Chronological Tracking Events ({activeEvents.length})
          </h5>
          <button
            onClick={() => setIsAddingEvent(!isAddingEvent)}
            className="text-xs text-[#153E2E] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isAddingEvent ? 'Close Event Form' : 'Add Status Checkpoint'}</span>
          </button>
        </div>

        {/* Manual Checkpoint Form */}
        {isAddingEvent && (
          <form
            onSubmit={handleAddManualEvent}
            className="p-4 bg-[#F8FAF8] border border-[#CDD6CF] rounded-lg space-y-3 text-xs animate-in fade-in duration-100"
          >
            <div className="font-bold text-[#19211C]">Add Manual Tracking Checkpoint</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#425046] mb-1 font-semibold">New Status</label>
                <select
                  value={manualStatus}
                  onChange={(e) => setManualStatus(e.target.value as NormalizedShipmentStatus)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CDD6CF] rounded-md"
                >
                  <option value="IN_TRANSIT">In Transit</option>
                  <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="AVAILABLE_FOR_PICKUP">Available for Pickup</option>
                  <option value="DELIVERY_EXCEPTION">Delivery Exception</option>
                  <option value="FAILED_DELIVERY_ATTEMPT">Failed Delivery Attempt</option>
                </select>
              </div>
              <div>
                <label className="block text-[#425046] mb-1 font-semibold">Location (optional)</label>
                <input
                  type="text"
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  placeholder="e.g. Dallas, TX Regional Sort Facility"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#CDD6CF] rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-[#425046] mb-1 font-semibold">Checkpoint Description *</label>
              <input
                type="text"
                required
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="e.g. Scanned at regional hub, on schedule for arrival"
                className="w-full px-2.5 py-1.5 bg-white border border-[#CDD6CF] rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingEvent(false)}
                className="px-3 py-1 border border-[#CDD6CF] text-[#637267] rounded hover:bg-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingEvent}
                className="px-3 py-1 bg-[#153E2E] text-white rounded font-semibold hover:bg-[#1E4D3A] cursor-pointer disabled:opacity-50"
              >
                {isSubmittingEvent ? 'Saving...' : 'Record Checkpoint'}
              </button>
            </div>
          </form>
        )}

        {/* Timeline Events List */}
        {activeEvents.length > 0 ? (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E3E7E4]">
            {activeEvents
              .slice()
              .reverse()
              .map((ev, idx) => {
                const isLatest = idx === 0;
                const evBadge = getStatusBadgeStyle(ev.status);
                return (
                  <div key={ev.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 bg-white ${
                        isLatest
                          ? `${evBadge.border} text-[#153E2E]`
                          : 'border-[#CDD6CF] text-[#79887D]'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${evBadge.dot}`} />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-[#19211C]">
                          {ev.description}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${evBadge.bg} ${evBadge.text}`}>
                          {evBadge.label}
                        </span>
                        {isLatest && (
                          <span className="text-[10px] text-[#153E2E] font-bold uppercase tracking-wider">
                            Latest
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-[#637267]">
                        <span>{new Date(ev.timestamp).toLocaleString()}</span>
                        {ev.location && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#79887D]" />
                              {ev.location}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="text-[#79887D]">
                          Source:{' '}
                          <span className={`font-semibold ${ev.eventSource === 'LIVE_PROVIDER' ? 'text-[#15803D]' : ev.eventSource === 'MANUAL_UPDATE' ? 'text-[#D97706]' : 'text-[#64748B]'}`}>
                            {ev.eventSource === 'LIVE_PROVIDER'
                              ? 'LIVE AFTERSHIP DATA'
                              : ev.eventSource === 'DEMO'
                              ? 'DEMO DATA'
                              : 'MANUAL UPDATE'}
                          </span>
                        </span>
                      </div>

                      {ev.carrierMessage && ev.carrierMessage !== ev.description && (
                        <p className="text-[11px] text-[#425046] italic bg-[#F8FAF8] p-2 rounded border border-[#EAEFEA]">
                          Carrier memo: {ev.carrierMessage}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="p-4 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg text-center text-xs text-[#79887D]">
            No checkpoint events have been recorded for this parcel yet.
          </div>
        )}
      </div>

      {/* AI Delivery Intelligence Section */}
      <div className="pt-4 border-t border-[#EAEFEA] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[#153E2E] font-display">
            <Sparkles className="w-4 h-4 text-[#153E2E]" />
            <span>BoundBuy Track · AI Delivery Intelligence</span>
          </div>
          <span className="text-[11px] text-[#79887D]">
            Grounded in verified carrier checkpoints
          </span>
        </div>

        {/* Quick Question Chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            'Where is my order now?',
            'When is my order expected to arrive?',
            'Has the shipment encountered a delay?',
            'Summarize the shipment timeline.',
            'What should I do if delivery fails?',
          ].map((promptText) => (
            <button
              key={promptText}
              onClick={() => handleAskDeliveryIntelligence(promptText)}
              disabled={isQueryingAi}
              className="px-2.5 py-1 bg-[#EEF4F0] hover:bg-[#DCECE0] text-[#153E2E] rounded-md font-medium text-[11px] transition-colors cursor-pointer disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>

        {/* AI Answer Display */}
        {isQueryingAi && (
          <div className="p-4 bg-[#F8FAF8] border border-[#C5DFC9] rounded-lg flex items-center gap-2 text-xs text-[#153E2E]">
            <RotateCw className="w-4 h-4 animate-spin text-[#153E2E]" />
            <span>Consulting logistics intelligence models against verified checkpoints...</span>
          </div>
        )}

        {aiError && (
          <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{aiError}</span>
          </div>
        )}

        {aiResult && !isQueryingAi && (
          <div className="p-4 bg-[#F7FAF7] border border-[#C5DFC9] rounded-xl space-y-3 animate-in fade-in duration-150">
            <div className="text-xs text-[#19211C] leading-relaxed">
              {aiResult.answer}
            </div>

            {aiResult.recommendedNextSteps && aiResult.recommendedNextSteps.length > 0 && (
              <div className="pt-2 border-t border-[#DCECE0] space-y-1">
                <div className="text-[11px] font-bold text-[#153E2E] uppercase">
                  Recommended Next Steps:
                </div>
                <ul className="list-disc list-inside text-[11px] text-[#425046] space-y-0.5">
                  {aiResult.recommendedNextSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-[#79887D] pt-1">
              <span className="flex items-center gap-2">
                <span>Grounded on {aiResult.groundedEventsCount} carrier event(s)</span>
                {aiResult.shipmentSummary?.trackingSourceLabel && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#EAEFEA] text-[#153E2E] border border-[#C5DFC9]">
                    {aiResult.shipmentSummary.trackingSourceLabel}
                  </span>
                )}
              </span>
              <button
                onClick={() => setAiResult(null)}
                className="text-[#153E2E] hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
