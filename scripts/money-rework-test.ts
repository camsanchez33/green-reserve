// Money rework (Cam 2026-10-19, OPERATOR_REWORK_SPEC). Pure + source guards.
// Run: npx tsx scripts/money-rework-test.ts
import { readFileSync } from 'fs';
import { paymentStatus } from '../src/components/dashboard/money/PaymentsPanel';
import type { MoneyBooking } from '../src/components/dashboard/money/types';
let failed = 0;
const check = (label: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + d}`); if (!ok) failed++; };
const base: MoneyBooking = { id: 'b', golferName: 'A', golferEmail: '', players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, rangeBallsTotal: 0, accessFeeTotal: 300, totalAmount: 10300, cancellationFeeTotal: 1000, paymentStatus: 'card_on_file', status: 'confirmed', createdAt: '2026-10-01T00:00:00Z', teeTime: { date: '2026-10-18', time: '08:00', holes: 18 } };
const st = (o: Partial<MoneyBooking>) => paymentStatus({ ...base, ...o }, '2026-10-19');
check('card payment', st({ status: 'completed', paymentStatus: 'paid' }).label === 'Paid by card');
check('counter payment', st({ status: 'completed', paymentStatus: 'paid_offline' }).label === 'Paid at the counter');
check('played, not paid', st({}).label === 'Not paid yet' && st({}).group === 'unpaid');
check('no-show', st({ noShowAt: '2026-10-18T13:00:00Z' }).label === 'No-show');
check('hold taken, not paid', st({ paymentStatus: 'cancellation_fee_charged' }).label.startsWith('Not paid yet · $10.00 hold'));
check('late cancel', st({ status: 'cancelled', paymentStatus: 'cancellation_fee_charged' }).label === 'Cancelled · $10.00 fee kept');
check('cancel in time', st({ status: 'cancelled' }).label === 'Cancelled, no fee');
check('a round charged before check-in reads paid, not unpaid', st({ status: 'confirmed', paymentStatus: 'paid' }).label === 'Paid by card');
check('a full refund reads Refunded', st({ status: 'completed', paymentStatus: 'refunded' }).label === 'Refunded');
check('a no-show whose hold was taken says no-show', st({ noShowAt: 'x', paymentStatus: 'cancellation_fee_charged' }).label.startsWith('No-show'));
check('future round is not a payment', st({ teeTime: { date: '2026-10-25', time: '08:00', holes: 18 } }).group === 'upcoming');

const page = readFileSync('src/app/dashboard/money/page.tsx', 'utf8');
const cx = readFileSync('src/components/dashboard/money/CancellationsPanel.tsx', 'utf8');
const pay = readFileSync('src/components/dashboard/money/PaymentsPanel.tsx', 'utf8');
check('title says what it is, not "Money"', page.includes('>Payments and payouts</h1>') && !page.includes("'Stripe connected'"));
check('Stripe dashboard is a button for owners, not a status line', page.includes('Open your Stripe dashboard') && page.includes('!treatAsStaff'));
// DENSE-2 (Cam 2026-10-27): the overview line became the Sales view — today against last week, next payout, not paid yet.
const sales = readFileSync('src/components/dashboard/money/SalesPanel.tsx', 'utf8');
check('overview line: today, not paid yet, next payout', ['>Today<', 'Not paid yet', 'Next payout'].every(x => sales.includes(x)) && page.includes('<SalesPanel'));
check('Refresh is an icon', page.includes('aria-label="Refresh"') && page.includes('↻'));
check('cancellation policy is not edited here', !cx.includes('savePolicy') && cx.includes('/dashboard/settings?section=Prices+%26+fees'));
check('no upcoming-bookings list on Money', !cx.includes('Upcoming bookings'));
check('payments grouped by day, future rounds left to the tee sheet', pay.includes("s.group === 'upcoming') return false"));
check('payouts come from Stripe, read-only, behind the payouts permission', readFileSync('src/app/api/operator/stripe/payouts/route.ts', 'utf8').includes("requirePermission(session, 'money.payouts')"));
check('settings opens the linked section', readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes("searchParams.get('section')"));
const payouts = readFileSync('src/components/dashboard/money/PayoutsPanel.tsx', 'utf8');
check('fee note uses only LQ-2 allowed sentences', payouts.includes('our ${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player is then passed to GreenReserve') && !payouts.includes('Nothing. Golfers') && !/from your payouts/.test(payouts));
check('a failed payouts load is an error, never "nothing on its way"', page.includes('setPayoutError(p && !p.ok ? p.error') && page.includes('nextPayout === null ?'));
check('no money totals summed from the capped 200-row list', !pay.includes('$ paid') && !pay.includes("`${usd(paid)} paid`") && !cx.includes('in fees kept'));
check('an unconnected course is told to connect Stripe, not that nothing is on its way', page.includes('p.data.connected ?') && page.indexOf("Connect Stripe to get paid") < page.indexOf('nextPayout === null ?'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
