// ADMIN-C Money: the pure rules behind the new tabs — fees by day for the
// Overview chart, and what an expense comes to per month on Expenses.
// Run: npx tsx scripts/money-tabs-test.ts
import { feesByDay } from '../src/lib/fees-by-day';
import { monthlyEquivalentCents } from '../src/lib/expenses';
import { visibleMoneyTab, isMoneyTab } from '../src/lib/money-tabs';
import { evidenceText, type EvidenceInput } from '../src/lib/dispute-evidence';
import { lastFullMonths, matchResult } from '../src/lib/stripe-match';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

const d = (s: string) => new Date(s);
const current = { start: d('2026-10-01T00:00:00Z'), end: d('2026-10-04T12:00:00Z') };  // 3.5 days → 4 slots
const prior = { start: d('2026-09-01T00:00:00Z'), end: d('2026-09-04T12:00:00Z') };
const r = feesByDay([
  { paidAt: d('2026-10-01T09:00:00Z'), cents: 300 },
  { paidAt: d('2026-10-01T23:59:59Z'), cents: 150 },
  { paidAt: d('2026-10-03T10:00:00Z'), cents: 600 },
  { paidAt: d('2026-10-04T13:00:00Z'), cents: 999 },   // after the window ends: not counted
  { paidAt: d('2026-09-02T08:00:00Z'), cents: 450 },
  { paidAt: d('2026-09-04T13:00:00Z'), cents: 777 },   // after the prior window's same point: not counted
  { paidAt: null, cents: 5 },
], current, prior);
check('each day of the period gets its own slot', JSON.stringify(r.current) === JSON.stringify([450, 0, 600, 0]), r.current);
check('the period before overlays day for day', JSON.stringify(r.prior) === JSON.stringify([0, 450, 0, 0]), r.prior);
check('nothing outside either window is counted', r.current.reduce((a, b) => a + b, 0) + r.prior.reduce((a, b) => a + b, 0) === 1500);
const longPrior = feesByDay([], { start: d('2026-10-01T00:00:00Z'), end: d('2026-10-03T00:00:00Z') }, { start: d('2026-09-01T00:00:00Z'), end: d('2026-09-30T00:00:00Z') });
check('the prior line is never longer than the current one', longPrior.prior.length === longPrior.current.length && longPrior.current.length === 2, longPrior);

check('monthly costs count in full each month', monthlyEquivalentCents({ amountCents: 2000, cadence: 'monthly' }) === 2000);
check('a yearly cost counts a twelfth a month', monthlyEquivalentCents({ amountCents: 120000, cadence: 'annual' }) === 10000);
check('a one-time cost has no monthly rate', monthlyEquivalentCents({ amountCents: 50000, cadence: 'one-time' }) === 0);

check('a link to Expenses from someone who is not the owner opens Overview', visibleMoneyTab('expenses', false) === 'overview');
check('…and Payouts too', visibleMoneyTab('payouts', false) === 'overview');
check('the owner gets the tab the link names', visibleMoneyTab('expenses', true) === 'expenses');
check('everyone gets Not collected and Disputes', visibleMoneyTab('uncollected', false) === 'uncollected' && visibleMoneyTab('disputes', false) === 'disputes');
check('an unknown ?tab= is ignored', !isMoneyTab('ledger') && isMoneyTab('disputes'));

// PR2b: months against Stripe.
const m = lastFullMonths(d('2026-10-22T15:00:00Z'), 3);
check('the last three full months, newest first', m.map(x => x.label).join('|') === 'September 2026|August 2026|July 2026', m.map(x => x.label));
check('a month runs from its 1st to the next 1st', m[0].start.toISOString() === '2026-09-01T00:00:00.000Z' && m[0].end.toISOString() === '2026-10-01T00:00:00.000Z');
check('January looks back into last year', lastFullMonths(d('2027-01-05T00:00:00Z'), 1)[0].label === 'December 2026');
check('within a dollar is a match', matchResult(10000, 9950) === 'match' && matchResult(10000, 9800) === 'off');
check('Stripe not answering is never a match', matchResult(10000, null) === 'unknown');

