// R-CRON-003 — when the hourly cron sends its time-based emails.
//
// The cron runs once an hour, so each window must be at least 60 minutes wide or
// a booking whose tee/cutoff minute falls between two runs is never inside it.
// The old ±15-minute windows were 30 wide and missed about half of all bookings.

/**
 * The "free cancellation ends in about an hour" warning: cutoff is 15–75 minutes
 * away. Exactly 60 wide and half-open, so with hourly runs each booking hits it
 * exactly once.
 */
export function cutoffWarningDue(minsToCutoff: number): boolean {
  return minsToCutoff > 15 && minsToCutoff <= 75;
}

/**
 * The check-in / pay-link email: due from `windowMins` before the tee time until
 * the tee time itself. Not a time window — "due and not yet sent": the caller
 * flips paymentStatus to 'awaiting_checkin' when it sends, which takes the
 * booking out of the next run's query, so a missed run or a booking made inside
 * the window still gets the link.
 */
export function checkInEmailDue(minsToTee: number, windowMins: number): boolean {
  return minsToTee > 0 && minsToTee <= windowMins;
}

/**
 * AUDIT-1 (database audit 2026-11-05): the crons used to load every confirmed booking ever made
 * (no-shows and never-checked-in groups stay confirmed for good), so each run grew with the
 * platform's whole history. They now read only tee dates that can still be due:
 *  - fee bookings: a cancellation window is at most 14 days (settings-validation), the warning
 *    is an hour before it, and a hold is never charged a day after the tee time (HOLD_STALE_MS);
 *  - check-in links: at most 48 hours before the round (checkInWindowHours).
 * Course-local date strings; a day of slack each side covers every time zone.
 */
export const FEE_DATES = { back: 2, ahead: 16 } as const;
export const CHECKIN_DATES = { back: 1, ahead: 3 } as const;
export function teeDateWindow(now: Date, w: { back: number; ahead: number }): { gte: string; lte: string } {
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { gte: day(-w.back), lte: day(w.ahead) };
}
