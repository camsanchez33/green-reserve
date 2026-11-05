// AUDIT-1 (security audit 2026-11-05, S1): one card charge per round at a time.
// A card charge claims the round (shopLockedAt) before it charges; a second card
// attempt, cash at the counter and the card reader all refuse a round with a live
// claim, and an attempt that died mid-charge (claim older than CHARGE_STALE_MS)
// can be taken over. Real database; nothing here reaches Stripe — every refusal
// happens before a charge.
// Run: npx tsx scripts/charge-claim-db-test.ts
import { prisma } from '../src/lib/prisma';
import { collectPayment, performCheckIn, BEING_CHARGED, CHARGE_STALE_MS } from '../src/lib/checkin-booking';
import { settleAtCounter } from '../src/lib/counter-pay';
import { todayIn } from '../src/lib/course-time';

const TAG = 'chgclaim';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
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
  const c = await prisma.course.create({ data: { name: 'Claim GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test_claim', stripeAccountActive: true } });
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: todayIn('UTC'), time: '23:50', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2 } });
  const mk = (lockedAgoMs: number | null) => prisma.booking.create({ data: {
    courseId: c.id, teeTimeId: tt.id, golferName: 'Pat Card', golferEmail: `${TAG}@g.local`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'confirmed', paymentStatus: 'card_on_file',
    stripeCustomerId: 'cus_test_claim', stripePaymentMethodId: 'pm_test_claim',
    shopLockedAt: lockedAgoMs == null ? null : new Date(Date.now() - lockedAgoMs),
  } });

  // A charge is in flight on this round (the golfer is paying on the pay link).
  const live = await mk(5_000);
  const second = await performCheckIn(live.id, STAFF);
  ok('a second card check-in is refused while a charge holds the round', 'error' in second && second.status === 409 && second.error === BEING_CHARGED, second);
  const collect = await collectPayment(live.id, STAFF);
  ok('…so is a "collect payment"', 'error' in collect && collect.status === 409 && collect.error === BEING_CHARGED, collect);
  const cash = await settleAtCounter(c.id, live.id, { actor: STAFF, actorName: 'Front desk' });
  ok('…and cash at the counter: it would be a second payment', !cash.ok && cash.status === 409 && cash.error === BEING_CHARGED, cash);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: live.id } });
  ok('…and nothing about the round changed', after.status === 'confirmed' && after.paymentStatus === 'card_on_file' && !after.paidOffline && after.shopLockedAt?.getTime() === live.shopLockedAt?.getTime(), after);

  // An attempt that died mid-charge left its claim. Past CHARGE_STALE_MS it can be taken over.
  const dead = await mk(CHARGE_STALE_MS + 60_000);
  const taken = await settleAtCounter(c.id, dead.id, { actor: STAFF, actorName: 'Front desk' });
  const d2 = await prisma.booking.findUniqueOrThrow({ where: { id: dead.id } });
  ok('a claim left past the stale time is taken over: cash goes through', taken.ok && d2.paymentStatus === 'paid_offline' && d2.status === 'completed', { taken, d2: d2.paymentStatus });

  // No claim at all: cash is never blocked (PAY-2).
  const open = await mk(null);
  const plain = await settleAtCounter(c.id, open.id, { actor: STAFF, actorName: 'Front desk' });
  ok('with no charge in flight, cash goes through as before', plain.ok, plain);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
