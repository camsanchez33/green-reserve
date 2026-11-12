// ADMIN-REDO page 4 — Bookings (Cam 2026-11-12). Pure, so scripts/admin-bookings-test.ts can pin it.
// A READ-ONLY book-keeping record: what was owed, what was paid, whether GreenReserve's service fee was collected,
// and what happened. GreenReserve never charges, retries or refunds a golfer from the admin (Cam 2026-11-12) —
// nothing here does anything but read.
//
// Money comes from the ledger (LEDGER-1: every dollar that moved for the booking is one MoneyMove row), so "paid"
// and "our fee collected" are what actually moved, never what should have.

/** The ledger rows of one booking, summed. */
export type LedgerSum = { inCents: number; outCents: number; feeInCents: number; feeOutCents: number };
export const EMPTY_LEDGER: LedgerSum = { inCents: 0, outCents: 0, feeInCents: 0, feeOutCents: 0 };
export function sumLedger(moves: { direction: string; amountCents: number; platformFeeCents: number }[]): LedgerSum {
  const s = { ...EMPTY_LEDGER };
  for (const m of moves) {
    if (m.direction === 'out') { s.outCents += m.amountCents; s.feeOutCents += m.platformFeeCents; }
    else { s.inCents += m.amountCents; s.feeInCents += m.platformFeeCents; }
  }
  return s;
}

export type BookingFacts = {
  status: string;               // confirmed | completed | cancelled
  paymentStatus: string;
  paidOffline: boolean;
  accessFeeTotal: number;       // our service fee on the booking, cents
  hasCard: boolean;             // a card was saved at booking
  failed: boolean;              // the check-in charge was declined and the group never checked in (FAILED_CHARGE_WHERE)
  disputed: boolean;            // a dispute the bank opened that Stripe has not closed
  noShow: boolean;
  checkedIn: boolean;
  ledger: LedgerSum;
};

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
export type PayState = { key: PayKey; short: string; headline: string; tone: Tone };
export type PayKey = 'disputed' | 'declined' | 'cancelled_kept' | 'cancelled' | 'no_show_paid' | 'no_show' | 'paid_counter' | 'paid' | 'nothing_due' | 'card_on_file' | 'pays_later';

const paidNet = (l: LedgerSum) => l.inCents - l.outCents;

/** Whether it's paid, first and in one or two words (the list) and a headline (the card). */
export function payState(b: BookingFacts): PayState {
  const net = paidNet(b.ledger);
  if (b.disputed) return { key: 'disputed', short: 'Disputed', headline: 'Paid, now disputed', tone: 'bad' };
  if (b.failed) return { key: 'declined', short: 'Declined', headline: 'Not paid — the card was declined', tone: 'bad' };
  if (b.status === 'cancelled') return net > 0
    ? { key: 'cancelled_kept', short: 'Fee kept', headline: 'Cancelled — a fee was kept', tone: 'warn' }
    : { key: 'cancelled', short: 'Cancelled', headline: 'Cancelled — nothing charged', tone: 'neutral' };
  if (b.noShow && !b.checkedIn) return net > 0
    ? { key: 'no_show_paid', short: 'No-show fee', headline: "Didn't play — no-show fee paid", tone: 'warn' }
    : { key: 'no_show', short: 'No-show', headline: "Didn't play — nothing charged yet", tone: 'warn' };
  if (b.status === 'completed') {
    if (b.paidOffline || b.paymentStatus === 'paid_offline') return { key: 'paid_counter', short: 'Paid in store', headline: 'Paid at the course', tone: 'ok' };
    if (net > 0) return { key: 'paid', short: 'Paid', headline: 'Paid', tone: 'ok' };
    return { key: 'nothing_due', short: 'Checked in', headline: 'Checked in — nothing paid through GreenReserve', tone: 'neutral' };
  }
  return b.hasCard
    ? { key: 'card_on_file', short: 'Card on file', headline: 'Not paid yet — card on file', tone: 'neutral' }
    : { key: 'pays_later', short: 'Pays later', headline: 'Not paid yet — pays at check-in', tone: 'neutral' };
}

/** Our service fee: collected · not collected · collected when they pay · none. */
export type FeeKey = 'collected' | 'not_collected' | 'when_paid' | 'none';
export const FEE_LABEL: Record<FeeKey, string> = { collected: 'collected', not_collected: 'not collected', when_paid: 'collected when they pay', none: 'none' };
export function feeState(b: BookingFacts): { key: FeeKey; cents: number } {
  const kept = b.ledger.feeInCents - b.ledger.feeOutCents;
  if (kept > 0) return { key: 'collected', cents: kept };
  // A fee taken and given back in full (a refund) leaves nothing collected.
  if (b.accessFeeTotal <= 0) return { key: 'none', cents: 0 };
  if (b.status === 'cancelled') return { key: b.ledger.feeInCents > 0 || b.ledger.inCents > 0 ? 'not_collected' : 'none', cents: 0 };
  if (b.status === 'confirmed' && !b.failed && !b.noShow) return { key: 'when_paid', cents: b.accessFeeTotal };
  // Paid at the counter (PAY-2: we eat it), declined, a no-show with nothing charged, checked in with nothing paid.
  return { key: 'not_collected', cents: b.accessFeeTotal };
}

// ── Filters ────────────────────────────────────────────────────────────────────
export const FILTERS = ['all', 'problems', 'today', 'upcoming', 'noshows', 'cancelled'] as const;
export type BookingFilter = (typeof FILTERS)[number];
export const isFilter = (v: string | null): v is BookingFilter => !!v && (FILTERS as readonly string[]).includes(v);

/** The booking number golfers see in their emails and on Manage: "Booking #" + the id's first 8 characters. */
export const bookingNumber = (id: string) => id.slice(0, 8).toUpperCase();
/** What a search for a booking number matches: the id's start, any case, with or without '#'. */
export function numberQuery(q: string): string | null {
  const t = q.trim().replace(/^#/, '').toLowerCase();
  return /^[a-z0-9]{6,}$/.test(t) ? t : null;
}

/** The policy copied onto the booking, in a line for staff (not golfer wording — that is describePolicy()). */
export function policyLine(p: { cancellationHours: number | null; lateFeeCents: number; noShowFeeCents: number; source: string }): string {
  if (p.source !== 'online') return 'Booked by the course — no online policy';
  const parts: string[] = [];
  if (p.lateFeeCents > 0) parts.push(`Free cancellation until ${p.cancellationHours ?? 24} hours before · ${usd(p.lateFeeCents)} late fee`);
  else parts.push('Cancel any time at no charge');
  if (p.noShowFeeCents > 0) parts.push(`${usd(p.noShowFeeCents)} no-show fee`);
  return parts.join(' · ');
}
export const usd = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2);
