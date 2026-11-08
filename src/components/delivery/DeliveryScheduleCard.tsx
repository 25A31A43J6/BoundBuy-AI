import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Truck,
  ShieldCheck,
  UserCheck,
  XCircle,
  HelpCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
  History,
} from 'lucide-react';
import {
  OrderRecord,
  DeliveryPreference,
  DeliverySchedulingStatus,
  DeliveryTimeSlotId,
  SchedulingHistoryEntry,
} from '../../lib/types.js';
import {
  confirmOrderDeliverySchedule,
  rescheduleOrderDelivery,
  DeliverySlotOption,
  fetchDeliverySlots,
} from '../../lib/api.js';

interface DeliveryScheduleCardProps {
  order: OrderRecord;
  onOrderUpdated?: (updatedOrder: OrderRecord) => void;
  currentUserRole?: 'buyer' | 'staff' | 'admin';
}

const STATUS_BADGE_MAP: Record<
  DeliverySchedulingStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  NOT_REQUESTED: {
    label: 'Standard Delivery (No Window Requested)',
    bg: 'bg-[#F4F6F4]',
    text: 'text-[#637267]',
    border: 'border-[#D5DDD7]',
    desc: 'Package will be delivered within standard carrier transit turnaround.',
  },
  REQUESTED: {
    label: 'Requested Preference (Awaiting Confirmation)',
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#92400E]',
    border: 'border-[#FDE68A]',
    desc: 'Your preferred arrival window has been submitted to fulfillment and is awaiting appointment confirmation.',
  },
  PENDING_CONFIRMATION: {
    label: 'Pending Carrier Confirmation',
    bg: 'bg-[#EFF6FF]',
    text: 'text-[#1E40AF]',
    border: 'border-[#BFDBFE]',
    desc: 'Scheduling request transmitted to carrier hub. Awaiting route scheduling confirmation.',
  },
  CONFIRMED: {
    label: 'Confirmed Delivery Appointment',
    bg: 'bg-[#E3F2E8]',
    text: 'text-[#153E2E]',
    border: 'border-[#C5DFC9]',
    desc: 'Delivery appointment has been formally verified and scheduled for your designated time window.',
  },
  UNAVAILABLE: {
    label: 'Requested Window Unavailable',
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#991B1B]',
    border: 'border-[#FCA5A5]',
    desc: 'The requested time window was not available for your route. Please select an alternative slot.',
  },
  NOT_SUPPORTED: {
    label: 'Timed Scheduling Not Supported',
    bg: 'bg-[#F3F4F6]',
    text: 'text-[#374151]',
    border: 'border-[#E5E7EB]',
    desc: 'Assigned regional delivery service operates on open-window routing. Your preference is noted on package label.',
  },
  RESCHEDULE_REQUIRED: {
    label: 'Reschedule Required',
    bg: 'bg-[#FFF7ED]',
    text: 'text-[#C2410C]',
    border: 'border-[#FFEDD5]',
    desc: 'Delivery needs rescheduling due to route adjustments or buyer request.',
  },
  COMPLETED: {
    label: 'Delivered',
    bg: 'bg-[#DCFCE7]',
    text: 'text-[#14532D]',
    border: 'border-[#BBF7D0]',
    desc: 'Package successfully delivered during designated delivery window.',
  },
};

const FIVE_SLOTS: { id: DeliveryTimeSlotId; label: string; range: string }[] = [
  { id: 'early_morning', label: 'Early Morning', range: '6:00 AM – 8:00 AM' },
  { id: 'morning', label: 'Morning', range: '9:00 AM – 10:00 AM' },
  { id: 'afternoon', label: 'Afternoon', range: '3:00 PM – 4:00 PM' },
  { id: 'evening', label: 'Evening', range: '6:00 PM – 7:00 PM' },
  { id: 'night', label: 'Night', range: '7:00 PM – 8:00 PM' },
];