// PR2b: the evidence pack says only what was recorded.
const base: EvidenceInput = {
  bookingId: 'b1', courseName: 'Pine Hills GC', timezone: 'America/New_York',
  golferName: 'Chris Avery', golferEmail: 'chris@example.com', golferPhone: '',
  players: 2, teeDate: '2026-10-12', teeTime: '08:40', createdAt: d('2026-10-09T23:14:00Z'), source: 'online',
  termsAcceptedAt: d('2026-10-09T23:14:00Z'), termsVersion: '2026-10', cardSaved: true,
  policy: { cancellationHours: 24, lateFeeTiming: 'late_cancel_or_no_show', lateFeeCents: 2000, noShowFeeCents: 5200, autoNoShowMinutes: 15 },
  sent: [{ at: d('2026-10-09T23:14:05Z'), channel: 'email', kind: 'booking_confirmation', status: 'sent' }],
  events: [{ at: d('2026-10-12T12:55:00Z'), type: 'no_show_marked', actor: 'staff', amountCents: null }],
  payments: [{ at: d('2026-10-12T12:56:00Z'), kind: 'fee_charged', amountCents: 5200, detail: '' }],
  dispute: { amountCents: 5200, detail: 'Dispute opened: fraudulent', openedAt: d('2026-10-20T10:00:00Z') },
};
const t = evidenceText(base);
check('it names the golfer, the round and when they booked', t.includes('Chris Avery <chris@example.com>') && t.includes('2026-10-12 at 08:40, 2 players') && t.includes('Oct 9, 2026, 7:14 PM EDT'));
check('it records the terms they ticked', t.includes('ticked "I agree"') && t.includes('terms version 2026-10'));
check('it lists the fee terms stored on the booking', t.includes('Free cancellation until 24 hours') && t.includes('No-show fee: $52.00.') && t.includes('15 minutes after'));
check('it lists the confirmation, the no-show and the charge', t.includes('Booking confirmation (email), accepted for delivery') && t.includes('Marked no-show (by staff)') && t.includes('fee charged $52.00'));
const bare = evidenceText({ ...base, termsAcceptedAt: null, cardSaved: false, policy: { cancellationHours: null, lateFeeTiming: null, lateFeeCents: 0, noShowFeeCents: 0, autoNoShowMinutes: null }, sent: [], events: [], payments: [], dispute: null });
check('nothing recorded is said plainly, never guessed', bare.includes('no recorded agreement') && bare.includes('No fee terms were recorded') && bare.includes('No card was saved') === false && bare.includes('no card was saved') && (bare.match(/Nothing recorded\./g) ?? []).length === 3);

// Review fixes: the pack never states a term the golfer wasn't shown.
const noLate = evidenceText({ ...base, policy: { cancellationHours: 24, lateFeeTiming: null, lateFeeCents: 0, noShowFeeCents: 2500, autoNoShowMinutes: null } });
check('no late fee → no "free cancellation until" line (they were told any time)', !noLate.includes('Free cancellation until') && noLate.includes('No-show fee: $25.00.'));
const legacy = evidenceText({ ...base, policy: { cancellationHours: 24, lateFeeTiming: null, lateFeeCents: 2000, noShowFeeCents: 0, autoNoShowMinutes: null } });
check('a booking with no recorded timing reads as the hold at the cutoff', legacy.includes('Late-cancellation fee: $20.00 — hold at the cutoff, refunded at check-in.'));
const oneFee = evidenceText({ ...base, policy: { cancellationHours: 24, lateFeeTiming: 'late_cancel_or_no_show', lateFeeCents: 2000, noShowFeeCents: 2000, autoNoShowMinutes: null } });
check('"cancel late or don\'t show" with one amount is one fee, not two', oneFee.includes('Late-cancellation fee: $20.00') && !oneFee.includes('No-show fee'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
