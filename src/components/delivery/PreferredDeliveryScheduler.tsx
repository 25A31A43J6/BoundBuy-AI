import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  Check,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Coffee,
  MapPin,
  FileText,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import {
  DeliveryTimeSlotId,
  DeliveryPreference,
  DeliveryAddress,
} from '../../lib/types.js';
import { fetchDeliverySlots, DeliverySlotOption } from '../../lib/api.js';

interface PreferredDeliverySchedulerProps {
  value?: DeliveryPreference | null;
  onChange: (pref: DeliveryPreference) => void;
  minLeadDays?: number;
  initialAddress?: DeliveryAddress;
  readOnly?: boolean;
}

const DEFAULT_SLOTS: DeliverySlotOption[] = [
  {
    id: 'early_morning',
    label: 'Early Morning',
    timeRange: '6:00 AM – 8:00 AM',
    startTime: '06:00',
    endTime: '08:00',
    description: 'Best for deliveries before office hours',
  },
  {
    id: 'morning',
    label: 'Morning',
    timeRange: '9:00 AM – 10:00 AM',
    startTime: '09:00',
    endTime: '10:00',
    description: 'Standard morning business window',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    timeRange: '3:00 PM – 4:00 PM',
    startTime: '15:00',
    endTime: '16:00',
    description: 'Mid-afternoon delivery window',
  },
  {
    id: 'evening',
    label: 'Evening',
    timeRange: '6:00 PM – 7:00 PM',
    startTime: '18:00',
    endTime: '19:00',
    description: 'Post-work evening home window',
  },
  {
    id: 'night',
    label: 'Night',
    timeRange: '7:00 PM – 8:00 PM',
    startTime: '19:00',
    endTime: '20:00',
    description: 'Quiet evening/night delivery window',
  },
];

const PRESET_INSTRUCTIONS = [
  'Call before delivery',
  'Leave package with an authorized person / neighbor',
  'Ring the doorbell',
  'Contact me if delivery is delayed',
];

