// ADMIN-REDO page 4 — Bookings (Cam 2026-11-12). Pure, so scripts/admin-bookings-test.ts can pin it.
// A READ-ONLY book-keeping record: what was owed, what was paid, whether GreenReserve's service fee was collected,
// and what happened. GreenReserve never charges, retries or refunds a golfer from the admin (Cam 2026-11-12) —
// nothing here does anything but read.
//
// Money comes from the ledger (LEDGER-1: every dollar that moved for the booking is one MoneyMove row), so "paid"
// and "our fee collected" are what actually moved, never what should have.

/** The ledger rows of one booking, summed. A dispute's money (the webhook mirrors it with a stripeId ending
 *  ":withdrawn" / ":reinstated") is kept apart from refunds, so a disputed charge still reads as what was paid. */
export type LedgerSum = { inCents: number; outCents: number; feeInCents: number; feeOutCents: number; disputeOutCents: number; disputeInCents: number; holdCents: number };
export const EMPTY_LEDGER: LedgerSum = { inCents: 0, outCents: 0, feeInCents: 0, feeOutCents: 0, disputeOutCents: 0, disputeInCents: 0, holdCents: 0 };
export type LedgerRow = { direction: string; amountCents: number; platformFeeCents: number; stripeId?: string | null; what?: string };
export const isDisputeRow = (m: { stripeId?: string | null }) => !!m.stripeId && /:(withdrawn|reinstated)$/.test(m.stripeId);
export function sumLedger(moves: LedgerRow[]): LedgerSum {
  const s = { ...EMPTY_LEDGER };
  for (const m of moves) {
    const dispute = isDisputeRow(m);
    const sign = m.direction === 'out' ? -1 : 1;
    if (m.what === 'hold' && !dispute) s.holdCents += sign * m.amountCents;
    if (m.direction === 'out') { s.outCents += m.amountCents; s.feeOutCents += m.platformFeeCents; if (dispute) s.disputeOutCents += m.amountCents; }
    else { s.inCents += m.amountCents; s.feeInCents += m.platformFeeCents; if (dispute) s.disputeInCents += m.amountCents; }
  }
  return s;
}
/** What the golfer paid, less what was given back — everything that moved. */
export const netCents = (l: LedgerSum) => l.inCents - l.outCents;
/** Charges less refunds, leaving out the bank's dispute movements: what the golfer paid before any dispute. */
export const paidBeforeDispute = (l: LedgerSum) => (l.inCents - l.disputeInCents) - (l.outCents - l.disputeOutCents);

export type BookingFacts = {
  status: string;               // confirmed | completed | cancelled
  paymentStatus: string;
  paidOffline: boolean;
  /** The round was paid by card (paymentStatus 'paid' with a round PaymentIntent) — Revenue's paidWindow rule. */
  paidByCard: boolean;
  accessFeeTotal: number;       // our service fee on the booking, cents
  hasCard: boolean;             // a card was saved at booking
  failed: boolean;              // the check-in charge was declined and the group never checked in (FAILED_CHARGE_WHERE)
  disputed: boolean;            // a dispute the bank opened that Stripe has not closed
  noShow: boolean;
  checkedIn: boolean;
  ledger: LedgerSum;
};

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
export type PayKey = 'disputed' | 'declined' | 'cancelled_kept' | 'cancelled' | 'no_show_paid' | 'no_show' | 'paid_counter' | 'on_account'
  | 'paid' | 'returned' | 'unrecorded' | 'nothing_due' | 'hold' | 'card_on_file' | 'pays_later';
export type PayState = { key: PayKey; short: string; headline: string; tone: Tone };