export const DeliveryScheduleCard: React.FC<DeliveryScheduleCardProps> = ({
  order,
  onOrderUpdated,
  currentUserRole = 'staff',
}) => {
  const pref = order.deliveryPreference;
  const status = order.deliverySchedulingStatus || (pref ? 'REQUESTED' : 'NOT_REQUESTED');
  const badge = STATUS_BADGE_MAP[status];
  const confirmed = order.confirmedDeliveryWindow;

  // Modals & Panels state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isStaffManaging, setIsStaffManaging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reschedule Form state
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [newDate, setNewDate] = useState(pref?.preferredDeliveryDate || tomorrow);
  const [newSlotId, setNewSlotId] = useState<DeliveryTimeSlotId>(pref?.timeSlotId || 'morning');
  const [newInstructions, setNewInstructions] = useState(pref?.instructions || '');

  // Staff Management state
  const [staffAction, setStaffAction] = useState<
    'CONFIRM' | 'MARK_UNAVAILABLE' | 'NOT_SUPPORTED' | 'RECORD_DELIVERY'
  >('CONFIRM');
  const [staffActor, setStaffActor] = useState('BoundBuy Fulfillment Team');
  const [confirmType, setConfirmType] = useState<'SUPPLIER_ADMIN' | 'CARRIER'>('SUPPLIER_ADMIN');
  const [confirmDate, setConfirmDate] = useState(pref?.preferredDeliveryDate || tomorrow);
  const [confirmStart, setConfirmStart] = useState(pref?.startTime || '09:00');
  const [confirmEnd, setConfirmEnd] = useState(pref?.endTime || '10:00');
  const [carrierRef, setCarrierRef] = useState('');
  const [staffReason, setStaffReason] = useState('');
  const [altSlotId, setAltSlotId] = useState<DeliveryTimeSlotId>('afternoon');

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await rescheduleOrderDelivery(order.id, {
        preferredDeliveryDate: newDate,
        timeSlotId: newSlotId,
        instructions: newInstructions,
        userEmail: order.buyerEmail,
      });
      setIsRescheduling(false);
      if (onOrderUpdated && res.order) {
        onOrderUpdated(res.order);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reschedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStaffActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await confirmOrderDeliverySchedule(order.id, {
        action: staffAction,
        confirmedBy: staffActor,
        confirmedByType: confirmType,
        date: confirmDate,
        startTime: confirmStart,
        endTime: confirmEnd,
        carrierReference: carrierRef || undefined,
        reason: staffReason || undefined,
        alternativeSlotId: altSlotId,
        isStaffOrAdmin: true,
      });
      setIsStaffManaging(false);
      if (onOrderUpdated && res.order) {
        onOrderUpdated(res.order);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to process fulfillment action');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEligibleForReschedule = order.businessStatus !== 'delivered' && status !== 'COMPLETED';

  return (
    <div className="bg-white border border-[#E3E7E4] rounded-xl p-5 shadow-xs space-y-4">
      {/* Title & Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAEFEA] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#153E2E] flex items-center justify-center text-white">
            <Clock className="w-4 h-4 text-[#88D4A8]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#19211C] font-display">
              Your Delivery Schedule
            </h3>
            <p className="text-[11px] text-[#637267]">
              Customer requested delivery window & fulfillment appointment tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg text-xs text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Grid of Key Scheduling Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Card 1: Requested Delivery Time */}
        <div className="p-3.5 bg-[#FAFBF9] border border-[#E3E7E4] rounded-lg space-y-1">
          <div className="text-[10px] text-[#637267] uppercase font-bold tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Requested Delivery Time</span>
          </div>
          {pref ? (
            <div>
              <div className="font-extrabold text-[#19211C] text-sm font-mono-data">
                {pref.preferredDeliveryDate}
              </div>
              <div className="text-xs font-bold text-[#153E2E]">{pref.timeSlotLabel}</div>
              <div className="text-[10px] text-[#637267] mt-0.5">
                Local Timezone: {pref.timezone}
              </div>
            </div>
          ) : (
            <div className="text-[#637267] italic pt-1">
              Standard turnaround (no preferred time requested)
            </div>
          )}
        </div>

        {/* Card 2: Confirmed Appointment */}
        <div className="p-3.5 bg-[#FAFBF9] border border-[#E3E7E4] rounded-lg space-y-1">
          <div className="text-[10px] text-[#637267] uppercase font-bold tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Confirmed Appointment</span>
          </div>
          {confirmed ? (
            <div>
              <div className="font-extrabold text-[#153E2E] text-sm font-mono-data">
                {confirmed.date} · {confirmed.startTime} – {confirmed.endTime}
              </div>
              <div className="text-[11px] font-semibold text-[#19211C] mt-0.5">
                {confirmed.confirmedByType === 'CARRIER'
                  ? '✓ Carrier Confirmed'
                  : '✓ Supplier / Staff Confirmed'}
              </div>
              <div className="text-[10px] text-[#637267]">
                By: {confirmed.confirmedBy}{' '}
                {confirmed.carrierReference ? `(Ref: ${confirmed.carrierReference})` : ''}
              </div>
            </div>
          ) : status === 'UNAVAILABLE' ? (
            <div className="text-[#991B1B] font-bold pt-1">
              Slot Unavailable at Hub — Rescheduling required
            </div>
          ) : status === 'NOT_SUPPORTED' ? (
            <div className="text-[#4B5563] pt-1">
              Carrier does not support fixed timed slots
            </div>
          ) : (
            <div className="text-[#B45309] font-medium pt-1">
              Pending confirmation from fulfillment carrier
            </div>
          )}
        </div>

        {/* Card 3: Actual Delivery / Outcome */}
        <div className="p-3.5 bg-[#FAFBF9] border border-[#E3E7E4] rounded-lg space-y-1">
          <div className="text-[10px] text-[#637267] uppercase font-bold tracking-wider flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Actual Delivery Outcome</span>
          </div>
          {order.actualDeliveredAt ? (
            <div>
              <div className="font-extrabold text-[#14532D] text-sm">
                ✓ Delivered on Schedule
              </div>
              <div className="text-[11px] text-[#637267] font-mono-data">
                {new Date(order.actualDeliveredAt).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="text-[#637267] pt-1">
              In progress (Awaiting arrival)
            </div>
          )}
        </div>
      </div>

      {/* Special Delivery Instructions on File */}
      {pref?.instructions && (
        <div className="p-3 bg-[#F4F6F4] border border-[#D5DDD7] rounded-lg text-xs space-y-1">
          <div className="font-bold text-[#153E2E] flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>Customer Delivery Instructions:</span>
          </div>
          <p className="text-[#2D3A31] pl-5">{pref.instructions}</p>
        </div>
      )}

      {/* Destination Address Preview */}
      {pref?.deliveryAddress && (
        <div className="text-xs text-[#637267] flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#153E2E] shrink-0" />
          <span>
            Delivery Destination:{' '}
            <strong className="text-[#19211C]">
              {pref.recipientName || order.buyerEmail}
            </strong>{' '}
            · {pref.deliveryAddress.street}
            {pref.deliveryAddress.unit ? `, ${pref.deliveryAddress.unit}` : ''},{' '}
            {pref.deliveryAddress.city}, {pref.deliveryAddress.state}{' '}
            {pref.deliveryAddress.postalCode} ({pref.deliveryAddress.country})
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAEFEA]">
        <div className="flex items-center gap-2">
          {/* History Toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-1.5 bg-[#FAFBF9] hover:bg-[#EAEFEA] border border-[#D5DDD7] rounded-lg text-xs font-semibold text-[#2D3A31] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#637267]" />
            <span>Scheduling History ({order.schedulingHistory?.length || 0})</span>
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Reschedule Button (Buyer / Customer action) */}
          {isEligibleForReschedule && (
            <button
              type="button"
              onClick={() => setIsRescheduling(true)}
              className="px-3.5 py-1.5 bg-white hover:bg-[#FAFBF9] border border-[#153E2E] text-[#153E2E] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Reschedule Delivery Time</span>
            </button>
          )}

          {/* Supplier / Staff Management Panel Toggle */}
          <button
            type="button"
            onClick={() => setIsStaffManaging(!isStaffManaging)}
            className="px-3.5 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
          >
            <UserCheck className="w-3.5 h-3.5 text-[#88D4A8]" />
            <span>Fulfillment Staff Controls</span>
            {isStaffManaging ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 text-[#88D4A8]" />}
          </button>
        </div>
      </div>

      {/* History Timeline */}
      {showHistory && (
        <div className="p-4 bg-[#F8FAF8] border border-[#E3E7E4] rounded-lg space-y-2 text-xs">
          <div className="font-bold text-[#19211C]">Scheduling Audit History</div>
          {order.schedulingHistory && order.schedulingHistory.length > 0 ? (
            <div className="space-y-2 divide-y divide-[#EAEFEA]">
              {order.schedulingHistory.map((h, i) => (
                <div key={h.id || i} className="pt-2 first:pt-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#153E2E]">Status: {h.status}</span>
                    <span className="text-[#637267] font-mono-data">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[#2D3A31] mt-0.5">{h.reason}</div>
                  <div className="text-[10px] text-[#637267]">Actor: {h.actor}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[#637267] italic">No scheduling changes recorded yet.</div>
          )}
        </div>
      )}

      {/* Reschedule Modal */}
      {isRescheduling && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#D5DDD7] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAEFEA] pb-3">
              <h3 className="text-sm font-bold text-[#19211C] font-display flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#153E2E]" />
                <span>Reschedule Order {order.orderNumber}</span>
              </h3>
              <button
                onClick={() => setIsRescheduling(false)}
                className="text-[#637267] hover:text-[#19211C] font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#19211C] mb-1">
                  New Delivery Date
                </label>
                <input
                  type="date"
                  min={tomorrow}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D5DDD7] rounded-lg font-semibold focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#19211C] mb-1">
                  New Preferred Time Window
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {FIVE_SLOTS.map((s) => (
                    <label
                      key={s.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer ${
                        newSlotId === s.id
                          ? 'border-[#153E2E] bg-[#EEF4F0] font-bold text-[#153E2E]'
                          : 'border-[#E3E7E4] hover:bg-[#FAFBF9]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="rescheduleSlot"
                          checked={newSlotId === s.id}
                          onChange={() => setNewSlotId(s.id)}
                          className="accent-[#153E2E]"
                        />
                        <span>{s.label}</span>
                      </div>
                      <span className="font-mono-data text-[11px]">{s.range}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#19211C] mb-1">
                  Updated Delivery Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder="Gate code, call before delivery, etc."
                  className="w-full p-2.5 border border-[#D5DDD7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#EAEFEA]">
                <button
                  type="button"
                  onClick={() => setIsRescheduling(false)}
                  className="px-4 py-2 border border-[#D5DDD7] rounded-lg font-semibold hover:bg-[#FAFBF9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#153E2E] text-white rounded-lg font-bold hover:bg-[#1E4D3A] shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Rescheduling...' : 'Submit Reschedule Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Management Panel */}
      {isStaffManaging && (
        <div className="p-4 bg-[#F2F5F3] border border-[#C5DFC9] rounded-xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-[#D5DDD7] pb-2">
            <div className="font-bold text-[#153E2E] flex items-center gap-1.5">
              <UserCheck className="w-4 h-4" />
              <span>Fulfillment & Dispatch Administration</span>
            </div>
            <span className="text-[10px] text-[#637267]">Authorized Staff Mode</span>
          </div>

          <form onSubmit={handleStaffActionSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#19211C] mb-1">
                Select Fulfillment Action
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'CONFIRM', label: 'Confirm Window' },
                  { id: 'MARK_UNAVAILABLE', label: 'Mark Unavailable' },
                  { id: 'NOT_SUPPORTED', label: 'Not Supported' },
                  { id: 'RECORD_DELIVERY', label: 'Record Delivered' },
                ].map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setStaffAction(act.id as any)}
                    className={`py-1.5 px-2 rounded-lg border text-center font-bold text-[11px] cursor-pointer transition-colors ${
                      staffAction === act.id
                        ? 'bg-[#153E2E] text-white border-[#153E2E]'
                        : 'bg-white border-[#D5DDD7] text-[#2D3A31] hover:bg-[#EAEFEA]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            {staffAction === 'CONFIRM' && (
              <div className="p-3 bg-white border border-[#D5DDD7] rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-[#153E2E]">
                  Confirm Appointment Window
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                      Confirmed Date
                    </label>
                    <input
                      type="date"
                      value={confirmDate}
                      onChange={(e) => setConfirmDate(e.target.value)}
                      className="w-full px-2 py-1 border border-[#D5DDD7] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={confirmStart}
                      onChange={(e) => setConfirmStart(e.target.value)}
                      className="w-full px-2 py-1 border border-[#D5DDD7] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={confirmEnd}
                      onChange={(e) => setConfirmEnd(e.target.value)}
                      className="w-full px-2 py-1 border border-[#D5DDD7] rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                      Confirmation Source
                    </label>
                    <select
                      value={confirmType}
                      onChange={(e) => setConfirmType(e.target.value as any)}
                      className="w-full px-2 py-1 border border-[#D5DDD7] rounded text-xs"
                    >
                      <option value="SUPPLIER_ADMIN">Supplier / Staff Confirmed</option>
                      <option value="CARRIER">Direct Carrier API Confirmed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                      Carrier Appointment Ref (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. APPT-USPS-8291"
                      value={carrierRef}
                      onChange={(e) => setCarrierRef(e.target.value)}
                      className="w-full px-2 py-1 border border-[#D5DDD7] rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {staffAction === 'MARK_UNAVAILABLE' && (
              <div className="p-3 bg-white border border-[#D5DDD7] rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-[#991B1B]">
                  Mark Slot Unavailable & Propose Alternative
                </div>
                <div>
                  <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                    Reason for Unavailability
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. High delivery volume / regional hub closed during early morning"
                    value={staffReason}
                    onChange={(e) => setStaffReason(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D5DDD7] rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#637267] font-semibold mb-0.5">
                    Suggest Alternative Slot
                  </label>
                  <select
                    value={altSlotId}
                    onChange={(e) => setAltSlotId(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-[#D5DDD7] rounded text-xs"
                  >
                    {FIVE_SLOTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.range})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {staffAction === 'NOT_SUPPORTED' && (
              <div className="p-3 bg-white border border-[#D5DDD7] rounded-lg space-y-2 text-xs">
                <div className="font-bold text-[#374151]">
                  Mark Scheduling As Not Supported by Carrier
                </div>
                <p className="text-[#637267] text-[11px]">
                  Assigned courier does not support appointment windows. Package will ship under standard tracking.
                </p>
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={staffReason}
                  onChange={(e) => setStaffReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#D5DDD7] rounded text-xs"
                />
              </div>
            )}

            {staffAction === 'RECORD_DELIVERY' && (
              <div className="p-3 bg-white border border-[#D5DDD7] rounded-lg space-y-2 text-xs">
                <div className="font-bold text-[#14532D]">
                  Record Verified Delivery Outcome
                </div>
                <p className="text-[#637267] text-[11px]">
                  Marks order and delivery schedule as COMPLETED. Recorded with authoritative staff signature.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5 text-[11px] text-[#637267]">
                <span>Actor Signature:</span>
                <input
                  type="text"
                  value={staffActor}
                  onChange={(e) => setStaffActor(e.target.value)}
                  className="px-2 py-0.5 border border-[#D5DDD7] rounded text-xs bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white rounded font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Applying...' : 'Apply Fulfillment Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
