/**
 * Single source of truth for what to show a user (operator, staff, or golfer)
 * given a booking's current status + paymentStatus pair. Every page that
 * renders a booking badge imports from here rather than maintaining its own map.
 *
 * paymentStatus state machine (for status === 'confirmed'):
 *   'no_payment_method'          — no-fee-policy course; no card was collected at booking; golfer pays at course or via online check-in
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
    // SD-5: paid at the counter — checked in, nothing collected online.
    if (paymentStatus === 'paid_offline') return { label: 'Checked In · Paid at counter', tone: 'emerald' };
    return { label: 'Checked In & Paid', tone: 'emerald' };
  }

  if (status === 'cancelled') {
    if (paymentStatus === 'cancellation_fee_charged') {
      return { label: 'Cancelled — Fee Kept', sublabel: 'Late cancel, fee non-refundable', tone: 'red' };
    }
    return { label: 'Cancelled — No Charge', sublabel: 'Cancelled within free window', tone: 'gray' };
  }

  // status === 'confirmed'
  // SD-5: entered at the counter (walk-in / phone) — pays there.
  if (paymentStatus === 'manual') {
    return { label: 'Pay at counter', sublabel: 'Walk-in or phone booking — no card on file', tone: 'blue' };
  }
  if (paymentStatus === 'no_payment_method') {
    return { label: 'No Card Required', sublabel: 'Pay at the course or via check-in link', tone: 'blue' };
  }
  if (paymentStatus === 'cancellation_fee_charged') {
    return { label: 'Fee Charged', sublabel: 'Awaiting check-in — fee refunded when they pay', tone: 'amber' };
  }
  if (paymentStatus === 'awaiting_checkin') {
    return { label: 'Awaiting Check-In', sublabel: 'Cutoff passed, no fee policy', tone: 'amber' };
  }
  // default: card_on_file, before cutoff
  return { label: 'Card on File', sublabel: 'Not yet checked in', tone: 'blue' };
}

// SD-8e (Cam 2026-09-29): booking status renders as <StatusDot>, never as
// coloured text. The palette has four semantic tones and bookings have five,
// so 'blue' (card on file / nothing due yet) and 'emerald' (paid) share `ok`
// and differ by FILL: a hollow ring is "fine, nothing collected yet", a filled
// dot is "money in". No fifth colour token.
// statusBadgeClass (bg-*-50 tinted pills — the BANNED list) is deleted, not
// deprecated: it had no importers and was a pill waiting to be shipped.
const TONE_DOT: Record<StatusTone, { status: 'ok' | 'warn' | 'bad' | 'neutral'; hollow: boolean }> = {
  blue:    { status: 'ok',      hollow: true },
  amber:   { status: 'warn',    hollow: false },
  red:     { status: 'bad',     hollow: false },
  gray:    { status: 'neutral', hollow: false },
  emerald: { status: 'ok',      hollow: false },
};

export function statusDot(tone: StatusTone) {
  return TONE_DOT[tone];
}
