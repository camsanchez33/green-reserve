// Money → Cancellations says why a cancellation kept no fee (Cam 2026-10-27).
// Run: npx tsx scripts/cancel-fee-reason-test.ts
import { readFileSync } from 'fs';
import { noFeeReason } from '../src/lib/cancel-fee-reason';
let failed = 0;
const check = (l: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? '' : ' — ' + JSON.stringify(d)}`); if (!ok) failed++; };
const course = { timezone: 'UTC', cancellationHours: 24 };
const base = { cancellationFeeTotal: 2500, cancellationHoursAtBooking: 24, stripePaymentMethodId: 'pm_x', source: 'online', teeTime: { date: '2026-10-27', time: '07:00' } };
const at = (iso: string) => new Date(iso);
check('two days ahead is in time', noFeeReason({ ...base, cancelledAt: at('2026-10-25T06:00:00Z') }, course, false) === 'in_time');
check('after the tee time with a card and a fee: waived', noFeeReason({ ...base, cancelledAt: at('2026-10-27T15:06:00Z') }, course, false) === 'waived');
check('…with no card on the booking', noFeeReason({ ...base, stripePaymentMethodId: '', cancelledAt: at('2026-10-27T15:06:00Z') }, course, false) === 'no_card');
check('…with no fee copied onto an online booking', noFeeReason({ ...base, cancellationFeeTotal: 0, cancelledAt: at('2026-10-27T15:06:00Z') }, course, false) === 'no_fee');
check('…a counter booking', noFeeReason({ ...base, cancellationFeeTotal: 0, source: 'walk_in', cancelledAt: at('2026-10-27T15:06:00Z') }, course, false) === 'counter');
check('…a failed charge', noFeeReason({ ...base, cancelledAt: at('2026-10-27T15:06:00Z') }, course, true) === 'charge_failed');
check('the booking\'s own window wins over the course\'s', noFeeReason({ ...base, cancellationHoursAtBooking: 2, cancelledAt: at('2026-10-27T04:00:00Z') }, course, false) === 'in_time');
const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
check('the card id never leaves the server', route.includes('stripePaymentMethodId: _pm') && route.includes("cancellationHoursAtBooking: _h"));
check('the panel shows the reason', readFileSync('src/components/dashboard/money/CancellationsPanel.tsx', 'utf8').includes('NO_FEE_LABEL[b.noFeeReason]'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
