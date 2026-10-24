// FEE-AT-BOOKING (Cam 2026-10-24): GreenReserve's $1.50/player charged when the
// golfer books, against a real database with Stripe's calls stubbed. The flag
// stays off in the app; these functions are exercised directly.
// Run: npx tsx scripts/fee-at-booking-db-test.ts (needs DATABASE_URL)
import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { chargeBookingFee, refundBookingFee, releaseUnpaidBooking } from '../src/lib/booking-fee';
import { feeCoveredCents, FEE_AT_BOOKING_ON } from '../src/lib/booking-fees';
import { roundChargeCents, roundApplicationFeeCents } from '../src/lib/shop';
import { describePolicy, cardAtBooking, policyFrom } from '../src/lib/cancel-policy';
import { chargeAccessFeeSeparately } from '../src/lib/access-fee';
import { performCancellation } from '../src/lib/cancel-booking';
const TAG = 'feeatbook';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

// ── Stripe stubs ──
const s = stripe as unknown as Record<string, Record<string, unknown>>;
const intents = new Map<string, { id: string; amount: number; status: string }>();
const refunds: { pi: string; amount: number }[] = [];
let declineNext = false;
s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
  if (declineNext) { declineNext = false; throw new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' } as never); }
  const id = `pi_${o.idempotencyKey}`;
  if (!intents.has(id)) intents.set(id, { id, amount: p.amount, status: 'succeeded' });
  return { ...intents.get(id)! };
};
s.paymentIntents.cancel = async (id: string) => ({ id, status: 'canceled' });
s.refunds.create = async (p: { payment_intent: string; amount: number }) => { refunds.push({ pi: p.payment_intent, amount: p.amount }); return { id: `re_${refunds.length}`, amount: p.amount }; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // ── Pure ──
  ok('the flag ships off', FEE_AT_BOOKING_ON === false);
  ok('covered = what was paid, never more than the fee', feeCoveredCents({ accessFeeTotal: 300, feePaidCents: 300 }) === 300 && feeCoveredCents({ accessFeeTotal: 150, feePaidCents: 300 }) === 150 && feeCoveredCents({ accessFeeTotal: 300 }) === 0);
  const b = { totalAmount: 10300, accessFeeTotal: 300, shopTotalCents: 0, shopFeeCents: 0, shopTaxCents: 0 };
  ok('the round charge leaves out the fee already paid', roundChargeCents({ ...b, feePaidCents: 300 }) === 10000 && roundChargeCents(b) === 10300);
  ok('…and GreenReserve’s share of it is nothing more', roundApplicationFeeCents({ ...b, feePaidCents: 300 }) === 0 && roundApplicationFeeCents(b) === 300);
  ok('partial check-in: only the prorated fee comes off (the no-show’s part is kept)', roundChargeCents({ totalAmount: 5150, accessFeeTotal: 150, shopTaxCents: 0, feePaidCents: 300 }) === 5000);
  const noFees = policyFrom({ cancellationHours: 24, lateCancellationFeeCents: 0 });
  ok('with the fee at booking every booking takes a card; the course’s own card setting is unchanged', cardAtBooking(noFees, true) && !cardAtBooking(noFees, false) && describePolicy(noFees, true).cardNeeded === false);
  ok('…and the terms say it is charged at booking and when it comes back', describePolicy(noFees, true).lines.some(l => /charged to your card when you book/.test(l) && /24 hours/.test(l) && /course cancels/.test(l)));
  ok('the terms are unchanged with the flag off', !describePolicy(noFees, false).lines.some(l => /when you book/.test(l)));

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Fee GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC', cancellationHours: 24 } });
  const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const tt = (date: string) => prisma.teeTime.create({ data: { courseId: c.id, date, time: '12:00', holes: 18, greenFeeCents: 5000, playersAvailable: 4 } });
  const book = async (teeTimeId: string, players = 2) => {
    await prisma.teeTime.update({ where: { id: teeTimeId }, data: { playersBooked: { increment: players } } });
    return prisma.booking.create({ data: { teeTimeId, courseId: c.id, golferName: 'Fee Golfer', golferEmail: `${TAG}+g@t.local`, players,
      greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: 150 * players, totalAmount: 5150 * players, status: 'confirmed', paymentStatus: 'card_on_file',
      stripeCustomerId: 'cus_x', stripePaymentMethodId: 'pm_x', cancellationHoursAtBooking: 24, source: 'online' } });
  };

  // Charged at booking, once.
  const far = await tt(day(5));
  const g = await book(far.id);
  const r1 = await chargeBookingFee(g.id);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: g.id } });
  ok('the fee is charged at booking and held on its own columns', r1.ok && after.feePaidCents === 300 && after.feePaymentIntentId.startsWith('pi_') && after.stripePaymentIntentId === '', after);
  ok('…ledgered as GreenReserve’s fee', (await prisma.paymentEvent.count({ where: { bookingId: g.id, kind: 'fee_charged' } })) === 1);
  const r2 = await chargeBookingFee(g.id);
  ok('…and never charged twice', r2.ok && intents.size === 1 && (await prisma.paymentEvent.count({ where: { bookingId: g.id, kind: 'fee_charged' } })) === 1);
  const sep = await chargeAccessFeeSeparately(g.id, { why: 'no_show', actor: 'system' });
  ok('a no-show never charges the fee again', sep.ok && !sep.charged);

  // Declined → the tee time goes back.
  const t2 = await tt(day(5));
  const d = await book(t2.id, 3);
  declineNext = true;
  const dr = await chargeBookingFee(d.id);
  if (!dr.ok) await releaseUnpaidBooking(d.id);
  ok('a declined fee releases the tee time; nothing is charged', !dr.ok && (await prisma.booking.findUniqueOrThrow({ where: { id: d.id } })).status === 'cancelled' && (await prisma.teeTime.findUniqueOrThrow({ where: { id: t2.id } })).playersBooked === 0);

  // Players taken off before the cutoff: their part comes back.
  const part = await refundBookingFee(g.id, 150, 'party lowered', 'golfer');
  ok('taking a player off refunds their part', part.ok && part.refundedCents === 150 && (await prisma.booking.findUniqueOrThrow({ where: { id: g.id } })).feePaidCents === 150 && refunds.at(-1)?.amount === 150);
  const cp = readFileSync('src/app/api/manage/[bookingId]/change-players/route.ts', 'utf8');
  ok('…the party-size change does that before the cutoff only', cp.includes('const feeBack = beforeCutoff ? Math.max(0, booking.feePaidCents - accessFeeTotal) : 0') && cp.includes('refundBookingFee(bookingId, feeBack'));

  // Cancel before the cutoff: refunded.
  const early = await book((await tt(day(5))).id);
  await chargeBookingFee(early.id);
  await performCancellation(early.id, { type: 'golfer', id: null });
  ok('a cancel before the cutoff refunds the whole fee', (await prisma.booking.findUniqueOrThrow({ where: { id: early.id } })).feePaidCents === 0);

  // Cancel late: kept.
  const soon = new Date(Date.now() + 3 * 3600000);
  const lateT = await prisma.teeTime.create({ data: { courseId: c.id, date: soon.toISOString().slice(0, 10), time: soon.toISOString().slice(11, 16), holes: 18, greenFeeCents: 5000, playersAvailable: 4 } });
  const late = await book(lateT.id);
  await chargeBookingFee(late.id);
  const before = refunds.length;
  await performCancellation(late.id, { type: 'golfer', id: null });
  ok('a late cancel keeps the fee', (await prisma.booking.findUniqueOrThrow({ where: { id: late.id } })).feePaidCents === 300 && refunds.length === before);

  // The course calls it off (inside the window): refunded anyway.
  const wx = await book(lateT.id);
  await chargeBookingFee(wx.id);
  await performCancellation(wx.id, { type: 'staff', id: null }, { waiveFee: true, courseCalledOff: 'weather' });
  ok('the course calling it off refunds the fee, even inside the window', (await prisma.booking.findUniqueOrThrow({ where: { id: wx.id } })).feePaidCents === 0);

  // The separate-fee code never touches the booking-time fee.
  const access = readFileSync('src/lib/access-fee.ts', 'utf8');
  ok('the separate fee keeps its own column (stripePaymentIntentId), never the booking fee’s', access.includes('- b.feePaidCents);') && !access.includes('feePaymentIntentId'));

  // Players added after booking, then a no-show: only the added players' fee is charged.
  const grew = await book((await tt(day(5))).id, 2);
  await chargeBookingFee(grew.id);
  await prisma.booking.update({ where: { id: grew.id }, data: { players: 4, accessFeeTotal: 600, totalAmount: 20600 } });
  const before2 = intents.size;
  const add = await chargeAccessFeeSeparately(grew.id, { why: 'no_show', actor: 'system' });
  const addPi = [...intents.values()].at(-1);
  ok('players added since booking: a no-show charges only their part', add.ok && add.charged && intents.size === before2 + 1 && addPi?.amount === 300, { add, addPi });

  // The no-show cron: a fee paid at booking at a course with no no-show fee leaves nothing due.
  const { dueNoShowCharges } = await import('../src/lib/no-show-fee');
  const past = await prisma.teeTime.create({ data: { courseId: c.id, date: day(-1), time: '12:00', holes: 18, greenFeeCents: 5000, playersAvailable: 4 } });
  const ns = await book(past.id);
  await chargeBookingFee(ns.id);
  await prisma.booking.update({ where: { id: ns.id }, data: { noShowAt: new Date(Date.now() - 86400000) } });
  ok('the no-show cron doesn’t keep retrying a booking whose fee was paid at booking', !(await dueNoShowCharges(new Date())).includes(ns.id));

  // A refund that lost a race with another one reads again and goes through.
  const race = await book((await tt(day(5))).id, 2);
  await chargeBookingFee(race.id);
  const orig = prisma.booking.updateMany.bind(prisma.booking);
  let raced = false;
  (prisma.booking as unknown as { updateMany: unknown }).updateMany = async (a: Parameters<typeof orig>[0]) => {
    if (!raced && a?.where?.id === race.id) { raced = true; await prisma.booking.update({ where: { id: race.id }, data: { feePaidCents: 150 } }); }
    return orig(a);
  };
  const rr = await refundBookingFee(race.id, 'all', 'race', 'golfer');
  (prisma.booking as unknown as { updateMany: unknown }).updateMany = orig;
  ok('a refund that lost a race retries once with the fresh amount', rr.ok && rr.refundedCents === 150 && (await prisma.booking.findUniqueOrThrow({ where: { id: race.id } })).feePaidCents === 0, rr);

  // A late, older refund event can't put refunded cents back.
  const wh = readFileSync('src/app/api/stripe/webhook/route.ts', 'utf8');
  ok('the webhook only ever lowers what was paid at booking', wh.includes('feePaymentIntentId: piOf(charge.payment_intent), feePaidCents: { gt:'));
  ok('the receipt tells the booking fee refund apart from the separate fee’s', readFileSync('src/lib/receipt-charges.ts', 'utf8').includes("startsWith('booking_fee_refunded:')"));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('fee-at-booking-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
