import type {
  DeliveryTimeSlotId,
  DeliverySchedulingStatus,
  DeliveryPreference,
  DeliveryConfirmationWindow,
  SchedulingHistoryEntry,
  OrderRecord,
  ShipmentRecord,
} from '../types/index.ts';
import { store } from './store.ts';

export interface DeliverySlotDefinition {
  id: DeliveryTimeSlotId;
  label: string;
  timeRange: string;
  startTime: string; // 24-hour format "HH:MM"
  endTime: string;   // 24-hour format "HH:MM"
  description: string;
}

export const DELIVERY_TIME_SLOTS: DeliverySlotDefinition[] = [
  {
    id: 'early_morning',
    label: 'Early Morning',
    timeRange: '6:00 AM – 8:00 AM',
    startTime: '06:00',
    endTime: '08:00',
    description: 'Pre-work & early morning delivery window',
  },
  {
    id: 'morning',
    label: 'Morning',
    timeRange: '9:00 AM – 10:00 AM',
    startTime: '09:00',
    endTime: '10:00',
    description: 'Standard morning business hours window',
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

export const DEFAULT_DELIVERY_TIMEZONE = 'Asia/Kolkata';

export const INSTRUCTION_PRESETS = [
  'Call before delivery',
  'Leave package with an authorized person / neighbor',
  'Ring the doorbell',
  'Contact me if delivery is delayed',
];

export class DeliverySchedulingService {
  /**
   * Retrieves all five standard selectable delivery time slots
   */
  public getAvailableSlots(): DeliverySlotDefinition[] {
    return DELIVERY_TIME_SLOTS;
  }

  /**
   * Validates a time slot ID and retrieves authoritative definitions
   */
  public getSlotById(slotId: string): DeliverySlotDefinition | undefined {
    return DELIVERY_TIME_SLOTS.find((s) => s.id === slotId);
  }

  /**
   * Validates a preferred delivery date against fulfillment lead times and rejects past dates
   */
  public validateDeliveryDate(
    dateStr: string,
    minLeadDays: number = 0,
    timezone: string = DEFAULT_DELIVERY_TIMEZONE
  ): { valid: boolean; error?: string; minDateAllowed?: string } {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      return { valid: false, error: 'Invalid date format. Expected YYYY-MM-DD.' };
    }

    const targetDate = new Date(`${dateStr.trim()}T00:00:00Z`);
    if (isNaN(targetDate.getTime())) {
      return { valid: false, error: 'Invalid date value.' };
    }

    // Determine current date in the specified timezone
    const now = new Date();
    // Create zero-hour timestamp for today in UTC comparison
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || DEFAULT_DELIVERY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const todayDate = new Date(`${todayStr}T00:00:00Z`);

    if (targetDate.getTime() < todayDate.getTime()) {
      return {
        valid: false,
        error: `Selected delivery date (${dateStr}) is in the past. Please choose a future delivery date.`,
        minDateAllowed: todayStr,
      };
    }

    // Check minimum lead days if applicable
    if (minLeadDays > 0) {
      const minLeadDate = new Date(todayDate.getTime() + minLeadDays * 24 * 60 * 60 * 1000);
      const minDateStr = minLeadDate.toISOString().split('T')[0];
      if (targetDate.getTime() < minLeadDate.getTime()) {
        return {
          valid: false,
          error: `Selected date (${dateStr}) is earlier than supplier fulfillment lead time (${minLeadDays} business days). Earliest permitted date is ${minDateStr}.`,
          minDateAllowed: minDateStr,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Normalizes and validates customer delivery preference inputs
   */
  public buildValidatedPreference(input: {
    preferredDeliveryDate: string;
    timeSlotId: string;
    timezone?: string;
    instructions?: string;
    selectedInstructionPresets?: string[];
    recipientName?: string;
    deliveryAddress?: {
      street: string;
      unit?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    minLeadDays?: number;
  }): { valid: boolean; preference?: DeliveryPreference; error?: string } {
    const slot = this.getSlotById(input.timeSlotId);
    if (!slot) {
      return {
        valid: false,
        error: `Invalid time slot ID "${input.timeSlotId}". Allowed values: ${DELIVERY_TIME_SLOTS.map((s) => s.id).join(', ')}`,
      };
    }

    const timezone = (input.timezone && input.timezone.trim()) || DEFAULT_DELIVERY_TIMEZONE;
    const dateVal = this.validateDeliveryDate(input.preferredDeliveryDate, input.minLeadDays || 0, timezone);
    if (!dateVal.valid) {
      return { valid: false, error: dateVal.error };
    }

    const preference: DeliveryPreference = {
      preferredDeliveryDate: input.preferredDeliveryDate.trim(),
      timeSlotId: slot.id,
      timeSlotLabel: `${slot.label}: ${slot.timeRange}`,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone,
      instructions: input.instructions?.trim() || undefined,
      selectedInstructionPresets: input.selectedInstructionPresets || [],
      recipientName: input.recipientName?.trim() || undefined,
      deliveryAddress: input.deliveryAddress,
    };

    return { valid: true, preference };
  }

  /**
   * Applies delivery preference to an existing order and records audit trail
   */
  public applyDeliveryPreference(
    order: OrderRecord,
    preference: DeliveryPreference,
    actorEmail: string = 'customer'
  ): OrderRecord {
    const isNew = !order.deliveryPreference;
    const prevStatus = order.deliverySchedulingStatus || 'NOT_REQUESTED';
    const newStatus: DeliverySchedulingStatus = 'REQUESTED';

    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor: actorEmail,
      reason: isNew ? 'Customer selected preferred delivery window' : 'Customer updated preferred delivery window',
      details: {
        date: preference.preferredDeliveryDate,
        timeSlotId: preference.timeSlotId,
        timeSlotLabel: preference.timeSlotLabel,
        timezone: preference.timezone,
        instructions: preference.instructions,
      },
    };

    order.deliveryPreference = preference;
    order.deliverySchedulingStatus = newStatus;
    order.lastSchedulingUpdate = new Date().toISOString();
    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];

    // If order has existing shipments, attach the preference to primary shipment
    const shipments = store.getShipmentsByOrderId(order.id);
    for (const ship of shipments) {
      ship.deliveryPreference = preference;
      ship.deliverySchedulingStatus = newStatus;
      store.saveShipment(ship);
    }

    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_PREFERENCE_SET',
      entityId: order.id,
      actor: actorEmail,
      summary: `Preferred delivery time set for Order ${order.orderNumber}: ${preference.preferredDeliveryDate} (${preference.timeSlotLabel}) [${preference.timezone}]`,
      details: {
        orderNumber: order.orderNumber,
        preferredDeliveryDate: preference.preferredDeliveryDate,
        timeSlotId: preference.timeSlotId,
        timeSlotLabel: preference.timeSlotLabel,
        timezone: preference.timezone,
        instructions: preference.instructions,
        prevStatus,
        newStatus,
      },
    });

    return order;
  }

  /**
   * Processes a staff or carrier delivery confirmation
   */
  public confirmDeliverySchedule(
    order: OrderRecord,
    confirmation: {
      confirmedBy: string;
      confirmedByType: 'CARRIER' | 'SUPPLIER_ADMIN';
      date?: string;
      startTime?: string;
      endTime?: string;
      carrierReference?: string;
      notes?: string;
    }
  ): OrderRecord {
    const preference = order.deliveryPreference;
    const finalDate = confirmation.date || preference?.preferredDeliveryDate || new Date().toISOString().split('T')[0];
    const finalStart = confirmation.startTime || preference?.startTime || '09:00';
    const finalEnd = confirmation.endTime || preference?.endTime || '10:00';

    const window: DeliveryConfirmationWindow = {
      date: finalDate,
      startTime: finalStart,
      endTime: finalEnd,
      confirmedBy: confirmation.confirmedBy,
      confirmedByType: confirmation.confirmedByType,
      confirmedAt: new Date().toISOString(),
      carrierReference: confirmation.carrierReference || null,
      notes: confirmation.notes,
    };

    const newStatus: DeliverySchedulingStatus = 'CONFIRMED';
    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor: confirmation.confirmedBy,
      reason: confirmation.confirmedByType === 'CARRIER'
        ? `Carrier confirmed delivery appointment (${confirmation.carrierReference || 'Direct API'})`
        : `Fulfillment manager confirmed scheduled delivery window (${confirmation.confirmedBy})`,
      details: {
        confirmedWindow: window,
      },
    };

    order.deliverySchedulingStatus = newStatus;
    order.confirmedDeliveryWindow = window;
    order.lastSchedulingUpdate = new Date().toISOString();
    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];

    // Propagate to shipments
    const shipments = store.getShipmentsByOrderId(order.id);
    for (const ship of shipments) {
      ship.deliverySchedulingStatus = newStatus;
      ship.confirmedDeliveryWindow = window;
      store.saveShipment(ship);
    }

    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_SCHEDULE_CONFIRMED',
      entityId: order.id,
      actor: confirmation.confirmedBy,
      summary: `Delivery schedule confirmed for Order ${order.orderNumber}: ${window.date} (${window.startTime}–${window.endTime}) [${confirmation.confirmedByType === 'CARRIER' ? 'Carrier Confirmed' : 'Supplier/Admin Confirmed'}]`,
      details: {
        orderNumber: order.orderNumber,
        window,
        confirmedByType: confirmation.confirmedByType,
      },
    });

    return order;
  }

  /**
   * Marks a requested delivery schedule as UNAVAILABLE or RESCHEDULE_REQUIRED
   */
  public markScheduleUnavailable(
    order: OrderRecord,
    actor: string,
    reason: string,
    alternativeSlotId?: DeliveryTimeSlotId,
    alternativeDate?: string
  ): OrderRecord {
    const newStatus: DeliverySchedulingStatus = 'UNAVAILABLE';
    const altSlot = alternativeSlotId ? this.getSlotById(alternativeSlotId) : undefined;

    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor,
      reason,
      details: {
        suggestedAlternativeSlot: altSlot ? `${altSlot.label}: ${altSlot.timeRange}` : null,
        suggestedAlternativeDate: alternativeDate || null,
      },
    };

    order.deliverySchedulingStatus = newStatus;
    order.lastSchedulingUpdate = new Date().toISOString();
    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];

    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_SCHEDULE_UNAVAILABLE',
      entityId: order.id,
      actor,
      summary: `Delivery slot marked unavailable for Order ${order.orderNumber}: ${reason}${altSlot ? ` (Suggested: ${altSlot.label})` : ''}`,
      details: {
        orderNumber: order.orderNumber,
        reason,
        suggestedAlternativeSlot: altSlot?.id,
        suggestedAlternativeDate: alternativeDate,
      },
    });

    return order;
  }

  /**
   * Marks scheduling as NOT_SUPPORTED by the carrier
   */
  public markScheduleNotSupported(order: OrderRecord, actor: string, reason?: string): OrderRecord {
    const newStatus: DeliverySchedulingStatus = 'NOT_SUPPORTED';
    const defaultReason = reason || 'Assigned carrier or regional hub does not support scheduled delivery time windows.';

    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor,
      reason: defaultReason,
    };

    order.deliverySchedulingStatus = newStatus;
    order.carrierSchedulingSupported = false;
    order.lastSchedulingUpdate = new Date().toISOString();
    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];

    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_NOT_SUPPORTED',
      entityId: order.id,
      actor,
      summary: `Timed delivery scheduling not supported for Order ${order.orderNumber}. Order will ship with standard carrier tracking.`,
      details: {
        orderNumber: order.orderNumber,
        reason: defaultReason,
      },
    });

    return order;
  }

  /**
   * Customer-initiated rescheduling of an active order
   */
  public rescheduleOrder(
    order: OrderRecord,
    newPreference: DeliveryPreference,
    actorEmail: string
  ): { success: boolean; order?: OrderRecord; error?: string } {
    // Check eligibility: Cannot reschedule if already delivered or cancelled
    if (order.businessStatus === 'delivered') {
      return { success: false, error: 'Cannot reschedule: This order has already been marked delivered.' };
    }

    const shipments = store.getShipmentsByOrderId(order.id);
    const hasDeliveredShipment = shipments.some((s) => s.status === 'DELIVERED');
    if (hasDeliveredShipment) {
      return { success: false, error: 'Cannot reschedule: Shipment has already been delivered.' };
    }

    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: 'RESCHEDULE_REQUIRED',
      timestamp: new Date().toISOString(),
      actor: actorEmail,
      reason: `Customer requested rescheduling to ${newPreference.preferredDeliveryDate} (${newPreference.timeSlotLabel})`,
      details: {
        previousDate: order.deliveryPreference?.preferredDeliveryDate,
        previousSlot: order.deliveryPreference?.timeSlotLabel,
        newDate: newPreference.preferredDeliveryDate,
        newSlot: newPreference.timeSlotLabel,
      },
    };

    order.deliveryPreference = newPreference;
    order.deliverySchedulingStatus = 'REQUESTED'; // Awaits fulfillment re-confirmation
    order.confirmedDeliveryWindow = null; // Reset prior confirmation
    order.lastSchedulingUpdate = new Date().toISOString();
    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];

    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_RESCHEDULE_REQUESTED',
      entityId: order.id,
      actor: actorEmail,
      summary: `Rescheduling requested for Order ${order.orderNumber}: New window is ${newPreference.preferredDeliveryDate} (${newPreference.timeSlotLabel}) [Awaiting confirmation]`,
      details: {
        orderNumber: order.orderNumber,
        newPreference,
      },
    });

    return { success: true, order };
  }

  /**
   * Records verified delivery outcome (authorized staff or webhook only)
   */
  public recordDeliveryOutcome(
    order: OrderRecord,
    actorEmail: string,
    isStaffOrAdmin: boolean,
    deliveryTimestamp?: string
  ): { success: boolean; order?: OrderRecord; error?: string } {
    if (!isStaffOrAdmin) {
      return {
        success: false,
        error: 'Unauthorized: Only authorized fulfillment staff, administrators, or verified carrier webhooks may record delivery outcomes.',
      };
    }

    const actualTimestamp = deliveryTimestamp || new Date().toISOString();
    order.businessStatus = 'delivered';
    order.actualDeliveredAt = actualTimestamp;
    order.deliverySchedulingStatus = 'COMPLETED';
    order.lastSchedulingUpdate = new Date().toISOString();

    const historyEntry: SchedulingHistoryEntry = {
      id: `sched_hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: 'COMPLETED',
      timestamp: actualTimestamp,
      actor: actorEmail,
      reason: `Delivery outcome recorded as completed by ${actorEmail}`,
      details: {
        actualDeliveredAt: actualTimestamp,
      },
    };

    order.schedulingHistory = [...(order.schedulingHistory || []), historyEntry];
    store.saveOrder(order);

    store.recordAuditEvent({
      eventType: 'DELIVERY_OUTCOME_RECORDED',
      entityId: order.id,
      actor: actorEmail,
      summary: `Delivery outcome completed for Order ${order.orderNumber} on ${new Date(actualTimestamp).toLocaleString()}`,
      details: {
        orderNumber: order.orderNumber,
        deliveredAt: actualTimestamp,
      },
    });

    return { success: true, order };
  }
}

export const deliveryScheduling = new DeliverySchedulingService();
