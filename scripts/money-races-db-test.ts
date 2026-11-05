// AUDIT-1 (security audit 2026-11-05, S2 money): races between the crons, check-in and refunds.
//  1. The hourly cron never takes a cutoff hold while a round charge claims the booking.
//  2. The no-show charge skips a booking that's no longer a no-show ("Still coming" since the list was built).
//  3. Every refund on a course's account carries a stable idempotency key (a partial one would succeed twice).
//  4. A check-in after a full refund is a new charge, never a replay of the refunded one.
// Real database for 1–2 (nothing reaches Stripe: each refusal happens first); source pins for 3–4.
// Run: npx tsx scripts/money-races-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { chargeCutoffHold } from '../src/lib/cutoff-hold';
import { chargeNoShow } from '../src/lib/no-show-fee';
import { holdChargeKey } from '../src/lib/hold-key';

const TAG = 'mnyrace';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Race GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', cancellationHours: 24, stripeAccountId: 'acct_test_race', stripeAccountActive: true } });
  // A tee time 6 hours out: a 24-hour cancellation window has closed, so the hold is due.
  const at = new Date(Date.now() + 6 * 3600_000);
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: at.toISOString().slice(0, 10), time: at.toISOString().slice(11, 16), holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2 } });
  const base = { courseId: c.id, teeTimeId: tt.id, golferName: 'Pat', golferEmail: `${TAG}@g.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000,
    status: 'confirmed', stripeCustomerId: 'cus_test_race', stripePaymentMethodId: 'pm_test_race', cancellationHoursAtBooking: 24, lateFeeTimingAtBooking: 'hold_at_cutoff' };

  const claimed = await prisma.booking.create({ data: { ...base, paymentStatus: 'card_on_file', cancellationFeeTotal: 2000, cancellationFeeApplies: true, shopLockedAt: new Date() } });
  const r = await chargeCutoffHold(claimed.id);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: claimed.id } });
  ok('the cron takes no hold while the round is being charged', r === 'not_due' && after.paymentStatus === 'card_on_file' && !after.cancellationFeeChargeId, { r, ps: after.paymentStatus });

  // Control: the same booking with no charge in flight IS due — the cron goes to Stripe (a test key, so it's declined).
  const open = await prisma.booking.create({ data: { ...base, paymentStatus: 'card_on_file', cancellationFeeTotal: 2000, cancellationFeeApplies: true } });
  const r2 = await chargeCutoffHold(open.id);
  ok('…the same booking with nothing in flight is due: the cron goes on to charge it', r2 === 'declined', r2);

  const cleared = await prisma.booking.create({ data: { ...base, paymentStatus: 'card_on_file', noShowFeeTotal: 2000, noShowAt: null } });
  const ns = await chargeNoShow(cleared.id);
  ok('the no-show charge skips a booking no longer flagged ("Still coming" since the list was built)', !ns.courseFee.charged && ns.courseFee.reason === 'no longer a no-show', ns);

  // A hold handed back after a race leaves the booking chargeable again: its next hold must be a NEW
  // Stripe request, never a replay of the refunded one under the same key.
  const k0 = await holdChargeKey(open.id, 'pm_test_race');
  await prisma.moneyMove.create({ data: { courseId: c.id, bookingId: open.id, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: 2000, stripeId: `re_${TAG}_1`, actor: 'cron', note: 'the booking changed while the hold was charged' } });
  const k1 = await holdChargeKey(open.id, 'pm_test_race');
  ok('the hold key changes once a hold was given back (a refunded hold is never replayed)', k0 === `cancelfee-${open.id}-pm_test_race` && k1 === `cancelfee-${open.id}-pm_test_race-r1`, { k0, k1 });
  ok('…and the crons and a late cancel use that same key (still one charge between them)', readFileSync('src/lib/cutoff-hold.ts', 'utf8').includes('idempotencyKey: await holdChargeKey(booking.id, booking.stripePaymentMethodId)') && readFileSync('src/lib/cancel-booking.ts', 'utf8').includes('await holdChargeKey(booking.id, booking.stripePaymentMethodId as string)'));
  ok('cash at the counter decides the hold refund from the booking after it settled (a hold taken meanwhile comes back)', readFileSync('src/lib/counter-pay.ts', 'utf8').includes('const settledHold = await prisma.booking.findUniqueOrThrow') && readFileSync('src/lib/counter-pay.ts', 'utf8').includes('(hadHoldFee || !!settledHold.cancellationFeeChargeId)'));

  const src = (f: string) => readFileSync(f, 'utf8');
  const keyed = ['src/lib/checkin-booking.ts', 'src/lib/counter-pay.ts', 'src/lib/cancel-booking.ts', 'src/lib/split-booking-db.ts', 'src/lib/cutoff-hold.ts'];
  const unkeyed = keyed.flatMap(f => (src(f).match(/refundOnConnectedAccount\(\{[^}]*\}\)/g) ?? []).filter(call => !call.includes('idempotencyKey')).map(call => `${f}: ${call}`));
  ok('every refund on a course’s account carries an idempotency key', unkeyed.length === 0, unkeyed);
  ok('…the hold given back at check-in, at the counter and on a waived cancel share one key, so it’s given back once', ['src/lib/checkin-booking.ts', 'src/lib/counter-pay.ts', 'src/lib/cancel-booking.ts'].every(f => src(f).includes('hold-back-')));
  ok('a check-in after a full refund is a new charge, not a replay of the refunded one', src('src/lib/checkin-booking.ts').includes("booking.paymentStatus === 'refunded' && booking.roundPaymentIntentId ? `-after-${booking.roundPaymentIntentId}` : ''"));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
