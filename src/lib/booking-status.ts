/**
 * Single source of truth for what to show a user (operator, staff, or golfer)
 * given a booking's current status + paymentStatus pair. Every page that
 * renders a booking badge imports from here rather than maintaining its own map.
 *
 * paymentStatus state machine (for status === 'confirmed'):
 *   'card_on_file'               — confirmed, before cancellation cutoff, nothing charged
 *   'awaiting_checkin'           — cutoff passed, NO cancellation fee policy at this course;
 *                                  a reminder email with a Check-In link was sent instead of charging
 *   'cancellation_fee_charged'   — cutoff passed, flat fee charged as per course policy;
 *                                  fee is refunded automatically when golfer checks in and pays for round
 *
 * paymentStatus for completed / cancelled bookings:
 *   'paid'                       — checked in, full round charged, any held fee refunded
 *   (cancelled keeps the paymentStatus it had at cancellation time, for auditing)
 */

export type StatusTone = 'blue' | 'amber' | 'red' | 'gray' | 'emerald';

export interface BookingStatusInfo {
  label: string;
  sublabel?: string;  // short qualifier shown below the badge when space allows
  tone: StatusTone;
}

export function getBookingStatus(status: string, paymentStatus: string): BookingStatusInfo {
  if (status === 'completed') {
    return { label: 'Checked In & Paid', tone: 'emerald' };
  }

  if (status === 'cancelled') {
    if (paymentStatus === 'cancellation_fee_charged') {
      return { label: 'Cancelled — Fee Kept', sublabel: 'Late cancel, fee non-refundable', tone: 'red' };
    }
    return { label: 'Cancelled — No Charge', sublabel: 'Cancelled within free window', tone: 'gray' };
  }

  // status === 'confirmed'
  if (paymentStatus === 'cancellation_fee_charged') {
    return { label: 'Fee Charged', sublabel: 'Awaiting check-in — fee refunded when they pay', tone: 'amber' };
  }
  if (paymentStatus === 'awaiting_checkin') {
    return { label: 'Awaiting Check-In', sublabel: 'Cutoff passed, no fee policy', tone: 'amber' };
  }
  // default: card_on_file, before cutoff
  return { label: 'Card on File', sublabel: 'Not yet checked in', tone: 'blue' };
}

const TONE_CLASSES: Record<StatusTone, string> = {
  blue:    'bg-blue-50 text-blue-700',
  amber:   'bg-amber-50 text-amber-700',
  red:     'bg-red-50 text-red-700',
  gray:    'bg-gray-100 text-gray-500',
  emerald: 'bg-emerald-50 text-emerald-700',
};

export function statusBadgeClass(tone: StatusTone) {
  return TONE_CLASSES[tone];
}