export const PreferredDeliveryScheduler: React.FC<PreferredDeliverySchedulerProps> = ({
  value,
  onChange,
  minLeadDays = 2,
  initialAddress,
  readOnly = false,
}) => {
  const [slots, setSlots] = useState<DeliverySlotOption[]>(DEFAULT_SLOTS);
  const [timezone, setTimezone] = useState<string>(value?.timezone || 'Asia/Kolkata');

  // Compute minimum selectable date (strictly no past dates; lead time applied)
  const today = new Date();
  const minDate = new Date(today.getTime() + Math.max(1, minLeadDays) * 24 * 60 * 60 * 1000);
  const minDateStr = minDate.toISOString().split('T')[0];

  // Selected state
  const [selectedDate, setSelectedDate] = useState<string>(
    value?.preferredDeliveryDate || minDateStr
  );
  const [selectedSlotId, setSelectedSlotId] = useState<DeliveryTimeSlotId>(
    value?.timeSlotId || 'morning'
  );
  const [instructions, setInstructions] = useState<string>(value?.instructions || '');
  const [selectedPresets, setSelectedPresets] = useState<string[]>(
    value?.selectedInstructionPresets || []
  );

  // Delivery Address
  const [recipientName, setRecipientName] = useState<string>(
    value?.recipientName || initialAddress?.recipientName || 'Alex Chen'
  );
  const [street, setStreet] = useState<string>(
    value?.deliveryAddress?.street || initialAddress?.street || '452 Innovation Blvd, Tech Park'
  );
  const [unit, setUnit] = useState<string>(
    value?.deliveryAddress?.unit || initialAddress?.unit || 'Suite 3B'
  );
  const [city, setCity] = useState<string>(
    value?.deliveryAddress?.city || initialAddress?.city || 'Bengaluru'
  );
  const [state, setState] = useState<string>(
    value?.deliveryAddress?.state || initialAddress?.state || 'Karnataka'
  );
  const [postalCode, setPostalCode] = useState<string>(
    value?.deliveryAddress?.postalCode || initialAddress?.postalCode || '560100'
  );
  const [country, setCountry] = useState<string>(
    value?.deliveryAddress?.country || initialAddress?.country || 'India'
  );

  // Fetch slot options from backend
  useEffect(() => {
    fetchDeliverySlots()
      .then((res) => {
        if (res.slots && res.slots.length > 0) {
          setSlots(res.slots);
        }
        if (res.defaultTimezone && !value?.timezone) {
          setTimezone(res.defaultTimezone);
        }
      })
      .catch((err) => {
        console.warn('Using default delivery slots fallback:', err);
      });
  }, [value?.timezone]);

  // Sync state upward whenever values change
  useEffect(() => {
    const slotDef = slots.find((s) => s.id === selectedSlotId) || DEFAULT_SLOTS[1];

    const compositeInstructions = [
      ...selectedPresets,
      ...(instructions.trim() ? [instructions.trim()] : []),
    ].join('; ');

    const pref: DeliveryPreference = {
      preferredDeliveryDate: selectedDate,
      timeSlotId: selectedSlotId,
      timeSlotLabel: `${slotDef.label}: ${slotDef.timeRange}`,
      startTime: slotDef.startTime,
      endTime: slotDef.endTime,
      timezone,
      instructions: compositeInstructions || undefined,
      selectedInstructionPresets: selectedPresets,
      recipientName: recipientName.trim() || undefined,
      deliveryAddress: {
        recipientName: recipientName.trim() || undefined,
        street: street.trim(),
        unit: unit.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        country: country.trim(),
      },
    };

    onChange(pref);
  }, [
    selectedDate,
    selectedSlotId,
    timezone,
    instructions,
    selectedPresets,
    recipientName,
    street,
    unit,
    city,
    state,
    postalCode,
    country,
    slots,
  ]);

  const togglePreset = (preset: string) => {
    if (readOnly) return;
    setSelectedPresets((prev) =>
      prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset]
    );
  };

  const getSlotIcon = (id: DeliveryTimeSlotId) => {
    switch (id) {
      case 'early_morning':
        return <Sunrise className="w-5 h-5 text-amber-500" />;
      case 'morning':
        return <Sun className="w-5 h-5 text-amber-600" />;
      case 'afternoon':
        return <Coffee className="w-5 h-5 text-[#24523F]" />;
      case 'evening':
        return <Sunset className="w-5 h-5 text-indigo-500" />;
      case 'night':
        return <Moon className="w-5 h-5 text-indigo-600" />;
    }
  };

  const currentSlotDef = slots.find((s) => s.id === selectedSlotId) || DEFAULT_SLOTS[1];

  return (
    <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAEFEA] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#153E2E] flex items-center justify-center text-white">
              <Clock className="w-4 h-4 text-[#88D4A8]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#19211C] font-display">
                Preferred Delivery Time
              </h3>
              <p className="text-xs text-[#637267]">
                Choose when you prefer packages to arrive at your delivery address
              </p>
            </div>
          </div>
        </div>

        {/* Timezone Indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F4F6F4] border border-[#D5DDD7] rounded-lg text-xs text-[#2D3A31]">
          <Globe className="w-3.5 h-3.5 text-[#153E2E]" />
          <span>Local Timezone:</span>
          <strong className="font-mono-data text-[#153E2E]">{timezone} (IST)</strong>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="p-3.5 bg-[#F9FAF9] border border-[#E2EBE5] rounded-xl text-xs text-[#2D3A31] flex items-start gap-2.5">
        <HelpCircle className="w-4 h-4 text-[#153E2E] mt-0.5 shrink-0" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-bold text-[#153E2E]">Fulfillment Notice:</span>
          <p className="text-[#637267]">
            Your requested delivery window will be sent to the supplier and carrier upon checkout.
            To guarantee transparency, this preference is treated as a request until the carrier or fulfillment provider confirms the appointment.
          </p>
        </div>
      </div>

      {/* Date Picker Section */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-[#19211C] uppercase tracking-wider">
          1. Select Preferred Delivery Date
        </label>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Calendar className="w-4 h-4 text-[#637267] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="date"
              min={minDateStr}
              value={selectedDate}
              disabled={readOnly}
              onChange={(e) => {
                if (e.target.value >= minDateStr) {
                  setSelectedDate(e.target.value);
                }
              }}
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#D5DDD7] rounded-lg text-xs font-semibold text-[#19211C] focus:outline-none focus:ring-1 focus:ring-[#153E2E] disabled:bg-[#F4F6F4]"
            />
          </div>
          <span className="text-[11px] text-[#637267]">
            Earliest available based on supplier fulfillment lead time ({minLeadDays} business days):{' '}
            <strong className="text-[#19211C]">{minDateStr}</strong>
          </span>
        </div>
      </div>

      {/* Time Slot Cards: 5 Distinctive Selectable Slots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-[#19211C] uppercase tracking-wider">
            2. Select One Preferred Time Window
          </label>
          <span className="text-[11px] text-[#637267]">12-hour format</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {slots.map((slot) => {
            const isSelected = selectedSlotId === slot.id;

            return (
              <button
                key={slot.id}
                type="button"
                disabled={readOnly}
                onClick={() => setSelectedSlotId(slot.id)}
                className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'border-[#153E2E] bg-[#EEF4F0] ring-1 ring-[#153E2E] shadow-xs'
                    : 'border-[#E3E7E4] bg-white hover:border-[#A3B8AA] hover:bg-[#FAFBF9]'
                } ${readOnly ? 'opacity-80 cursor-default' : ''}`}
              >
                {/* Header with Icon and Checkmark */}
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-white border border-[#EAEFEA] shadow-2xs">
                    {getSlotIcon(slot.id)}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#153E2E] text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Slot Details */}
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#19211C]">
                    {slot.label}
                  </div>
                  <div className="text-xs font-extrabold text-[#153E2E] font-mono-data">
                    {slot.timeRange}
                  </div>
                  <p className="text-[10px] text-[#637267] line-clamp-2 mt-1">
                    {slot.description}
                  </p>
                </div>

                {/* Footer Indicator */}
                <div className="pt-2 border-t border-[#EAEFEA]/70 flex items-center justify-between text-[10px]">
                  <span className={isSelected ? 'font-bold text-[#153E2E]' : 'text-[#79887D]'}>
                    {isSelected ? '✓ Selected Slot' : 'Click to select'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Delivery Address Review */}
      <div className="space-y-3 pt-2 border-t border-[#EAEFEA]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#19211C] uppercase tracking-wider">
          <MapPin className="w-3.5 h-3.5 text-[#153E2E]" />
          <span>3. Home Delivery Address</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#637267] mb-1 font-semibold">
              Recipient Name
            </label>
            <input
              type="text"
              value={recipientName}
              disabled={readOnly}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Alex Chen"
              className="w-full px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#637267] mb-1 font-semibold">
              Street Address
            </label>
            <input
              type="text"
              value={street}
              disabled={readOnly}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="House/Building #, Street"
              className="w-full px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#637267] mb-1 font-semibold">
              Apartment / Suite (Optional)
            </label>
            <input
              type="text"
              value={unit}
              disabled={readOnly}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Apt, Suite, Unit"
              className="w-full px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#637267] mb-1 font-semibold">
              City
            </label>
            <input
              type="text"
              value={city}
              disabled={readOnly}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="w-full px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#637267] mb-1 font-semibold">
              State & Postal Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={state}
                disabled={readOnly}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className="w-1/2 px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
              />
              <input
                type="text"
                value={postalCode}
                disabled={readOnly}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="PIN / Zip"
                className="w-1/2 px-3 py-1.5 border border-[#D5DDD7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Instructions */}
      <div className="space-y-3 pt-2 border-t border-[#EAEFEA]">
        <label className="block text-xs font-bold text-[#19211C] uppercase tracking-wider">
          4. Delivery Instructions (Optional)
        </label>

        {/* Preset Chips */}
        <div className="flex flex-wrap gap-2">
          {PRESET_INSTRUCTIONS.map((preset) => {
            const isChecked = selectedPresets.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                disabled={readOnly}
                onClick={() => togglePreset(preset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  isChecked
                    ? 'bg-[#153E2E] text-white shadow-2xs'
                    : 'bg-[#F4F6F4] text-[#2D3A31] border border-[#D5DDD7] hover:bg-[#EAEFEA]'
                }`}
              >
                <span>{isChecked ? '✓' : '+'}</span>
                <span>{preset}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Instructions */}
        <div>
          <textarea
            rows={2}
            value={instructions}
            disabled={readOnly}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Add any specific driver notes (e.g., Gate code 4821, leave on porch, call 10 mins before arrival)..."
            className="w-full p-3 border border-[#D5DDD7] rounded-lg text-xs text-[#19211C] bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
          />
        </div>
      </div>

      {/* Summary Box */}
      <div className="p-4 bg-[#EEF4F0] border border-[#C5DFC9] rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-0.5 text-xs">
          <div className="text-[11px] font-bold text-[#153E2E] uppercase tracking-wider">
            Selected Delivery Schedule Summary
          </div>
          <div className="text-sm font-extrabold text-[#19211C]">
            {selectedDate} · {currentSlotDef.label} ({currentSlotDef.timeRange})
          </div>
          <div className="text-[11px] text-[#637267]">
            Recipient: {recipientName} · {street}, {city} · Timezone: {timezone}
          </div>
        </div>

        <div className="shrink-0 px-3 py-1.5 bg-white border border-[#C5DFC9] rounded-lg text-center shadow-2xs">
          <div className="text-[10px] text-[#637267] uppercase font-bold">Status</div>
          <div className="text-xs font-extrabold text-[#153E2E]">Requested Preference</div>
        </div>
      </div>
    </div>
  );
};
