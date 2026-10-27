// Cam 2026-10-27 ("how is that no fee — looks within 24 hours to me"): a cancelled
// booking that kept no fee says WHY on Money → Cancellations. performCancellation()
// (lib/cancel-booking.ts) zeroes cancellationFeeTotal when the fee isn't kept, so this
// reads what the cancel RECORDED: its booking_cancelled event (feeAtBooking, waived,
// courseCalledOff, noShowFeeKept) and a failed late-fee charge (PaymentEvent
// charge_failed, detail "Late-cancellation fee: …"). No record → null ("No fee").
import { bookingWindowHours } from './cancel-policy';
import { teeTimeInstant } from './booking-events';
import type { NoFeeReason } from './no-fee-labels';
export { NO_FEE_LABEL, type NoFeeReason } from './no-fee-labels';

export type CancelRecord = { feeAtBooking?: number; waived?: boolean; courseCalledOff?: unknown; noShowFeeKept?: number };

export function noFeeReason(
  b: { cancelledAt: Date | null; cancellationHoursAtBooking: number | null; source: string; teeTime: { date: string; time: string } },
  course: { timezone: string | null; cancellationHours: number },
  rec: CancelRecord | null,
  failedDetail: string | null,
): NoFeeReason | null {
  if (rec?.courseCalledOff) return 'called_off';
  if (rec?.waived) return 'waived';
  if (failedDetail) return /no card on file/i.test(failedDetail) ? 'no_card' : 'charge_failed';
  const teeAt = teeTimeInstant(course.timezone, b.teeTime.date, b.teeTime.time);
  if (!teeAt || !b.cancelledAt) return null;
  if (teeAt.getTime() - bookingWindowHours(b, course) * 3600_000 > b.cancelledAt.getTime()) return 'in_time';
  if (rec?.feeAtBooking === 0) return b.source === 'online' ? 'no_fee' : 'counter';
  return null;
}
