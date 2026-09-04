// MP-8a. The two "money that should exist and does not" predicates, shared by
// /api/admin/revenue (the Problems block and its badge count) and
// /api/admin/nav-badges (the sidebar). One definition, so the badge on the
// rail and the list it opens can never count different rows.

/** Failed charge: the card was tried at check-in and declined; nobody has collected since. */
export const FAILED_CHARGE_WHERE = { checkInFailReason: { not: '' }, checkedInAt: null } as const;

/**
 * Missed check-in: the tee time has passed, the booking still stands, and no
 * one ever charged it. Not a failed card — nothing was tried. Every one of
 * these is a fee that the old accrual headline counted as earned.
 */
export function missedCheckInWhere(todayStr: string) {
  return {
    status: 'confirmed', checkedInAt: null, checkInFailReason: '',
    paymentStatus: { not: 'paid' },
    teeTime: { date: { lt: todayStr } },
  } as const;
}
