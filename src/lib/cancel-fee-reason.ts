// Cam 2026-10-27 ("how is that no fee — looks within 24 hours to me"): a cancelled
// booking that kept no fee says WHY on Money → Cancellations. The policy is copied
// onto each booking (SP-B), so the course's current fee is not the booking's; this
// reads the same fields performCancellation() (lib/cancel-booking.ts) decides on.
import { bookingWindowHours } from './cancel-policy';
import { teeTimeInstant } from './booking-events';

import type { NoFeeReason } from './no-fee-labels';
export { NO_FEE_LABEL, type NoFeeReason } from './no-fee-labels';

export function noFeeReason(
  b: { cancelledAt: Date | null; cancellationFeeTotal: number; cancellationHoursAtBooking: number | null; stripePaymentMethodId: string; source: string; teeTime: { date: string; time: string } },
  course: { timezone: string | null; cancellationHours: number },
  chargeFailed: boolean,
): NoFeeReason {
  const teeAt = teeTimeInstant(course.timezone, b.teeTime.date, b.teeTime.time);
  const late = !!teeAt && !!b.cancelledAt && teeAt.getTime() - bookingWindowHours(b, course) * 3600_000 <= b.cancelledAt.getTime();
  if (!late) return 'in_time';
  if (b.cancellationFeeTotal <= 0) return b.source === 'online' ? 'no_fee' : 'counter';
  if (!b.stripePaymentMethodId) return 'no_card';
  if (chargeFailed) return 'charge_failed';
  return 'waived';
}
