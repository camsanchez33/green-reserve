// EARNED-1 (Cam 2026-11-04, "earned vs paid out"): the labels on Money → Ledger's Earned and Paid out
// cards, each with its definition behind the label (DENSE: label · value, the definition on hover).
// Client-safe. Figures come from lib/ledger-view (earnedOf, the Stripe payouts read).

export type EarnedKey = 'collectedCents' | 'givenBackCents' | 'greenReserveCents' | 'stripeFeeCents' | 'keptCents';
export type PaidOutKey = 'payoutsCents' | 'cashCents' | 'inStripeCents';
export type Term<K> = { key: K; label: string; def: string; minus?: boolean; total?: boolean };

export const EARNED_TERMS: Term<EarnedKey>[] = [
  { key: 'collectedCents', label: 'Taken in', def: 'Card, cash and other money that came in on these days — the day the money moved, not the day of the round' },
  { key: 'givenBackCents', label: 'Given back', def: 'Refunds and holds returned', minus: true },
  { key: 'greenReserveCents', label: 'GreenReserve fees', def: 'Booking fees taken, less any given back', minus: true },
  { key: 'stripeFeeCents', label: 'Stripe fees', def: 'Stripe’s card processing fees, as Stripe recorded them', minus: true },
  { key: 'keptCents', label: 'You keep', def: 'Collected, less what was given back and both fees', total: true },
];

export const PAID_OUT_TERMS: Term<PaidOutKey>[] = [
  { key: 'payoutsCents', label: 'To your bank', def: 'Stripe payouts that arrived in these days' },
  { key: 'cashCents', label: 'Cash at the course', def: 'Cash taken less cash given back' },
  { key: 'inStripeCents', label: 'In Stripe now', def: 'Your Stripe balance, available and on its way' },
];

// ACC-1 (Cam 2026-11-08, picked "round's day + rename Ledger"): the Ledger counts money on the day it MOVED (it has to
// match Stripe's payouts), while "Paid" on the tee sheet, Home, Money and Analytics counts a round on the round's day.
// So the Ledger's card says "Money in" — never "Paid" or "Earned" — and nobody expects the two to match day by day.
export const EARNED_TITLE = 'Money in';
export const PAID_OUT_TITLE = 'Paid out';

/** The day rows' filters and one payment's detail (EARNED-1). */
export const LEDGER_UI = {
  feeColumn: 'Stripe fees', feeColumnDef: 'Stripe’s card processing fees',
  what: 'What', everything: 'Everything', how: 'How paid', anyWay: 'Any way', none: 'None.',
  payout: 'payout', payouts: 'payouts',
  account: 'Account', course: 'Your course', grPart: 'GreenReserve part', by: 'By', stripe: 'Stripe',
} as const;
