// ADMIN-REDO Bookings: pins the page's rules (src/app/api/admin/bookings/plan.ts) — whether a booking is paid, whether
// our service fee was collected (collected / not collected / collected when they pay / none), the booking number,
// and that the route offers no action (read-only, Cam 2026-11-12).
import { readFileSync } from 'fs';
import { payState, feeState, rowAmount, paidBeforeDispute, sumLedger, EMPTY_LEDGER, bookingNumber, numberQuery, policyLine, isFilter, type BookingFacts } from '../src/app/api/admin/bookings/plan';

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || info === undefined ? '' : `  ${JSON.stringify(info)}`}`); if (!ok) failed++; };
const base: BookingFacts = { status: 'confirmed', paymentStatus: 'card_on_file', paidOffline: false, paidByCard: false, accessFeeTotal: 300, hasCard: true, failed: false, disputed: false, noShow: false, checkedIn: false, ledger: EMPTY_LEDGER };
const paidRound = sumLedger([{ direction: 'in', amountCents: 17300, platformFeeCents: 300 }]);

check('the ledger sums in and out, with our fee apart', JSON.stringify(sumLedger([{ direction: 'in', amountCents: 1000, platformFeeCents: 150 }, { direction: 'out', amountCents: 400, platformFeeCents: 150 }])) === JSON.stringify({ inCents: 1000, outCents: 400, feeInCents: 150, feeOutCents: 150, disputeOutCents: 0, disputeInCents: 0, holdCents: 0 }));

// Paid?
check('upcoming with a card → not paid yet, card on file', payState(base).key === 'card_on_file');
check('upcoming with no card → pays later', payState({ ...base, hasCard: false }).key === 'pays_later');
check('checked in and paid by card → Paid (ok)', payState({ ...base, status: 'completed', checkedIn: true, paymentStatus: 'paid', ledger: paidRound }).tone === 'ok');
check('paid at the counter → Paid at the course', payState({ ...base, status: 'completed', checkedIn: true, paidOffline: true }).key === 'paid_counter');
const declined = { ...base, failed: true };
check('a declined card is not paid (bad), never checked in', payState(declined).key === 'declined' && payState(declined).tone === 'bad');
check('a dispute outranks paid', payState({ ...base, status: 'completed', checkedIn: true, disputed: true, ledger: paidRound }).key === 'disputed');
check('cancelled with nothing charged', payState({ ...base, status: 'cancelled' }).key === 'cancelled');
check('cancelled with a fee kept', payState({ ...base, status: 'cancelled', ledger: sumLedger([{ direction: 'in', amountCents: 2650, platformFeeCents: 150 }]) }).key === 'cancelled_kept');
check('a no-show charged', payState({ ...base, noShow: true, ledger: sumLedger([{ direction: 'in', amountCents: 7950, platformFeeCents: 450 }]) }).key === 'no_show_paid');
const charged = { direction: 'in', amountCents: 15700, platformFeeCents: 300, stripeId: 'pi_1' };
const refunded = sumLedger([charged, { direction: 'out', amountCents: 15700, platformFeeCents: 300, stripeId: 're_1' }]);
check('refunded in full → "Paid, then given back", never "nothing charged"', payState({ ...base, status: 'completed', checkedIn: true, paidByCard: true, ledger: refunded }).key === 'returned' && rowAmount({ ...base, status: 'completed', ledger: refunded }, 15700) === 0);
const lost = sumLedger([charged, { direction: 'out', amountCents: 15700, platformFeeCents: 0, stripeId: 'du_1:withdrawn' }]);
check('a dispute lost → "taken back by the bank"', payState({ ...base, status: 'completed', checkedIn: true, paidByCard: true, ledger: lost }).headline.includes('bank'));
const open = { ...base, status: 'completed', checkedIn: true, paidByCard: true, disputed: true, ledger: lost };
check('an open dispute shows what was paid ($157), not $0 after the bank withdrew it', payState(open).key === 'disputed' && rowAmount(open, 15700) === 15700 && paidBeforeDispute(lost) === 15700);
const old = { ...base, status: 'completed', checkedIn: true, paymentStatus: 'paid', paidByCard: true };
check('paid by card with no ledger row → says "not in the money ledger", fee counted as Revenue does', payState(old).key === 'unrecorded' && feeState(old).key === 'collected' && feeState(old).cents === 300);
check('a hold taken before the round (ledger rows what "hold") → "Hold taken"', payState({ ...base, ledger: sumLedger([{ direction: 'in', amountCents: 2650, platformFeeCents: 150, what: 'hold' }]) }).key === 'hold');
check('a round paid before check-in (admin Collect payment) → Paid, not "hold"', payState({ ...base, paymentStatus: 'paid', paidByCard: true, ledger: sumLedger([{ direction: 'in', amountCents: 15700, platformFeeCents: 300, what: 'round' }]) }).headline === 'Paid — not checked in yet');
check('…and with no ledger row → paid, not in the ledger (never "card on file")', payState({ ...base, paymentStatus: 'paid', paidByCard: true }).key === 'unrecorded');
check('money in that is not a hold (a booking fee) is not called a hold', payState({ ...base, ledger: sumLedger([{ direction: 'in', amountCents: 300, platformFeeCents: 300, what: 'booking_fee' }]) }).key === 'card_on_file');
check('a late cancel kept with our separate fee declined → our fee "not collected", never "none"', feeState({ ...base, status: 'cancelled', ledger: sumLedger([{ direction: 'in', amountCents: 2500, platformFeeCents: 0, what: 'late_fee' }]) }).key === 'not_collected');
check('a hold given back after the course calls it off → none', feeState({ ...base, status: 'cancelled', ledger: sumLedger([{ direction: 'in', amountCents: 2650, platformFeeCents: 0, what: 'hold' }, { direction: 'out', amountCents: 2650, platformFeeCents: 0, what: 'hold' }]) }).key === 'none');
check('an uncharged no-show shows no price in the list, as on the card', rowAmount({ ...base, noShow: true }, 18600) === null);
check('on a member account → its own state, fee collected when they pay', payState({ ...base, status: 'completed', checkedIn: true, paymentStatus: 'on_account' }).key === 'on_account' && feeState({ ...base, status: 'completed', paymentStatus: 'on_account' }).key === 'when_paid');
check('checked in with nothing paid and no card payment → nothing paid', payState({ ...base, status: 'completed', checkedIn: true }).key === 'nothing_due');

// Our fee
check('fee collected = what the ledger kept', JSON.stringify(feeState({ ...base, status: 'completed', ledger: paidRound })) === JSON.stringify({ key: 'collected', cents: 300 }));
check('upcoming → collected when they pay', feeState(base).key === 'when_paid');
check('paid cash at the counter → not collected (PAY-2)', feeState({ ...base, status: 'completed', checkedIn: true, paidOffline: true }).key === 'not_collected');
check('declined → not collected', feeState(declined).key === 'not_collected');
check('a booking with no fee (a counter booking) → none', feeState({ ...base, accessFeeTotal: 0, status: 'completed', paidOffline: true }).key === 'none');
check('cancelled in time → none', feeState({ ...base, status: 'cancelled' }).key === 'none');
check('a fee refunded in full → not collected', feeState({ ...base, status: 'cancelled', ledger: sumLedger([{ direction: 'in', amountCents: 150, platformFeeCents: 150 }, { direction: 'out', amountCents: 150, platformFeeCents: 150 }]) }).key === 'not_collected');

// Number, search, policy, filters
check('booking number = the first 8 of the id, as golfers see it ("Booking #")', bookingNumber('cmwd1rsq0000x11hvqyoip4xw') === 'CMWD1RSQ');
check('a number search takes "#CMWD1RSQ" or lower case', numberQuery('#CMWD1RSQ') === 'cmwd1rsq' && numberQuery('cmwd1rsq') === 'cmwd1rsq');
check('…but not a name', numberQuery('Mike Torres') === null);
check('policy line for an online booking', policyLine({ cancellationHours: 24, lateFeeCents: 2500, noShowFeeCents: 7500, source: 'online' }) === 'Free cancellation until 24 hours before · $25.00 late fee · $75.00 no-show fee');
check('a counter booking has no online policy', policyLine({ cancellationHours: null, lateFeeCents: 0, noShowFeeCents: 0, source: 'walk_in' }).startsWith('Booked by the course'));
check('filters are All, Problems, Today, Upcoming, No-shows, Cancelled', ['all', 'problems', 'today', 'upcoming', 'noshows', 'cancelled'].every(isFilter) && !isFilter('refunds'));

// Read-only: the route exports GET only and never touches Stripe or a write.
const route = readFileSync('src/app/api/admin/bookings/route.ts', 'utf8');
check('the Bookings route has GET only', /export async function GET/.test(route) && !/export (async function|const) (POST|PATCH|PUT|DELETE)/.test(route));
check('…and never calls Stripe or writes (charge, refund, retry, create, update, delete)', !/(?<!dashboard\.)stripe\.|getStripe|paymentIntents|refunds\.|\.(create|update|upsert|delete|deleteMany|updateMany|createMany)\(|recordMove|performCheckIn|chargeBooking/.test(route));
const page = readFileSync('src/app/admin/bookings/page.tsx', 'utf8');
check('the page sends no write request (only GET)', !/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(page));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
