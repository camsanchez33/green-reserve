// Money → Cancellations says why a cancellation kept no fee (Cam 2026-10-27), from
// what performCancellation() recorded — it zeroes cancellationFeeTotal when the fee
// isn't kept, so the column can't say. Pure + source guards.
// Run: npx tsx scripts/cancel-fee-reason-test.ts
import { readFileSync } from 'fs';
import { noFeeReason } from '../src/lib/cancel-fee-reason';
let failed = 0;
const check = (l: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${ok ? '' : ' — ' + JSON.stringify(d)}`); if (!ok) failed++; };
const course = { timezone: 'UTC', cancellationHours: 24 };
const late = { cancelledAt: new Date('2026-10-27T15:06:00Z'), cancellationHoursAtBooking: 24, source: 'online', teeTime: { date: '2026-10-27', time: '07:00' } };
const early = { ...late, cancelledAt: new Date('2026-10-25T06:00:00Z') };
const r = (b: typeof late, rec: Parameters<typeof noFeeReason>[2], fail: string | null = null) => noFeeReason(b, course, rec, fail);
check('two days ahead is in time', r(early, { feeAtBooking: 2500 }) === 'in_time');
check('late, Stripe not connected → charge failed', r(late, { feeAtBooking: 2500 }, 'Late-cancellation fee: the course’s Stripe account is not connected') === 'charge_failed');
check('late, no card → no card on file', r(late, { feeAtBooking: 2500 }, 'Late-cancellation fee: no card on file') === 'no_card');
check('staff waived it', r(late, { feeAtBooking: 2500, waived: true }) === 'waived');
check('the course called it off (weather)', r(late, { feeAtBooking: 2500, waived: true, courseCalledOff: 'weather' }) === 'called_off');
check('late, booked with no fee (online)', r(late, { feeAtBooking: 0 }) === 'no_fee');
check('late, a counter booking with no fee', r({ ...late, source: 'walk_in' }, { feeAtBooking: 0 }) === 'counter');
check('a cancel from before the record existed says nothing it can\'t prove', r(late, {}) === null && r(late, null) === null);
check('the booking\'s own window wins over the course\'s', r({ ...late, cancellationHoursAtBooking: 2, cancelledAt: new Date('2026-10-27T04:00:00Z') }, { feeAtBooking: 2500 }) === 'in_time');
const cancel = readFileSync('src/lib/cancel-booking.ts', 'utf8');
check('the cancel records the booking\'s fee and a waive on its event', cancel.includes('feeAtBooking: booking.cancellationFeeTotal, ...(waiveFee ? { waived: true } : {})'));
const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
check('the route strips its server-only fields', route.includes('({ cancellationHoursAtBooking: _h, source: _s, ...b }, i)') && !route.includes('stripePaymentMethodId: true'));
check('a kept no-show charge reads as a fee kept', route.includes('noShowFeeKeptCents: rec.noShowFeeKept') && readFileSync('src/components/dashboard/money/CancellationsPanel.tsx', 'utf8').includes('no-show fee kept'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
