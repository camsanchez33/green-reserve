// RECEIPT-2 (Cam 2026-11-08, "fix it and need to have a smooth receipt for the card readers and printers"):
// a cash round's receipt shows what cash took (no GreenReserve fee — PAY-2), how it was paid and when, the cash
// handed over and the change when the register recorded it, the card that paid a card round; the course once;
// "View my bookings" only for a golfer with an account; and it prints as one plain narrow column (80 mm rolls).
// Run: npx tsx scripts/receipt-cash-test.ts
import { readFileSync } from 'fs';
import { counterPaidCents } from '../src/lib/counter-pay';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const api = readFileSync('src/app/api/receipt/[bookingId]/route.ts', 'utf8');
const page = readFileSync('src/app/receipt/[bookingId]/page.tsx', 'utf8');

// The figures (review 2026-11-08): 4 at $50, $6 booking fee.
const four = { players: 4, greenFeeTotal: 20000, cartFeeTotal: 0, rangeBallsTotal: 0, accessFeeTotal: 600, totalAmount: 20600, shopTotalCents: 0, shopTaxCents: 0, residentPlayers: 0, residentRateCents: null, memberRateCents: null, memberCartCents: null, feePaidCents: 0 };
ok('cash, whole group: $200 — the booking fee cash never collects is left out', counterPaidCents({ ...four, checkedInPlayers: null }, 'cash') === 20000);
ok('cash, 2 of 4 on a group that couldn\'t split: $100, what the counter took', counterPaidCents({ ...four, checkedInPlayers: 2 }, 'cash') === 10000);
ok('on account, 2 of 4: their part plus their share of the fee', counterPaidCents({ ...four, checkedInPlayers: 2 }, 'account') === 10300);
ok('the receipt uses those figures, and no fee line on a cash round', api.includes("const amountCents = counterPaidCents(booking, 'cash');") && api.includes("amountCents: counterPaidCents(booking, 'account')") && page.includes("{data.accessFeeTotal > 0 && payment?.method !== 'cash' && ("));
ok('cash: the cash handed over and the change, only when the register sale was this round alone', api.includes('const own = !!sale && sale._count.lines === 1 && sale.totalCents === amountCents;') && page.includes('Cash given {dollars(payment.tenderedCents)}') && page.includes('Change {dollars(payment.changeCents)}'));
ok('card: the card that paid, best effort from Stripe, never blocking the receipt', api.includes("expand: ['latest_charge']") && api.includes('catch { /* the receipt shows "Card" */ }') && page.includes("payment.card ?? 'Card'"));
ok('a refunded round is not shown as paid', api.includes("const played = booking.status === 'completed' && booking.paymentStatus !== 'refunded';"));
ok('the total says Paid (On account for a member account) with what was taken', page.includes("{payment ? (payment.method === 'account' ? 'On account' : 'Paid') : totalLabel}") && page.includes('{dollars(payment ? payment.amountCents : data.totalAmount)}'));
ok('when, in the course\'s clock', page.includes('function paidWhen(iso: string, tz?: string): string') && api.includes('timezone: booking.course.timezone,'));
ok('the course is named once (on the bar)', !page.includes('<h1 className="text-[22px] font-serif font-semibold tracking-tight text-ink mt-3 mb-1">{data.courseName}</h1>'));
ok('"View my bookings" only with an account', api.includes('hasAccount: !!booking.golferAccountId,') && page.includes('showBookings={!!data.hasAccount}'));
ok('prints as one narrow plain column: no buttons, links or site footer', page.includes('.receipt-wrap { max-width: 72mm !important;') && page.includes('.no-print, footer, nextjs-portal { display: none !important; }') && page.includes('.receipt-card * { color: #000 !important;'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
