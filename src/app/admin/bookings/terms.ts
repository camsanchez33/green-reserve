// Bookings (ADMIN-REDO page 4): the words behind labels and the history wording, kept off the page
// (DENSE: definitions live behind the label).

export const FILTER_LABEL = { all: 'All', problems: 'Problems', today: 'Today', upcoming: 'Upcoming', noshows: 'No-shows', cancelled: 'Cancelled' } as const;
export const FILTER_TITLE: Partial<Record<keyof typeof FILTER_LABEL, string>> = {
  problems: 'A declined card the group never paid, or a dispute the bank opened that is not closed',
  today: "Tee times today (Eastern)",
};
export const FEE_TITLE = "GreenReserve's service fee on this booking, from the money ledger";
export const PAID_TITLE = 'What moved for this booking, from the money ledger (LEDGER-1)';

export const EVENT_WORDS: Record<string, string> = {
  booking_created: 'Booked', booking_cancelled: 'Cancelled', checked_in: 'Checked in', no_show_marked: 'Marked a no-show',
  no_show_cleared: 'No-show taken back (still coming)', fee_charged: 'Fee charged', fee_refunded: 'Fee refunded',
  booking_moved: 'Moved to another tee time', price_changed: 'Price changed at the counter', round_refunded: 'The course refunded part of the round',
};
export const BY_WORDS: Record<string, string> = { golfer: 'by the golfer', staff: 'by the course', admin: 'by GreenReserve', cron: 'automatically', system: 'automatically' };
export const WHAT_WORDS: Record<string, string> = {
  round: 'Round', hold: 'Cancellation hold', late_fee: 'Late cancellation fee', no_show_fee: 'No-show fee', booking_fee: 'Booking fee',
  shop: 'Shop items', dues: 'Dues', event: 'Event',
};
export const DISPUTE_OUT = 'Taken back by the bank (dispute)';
export const DISPUTE_BACK = 'Returned to the course (dispute won)';
export const FEE_LINES: [string, string][] = [['hold', 'Cancellation hold (the course\'s)'], ['late_fee', 'Late cancellation fee (the course\'s)'], ['no_show_fee', 'No-show fee (the course\'s)']];
export const METHOD_WORDS: Record<string, string> = { card: 'card', card_present: 'card reader', cash: 'cash', other: 'other' };
export const PROBLEM_WORDS: Record<string, string> = { charge_failed: 'Card declined', dispute_opened: 'The golfer disputed the charge with their bank', dispute_closed: 'The dispute was closed' };
export const SOURCE_WORDS: Record<string, string> = { online: 'Online', walk_in: 'Walk-in at the counter', phone: 'By phone, entered by the course', counter: 'At the counter' };

type PayInput = {
  pay: { key: string }; paid: { inCents: number; outCents: number; beforeDisputeCents: number; disputeOutCents: number }; owed: { roundCents: number | null };
  declineReason: string | null; moves: { method: string }[];
};
const usd = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2);

/** The sentence under "Paid / Not paid": the amount, then where it stands. */
export function payLine(p: PayInput): string {
  const net = p.paid.inCents - p.paid.outCents;
  const owed = p.owed.roundCents ?? 0;
  // Refunds only: the bank's dispute movements are worded on their own (a won dispute gives the money back).
  const refunds = p.paid.outCents - p.paid.disputeOutCents;
  const back = refunds > 0 ? ` · ${usd(refunds)} given back` : '';
  switch (p.pay.key) {
    case 'disputed': return `${usd(p.paid.beforeDisputeCents)} paid; the golfer disputed it with their bank`;
    case 'returned': return `${usd(p.paid.inCents)} charged; ${usd(p.paid.outCents)} ${p.paid.disputeOutCents > 0 ? 'taken back by the bank after a dispute' : 'given back'}`;
    case 'unrecorded': return 'Revenue counts it as paid by card, but no payment row was written for it';
    case 'on_account': return "Checked in; the course bills it on the member's statement";
    case 'hold': return `${usd(net)} hold taken; it is given back at check-in`;
    case 'declined': return `${usd(owed)} owed${p.declineReason ? ` · ${p.declineReason}` : ''}`;
    case 'cancelled_kept': return `${usd(net)} kept under the course's policy${back}`;
    case 'cancelled': return p.paid.inCents > 0 ? `${usd(p.paid.inCents)} charged and given back` : 'Nothing charged';
    case 'no_show_paid': return `${usd(net)} charged to the card on file${back}`;
    case 'no_show': return 'Nothing charged';
    case 'paid_counter': return net > 0 ? `${usd(net)} ${p.moves.some(m => m.method === 'cash') ? 'in cash' : 'by card'} at the course${back}` : 'Paid at the course; no payment on record';
    case 'paid': return `${usd(net)} paid${back}`;
    case 'nothing_due': return 'Nothing was charged through GreenReserve';
    case 'card_on_file': return `${usd(owed)} will be charged to the card on file at check-in`;
    default: return `${usd(owed)} due when they check in (no card saved)`;
  }
}