/** Whether it's paid, first and in one or two words (the list) and a headline (the card). */
export function payState(b: BookingFacts): PayState {
  const l = b.ledger, net = netCents(l);
  if (b.disputed) return { key: 'disputed', short: 'Disputed', headline: 'Paid, now disputed', tone: 'bad' };
  if (b.failed) return { key: 'declined', short: 'Declined', headline: 'Not paid — the card was declined', tone: 'bad' };
  if (b.status === 'cancelled') return net > 0
    ? { key: 'cancelled_kept', short: 'Fee kept', headline: 'Cancelled — a fee was kept', tone: 'warn' }
    : { key: 'cancelled', short: 'Cancelled', headline: 'Cancelled — nothing kept', tone: 'neutral' };
  if (b.noShow && !b.checkedIn) return net > 0
    ? { key: 'no_show_paid', short: 'No-show fee', headline: "Didn't play — no-show fee paid", tone: 'warn' }
    : { key: 'no_show', short: 'No-show', headline: "Didn't play — nothing charged yet", tone: 'warn' };
  if (b.status === 'completed') {
    if (b.paidOffline || b.paymentStatus === 'paid_offline') return { key: 'paid_counter', short: 'Paid in store', headline: 'Paid at the course', tone: 'ok' };
    if (b.paymentStatus === 'on_account') return { key: 'on_account', short: 'On account', headline: "Put on the member's account", tone: 'neutral' };
    if (net > 0) return { key: 'paid', short: 'Paid', headline: 'Paid', tone: 'ok' };
    if (l.inCents > 0) return { key: 'returned', short: 'Given back', headline: l.disputeOutCents > 0 ? 'Paid, then taken back by the bank' : 'Paid, then given back', tone: 'warn' };
    // Paid by card with no ledger row (before LEDGER-1, Oct 30 2026, or a ledger write that failed): say so.
    if (b.paidByCard) return { key: 'unrecorded', short: 'Paid', headline: 'Paid by card — not in the money ledger', tone: 'ok' };
    return { key: 'nothing_due', short: 'Checked in', headline: 'Checked in — nothing paid through GreenReserve', tone: 'neutral' };
  }
  // Still to play. Paid already (admin Collect payment / collectPayment leaves it confirmed until check-in):
  if (b.paidByCard) return l.inCents > 0
    ? { key: 'paid', short: 'Paid', headline: 'Paid — not checked in yet', tone: 'ok' }
    : { key: 'unrecorded', short: 'Paid', headline: 'Paid by card — not in the money ledger', tone: 'ok' };
  // A cancellation hold taken at the cutoff (ledger rows what 'hold'), given back at check-in.
  if (l.holdCents > 0) return { key: 'hold', short: 'Hold taken', headline: 'Not paid yet — a hold was taken', tone: 'neutral' };
  return b.hasCard
    ? { key: 'card_on_file', short: 'Card on file', headline: 'Not paid yet — card on file', tone: 'neutral' }
    : { key: 'pays_later', short: 'Pays later', headline: 'Not paid yet — pays at check-in', tone: 'neutral' };
}

/** The amount a row shows: what moved once anything moved (a dispute: what was paid before it), else what's owed. */
export function rowAmount(b: BookingFacts, owedCents: number | null): number | null {
  if (b.disputed) return paidBeforeDispute(b.ledger);
  if (b.ledger.inCents > 0) return netCents(b.ledger);
  // Nothing moved and it never played (cancelled, or a no-show not charged): no price, as on the card.
  return b.status === 'cancelled' || (b.noShow && !b.checkedIn) ? null : owedCents;
}

/** Our service fee: collected · not collected · collected when they pay · none. */
export type FeeKey = 'collected' | 'not_collected' | 'when_paid' | 'none';
export const FEE_LABEL: Record<FeeKey, string> = { collected: 'collected', not_collected: 'not collected', when_paid: 'collected when they pay', none: 'none' };
export function feeState(b: BookingFacts): { key: FeeKey; cents: number } {
  const kept = b.ledger.feeInCents - b.ledger.feeOutCents;
  if (kept > 0) return { key: 'collected', cents: kept };
  if (b.accessFeeTotal <= 0) return { key: 'none', cents: 0 };
  // No ledger row but paid by card: Revenue counts the fee as collected (paidWindow) — so does this record.
  if (b.paidByCard && b.ledger.inCents === 0 && b.status === 'completed') return { key: 'collected', cents: b.accessFeeTotal };
  // Cancelled: our fee was due if anything was kept (a late fee on the course's account; ours is a separate platform
  // charge that can be declined on its own), or was taken and given back.
  if (b.status === 'cancelled') return netCents(b.ledger) > 0 || b.ledger.feeInCents > 0 ? { key: 'not_collected', cents: b.accessFeeTotal } : { key: 'none', cents: 0 };
  if (b.paymentStatus === 'on_account') return { key: 'when_paid', cents: b.accessFeeTotal };
  if (b.status === 'confirmed' && !b.failed && !b.noShow) return { key: 'when_paid', cents: b.accessFeeTotal };
  // Paid at the counter (PAY-2: we eat it), declined, a no-show with nothing charged, given back, checked in unpaid.
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
