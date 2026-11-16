import type { Term } from './season-pass';

// When a paid membership's next term can be paid (LEDGER-1 review, Cam 2026-10-30).
// ONE rule for the pay page and the renewal reminder, so the reminder goes out the day
// its link can be paid — never earlier (a monthly member was being emailed a link the
// page then refused, and never reminded again).

/** 30 days, or a third of the term when that is shorter (a monthly tier: 10 days). */
export function renewalWindowDays(termMonths: number): number {
  return Math.min(30, Math.max(1, Math.floor((termMonths * 30) / 3)));
}

/**
 * True while the member has nothing to pay: paid in the last day, or more of the term left than the window.
 * Memberships item 4: a season pass is paid once and never renews — paid is paid (next season is a new pass, which
 * staff move the member onto and which starts unpaid).
 */
export function paidUntilRenewal(p: { paymentStatus: string; expiresAt: Date | null; lastPaidAt: Date | null }, term: Term, now = Date.now()): boolean {
  if (p.paymentStatus !== 'paid' && p.paymentStatus !== 'paid_offline') return false;
  if (term.kind === 'pass') return true;
  const termMonths = term.months;
  // Paid in the last day: never again so soon, whatever the term (a double tap, an old email).
  if (p.lastPaidAt && now - p.lastPaidAt.getTime() < 86_400_000) return true;
  return !!p.expiresAt && (p.expiresAt.getTime() - now) / 86_400_000 > renewalWindowDays(termMonths);
}
