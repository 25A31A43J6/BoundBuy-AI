import React, { useState, useEffect } from 'react';
import { Truck, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { OrderRecord, ShipmentRecord } from '../../lib/types.js';
import {
  fetchSupportedCarriers,
  registerShipment,
  SupportedCarrier,
} from '../../lib/api.js';

interface ShipmentRegisterModalProps {
  order: OrderRecord;
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (shipment: ShipmentRecord) => void;
}

export const ShipmentRegisterModal: React.FC<ShipmentRegisterModalProps> = ({
  order,
  isOpen,
  onClose,
  onRegistered,
}) => {
  const [carriers, setCarriers] = useState<SupportedCarrier[]>([]);
  const [selectedCarrierSlug, setSelectedCarrierSlug] = useState('usps');
  const [customCarrierName, setCustomCarrierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dispatchedAt, setDispatchedAt] = useState(
    new Date().toISOString().substring(0, 16)
  );
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSupportedCarriers()
        .then((list) => {
          setCarriers(list);
          if (list.length > 0) {
            setSelectedCarrierSlug(list[0].slug);
          }
        })
        .catch((err) => console.error('Failed to load carriers', err));
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentCarrierObj = carriers.find((c) => c.slug === selectedCarrierSlug);
  const effectiveCarrierName =
    selectedCarrierSlug === 'other'
      ? customCarrierName.trim() || 'Custom Logistics'
      : currentCarrierObj?.name || 'USPS';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedNum = trackingNumber.trim();
    if (!trimmedNum || trimmedNum.length < 4) {
      setErrorMessage('Please enter a valid tracking number (at least 4 characters).');
      return;
    }

    if (selectedCarrierSlug === 'other' && !customCarrierName.trim()) {
      setErrorMessage('Please enter the name of the custom carrier.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerShipment(order.id, {
        carrierName: effectiveCarrierName,
        carrierSlug: selectedCarrierSlug,
        trackingNumber: trimmedNum,
        dispatchedAt: dispatchedAt ? new Date(dispatchedAt).toISOString() : undefined,
        estimatedDeliveryDate: estimatedDeliveryDate
          ? new Date(estimatedDeliveryDate).toISOString()
          : null,
        notes: notes.trim() || undefined,
        userEmail: order.buyerEmail,
      });

      if (res.success && res.shipment) {
        onRegistered(res.shipment);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register shipment tracking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F2E22]/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-[#E3E7E4] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#EAEFEA] flex items-center justify-between bg-[#F8FAF8]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EEF4F0] text-[#153E2E] flex items-center justify-center border border-[#C5DFC9]">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#19211C] font-display">
                Register Order Shipment
              </h3>
              <p className="text-xs text-[#637267]">
                Order {order.orderNumber} · {order.items.length} line items
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#79887D] hover:text-[#19211C] text-sm p-1 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg text-[#991B1B] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Carrier Selection */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-[#19211C]">
              Shipping Carrier
            </label>
            <select
              value={selectedCarrierSlug}
              onChange={(e) => setSelectedCarrierSlug(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
            >
              {carriers.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} {c.website ? `(${c.slug})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedCarrierSlug === 'other' && (
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#19211C]">
                Custom Carrier Name
              </label>
              <input
                type="text"
                value={customCarrierName}
                onChange={(e) => setCustomCarrierName(e.target.value)}
                placeholder="e.g. Local Courier Express, Freight Direct"
                className="w-full px-3 py-2 bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
              />
            </div>
          )}

          {/* Tracking Number */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-[#19211C]">
              Carrier Tracking Number *
            </label>
            <input
              type="text"
              required
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. 9400111899562537624108"
              className="w-full px-3 py-2 font-mono-data bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
            />
            <p className="text-[11px] text-[#79887D]">
              BoundBuy validates tracking formats and queries AfterShip when configured.
            </p>
          </div>

          {/* Dates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-semibold text-[#19211C]">
                Dispatch Timestamp
              </label>
              <input
                type="datetime-local"
                value={dispatchedAt}
                onChange={(e) => setDispatchedAt(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[#19211C]">
                Expected Delivery Date (optional)
              </label>
              <input
                type="date"
                value={estimatedDeliveryDate}
                onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-[#19211C]">
              Fulfillment Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Dispatched from Austin Warehouse via Priority Mail"
              className="w-full px-3 py-2 bg-white border border-[#CDD6CF] rounded-lg text-[#19211C] focus:outline-hidden focus:ring-2 focus:ring-[#153E2E]"
            />
          </div>

          {/* Payment & Integrity Notice */}
          <div className="p-3 bg-[#F8FAF8] border border-[#E3E7E4] rounded-lg text-[11px] text-[#637267] space-y-1">
            <div className="font-semibold text-[#153E2E] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Logistics Integrity Safeguard</span>
            </div>
            <div>
              Payment status ({order.paymentStatus}) is permanently separated from shipment status. Registering this tracking number records an authoritative fulfillment event without modifying your PayPal capture record.
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#CDD6CF] text-[#425046] hover:bg-[#F2F5F3] rounded-lg font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#153E2E] hover:bg-[#1E4D3A] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? 'Registering...' : 'Confirm Shipment Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
