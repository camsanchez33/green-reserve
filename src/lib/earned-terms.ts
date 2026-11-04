// EARNED-1 (Cam 2026-11-04, "earned vs paid out"): the labels on Money → Ledger's Earned and Paid out
// cards, each with its definition behind the label (DENSE: label · value, the definition on hover).
// Client-safe. Figures come from lib/ledger-view (earnedOf, the Stripe payouts read).

export type EarnedKey = 'collectedCents' | 'givenBackCents' | 'greenReserveCents' | 'stripeFeeCents' | 'keptCents';
export type PaidOutKey = 'payoutsCents' | 'cashCents' | 'inStripeCents';
export type Term<K> = { key: K; label: string; def: string; minus?: boolean; total?: boolean };

export const EARNED_TERMS: Term<EarnedKey>[] = [
  { key: 'collectedCents', label: 'Collected', def: 'Card, cash and other money taken in these days' },
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

export const EARNED_TITLE = 'Earned';
export const PAID_OUT_TITLE = 'Paid out';

/** The day rows' filters and one payment's detail (EARNED-1). */
export const LEDGER_UI = {
  feeColumn: 'Stripe fees', feeColumnDef: 'Stripe’s card processing fees',
  what: 'What', everything: 'Everything', how: 'How paid', anyWay: 'Any way', none: 'None.',
  account: 'Account', course: 'Your course', grPart: 'GreenReserve part', by: 'By', stripe: 'Stripe',
} as const;
