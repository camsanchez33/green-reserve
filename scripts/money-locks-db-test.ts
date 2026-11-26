// Audit 2026-11-24 M1 and L5.
//  M1: a cancel ignored the charge lock, so a golfer cancelling while staff or the pay link charged the
//      round could pay for it plus a fee, or be refunded with the booking left paid. The cancel now claims
//      the round like a card charge does, and check-in's last write is conditional (refunding on a miss).
//  L5: two identical admin refunds at once wrote two refund rows, and a hold or late fee given back ate
//      into the round's refund cap. The cap now comes from Stripe for the round's own charge, and a refund
//      row is written once under a lock.
// Real database; Stripe's refund calls are stubbed. Run: npx tsx scripts/money-locks-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { performCancellation } from '../src/lib/cancel-booking';
import { BEING_CHARGED, CHARGE_STALE_MS } from '../src/lib/checkin-booking';
import { refundBooking, refundedOnRound, recordRefundEventOnce } from '../src/lib/refund-booking';
import { refundRound } from '../src/lib/staff-refund';

const TAG = 'moneylockstest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// Stripe stubs: refunds.list answers from `stripeRefunds`; refunds.create returns one refund per idempotency key.
let stripeRefunds: { amount: number; status: string }[] = [];
const created = new Map<string, { id: string; amount: number }>();
let createCalls = 0;
let refundSeq = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const refundsApi = stripe.refunds as any;
refundsApi.list = async () => ({ data: stripeRefunds });
refundsApi.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
  createCalls++;
  await new Promise(r => setTimeout(r, 30));
  if (!created.has(o.idempotencyKey)) created.set(o.idempotencyKey, { id: `re_${TAG}_${++refundSeq}`, amount: p.amount });
  return created.get(o.idempotencyKey)!;
};

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  process.env.RESEND_API_KEY = '';
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Lock Owner', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Lock GC', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test_locks' } });
  let n = 0;
  const booking = async (data: Record<string, unknown> = {}) => {
    const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-01', time: `0${6 + Math.floor(n / 6)}:${String((n++ % 6) * 10).padStart(2, '0')}`, playersAvailable: 4, playersBooked: 1, greenFeeCents: 4000, cartFeeCents: 0 } });
    return prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'Pat', golferEmail: `${TAG}+g@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'confirmed', paymentStatus: 'pending', ...data } });
  };

  // ── M1: cancel vs the charge lock ──
  const live = await booking({ shopLockedAt: new Date() });
  const r1 = await performCancellation(live.id, { type: 'golfer', id: null });
  const live2 = await prisma.booking.findUniqueOrThrow({ where: { id: live.id } });
  ok('M1 a cancel while the round is being charged is refused, before any money moves', 'error' in r1 && r1.error === BEING_CHARGED && r1.status === 409 && live2.status === 'confirmed', r1);
  ok('M1 …and leaves the charge\'s claim alone', live2.shopLockedAt?.getTime() === live.shopLockedAt?.getTime());

  const reader = await booking({ readerStartedAt: new Date() });
  const r2 = await performCancellation(reader.id, { type: 'golfer', id: null });
  ok('M1 a cancel while the round is on the card reader is refused', 'error' in r2 && r2.error === BEING_CHARGED);

  const stale = await booking({ shopLockedAt: new Date(Date.now() - CHARGE_STALE_MS - 60_000) });
  const r3 = await performCancellation(stale.id, { type: 'golfer', id: null });
  const stale2 = await prisma.booking.findUniqueOrThrow({ where: { id: stale.id } });
  ok('M1 a claim left by a charge that died long ago does not block the cancel', 'success' in r3 && stale2.status === 'cancelled', r3);
  ok('M1 …and the cancel lets go of its own claim when it ends', stale2.shopLockedAt === null);

  const plain = await booking();
  const both = await Promise.all([performCancellation(plain.id, { type: 'golfer', id: null }), performCancellation(plain.id, { type: 'golfer', id: null })]);
  const seats = (await prisma.teeTime.findUniqueOrThrow({ where: { id: plain.teeTimeId } })).playersBooked;
  ok('M1 two cancels at once: one cancels, the other is refused, the seat is freed once', both.filter(r => 'success' in r).length === 1 && seats === 0, { both, seats });

  const cancelSrc = read('src/lib/cancel-booking.ts');
  ok('M1 the cancel\'s final write needs its own claim', cancelSrc.includes("where: { id: bookingId, status: 'confirmed', shopLockedAt: stamp },"));
  const checkinSrc = read('src/lib/checkin-booking.ts');
  ok('M1 check-in\'s final write is conditional and refunds the charge on a miss', checkinSrc.includes("const recorded = await prisma.booking.updateMany({\n      where: { id: bookingId, status: 'confirmed' },") && checkinSrc.includes('idempotencyKey: `checkin-race-${bookingId}-${paymentIntentId}`'));

  // ── L5 ──
  stripeRefunds = [{ amount: 1000, status: 'succeeded' }, { amount: 500, status: 'failed' }, { amount: 200, status: 'pending' }];
  ok('L5 refundedOnRound counts what Stripe refunded on the round (not failed ones)', (await refundedOnRound('pi_x', 'acct_x')) === 1200);

  const paid = await booking({ paymentStatus: 'paid', roundPaymentIntentId: `pi_${TAG}_round`, roundChargedCents: 4000, cancellationFeeChargeId: `pi_${TAG}_hold` });
  // A cutoff hold of $10 given back earlier: a 'refund' event, but on the hold's charge, not the round's.
  await prisma.paymentEvent.create({ data: { bookingId: paid.id, kind: 'refund', amountCents: 1000, stripeId: `re_${TAG}_hold`, actor: 'cron', detail: 'Cutoff hold refunded' } });
  stripeRefunds = [];
  const twin = await Promise.all([1, 2].map(() => refundBooking(paid.id, { reason: 'rained out', actor: 'admin', actorName: 'Test' })));
  const rows = await prisma.paymentEvent.count({ where: { bookingId: paid.id, kind: 'refund', stripeId: { startsWith: `re_${TAG}_` }, NOT: { stripeId: `re_${TAG}_hold` } } });
  ok('L5 the hold given back no longer eats into the round: the whole $40 can be refunded', twin.every(r => r.ok && r.amountCents === 4000), twin);
  ok('L5 two identical refunds at once write one refund row', rows === 1, rows);
  ok('L5 …and the round is marked refunded once', (await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).paymentStatus === 'refunded');

  const staffPaid = await booking({ paymentStatus: 'paid', roundPaymentIntentId: `pi_${TAG}_round2`, roundChargedCents: 4000 });
  created.clear();
  const staffTwin = await Promise.all([1, 2].map(() => refundRound(course.id, staffPaid.id, { amountCents: 1500, reason: 'slow pace', actorName: 'Desk', actor: { type: 'staff', id: 'x' } })));
  const staffRows = await prisma.paymentEvent.count({ where: { bookingId: staffPaid.id, kind: 'refund' } });
  ok('L5 staff refunds: two taps at once write one row', staffTwin.every(r => r.ok) && staffRows === 1, { staffTwin, staffRows });

  const once = await Promise.all(Array.from({ length: 6 }, () => recordRefundEventOnce({ bookingId: staffPaid.id, kind: 'refund', amountCents: 100, stripeId: `re_${TAG}_burst`, actor: 'stripe' })));
  ok('L5 six writers of one refund at once: exactly one row', once.filter(Boolean).length === 1 && (await prisma.paymentEvent.count({ where: { stripeId: `re_${TAG}_burst` } })) === 1, once);
  ok('L5 the Stripe webhook records refunds through the same once-only write', read('src/app/api/stripe/webhook/route.ts').includes('await recordRefundEventOnce({'));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
