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
