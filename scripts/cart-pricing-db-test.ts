// CART-2 (Cam 2026-11-06): a course that charges per cart (2 riders, rounded up), through the real paths —
// a counter booking, a party change, a move, a split — and a per-player booking left exactly as it was.
// Needs a database. Run: npx tsx scripts/cart-pricing-db-test.ts
import { prisma } from '../src/lib/prisma';
import { createCounterBooking } from '../src/lib/counter-pay';
import { changePartySize } from '../src/lib/change-party';
import { moveBooking } from '../src/lib/move-booking';
import { splitBooking } from '../src/lib/split-booking-db';
import { cartAddOnCentsFor } from '../src/lib/checkin-booking';

const TAG = 'cartpricingdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (s: string, cartPricing: string) => prisma.course.create({ data: { name: s, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', cancellationHours: 24, cartPricing } });
  const per = await mk('cart', 'per_cart'), pp = await mk('player', 'per_player');
  // Two days out (no cutoff in the way), two times.
  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const slot = (courseId: string, time: string, cart: number) => prisma.teeTime.create({ data: { courseId, date: day, time, holes: 18, greenFeeCents: 5000, cartFeeCents: cart, playersAvailable: 4, playersBooked: 0 } });
  const a = await slot(per.id, '09:00', 3000), b2 = await slot(per.id, '10:00', 3600), p1 = await slot(pp.id, '09:00', 2000);

  // ── a counter booking: 3 riders = 2 carts ──
  const made = await createCounterBooking(per.id, { teeTimeId: a.id, golferName: 'Three Ball', players: 3, cartSelected: true }, STAFF);
  ok('counter booking made', made.ok, made);
  if (!made.ok) throw new Error('stop');
  let bk = await prisma.booking.findUniqueOrThrow({ where: { id: made.id } });
  ok('per cart: 3 riders pay for 2 carts at the cart price; price and riders kept', bk.cartFeeTotal === 6000 && bk.cartUnitCents === 3000 && bk.cartRiders === 3 && bk.totalAmount === 15000 + 6000, bk);

  // ── party change: 3 → 4 stays 2 carts; 4 → 2 is 1 cart ──
  await changePartySize(made.id, 4, { by: 'staff', courseId: per.id, actor: STAFF });
  bk = await prisma.booking.findUniqueOrThrow({ where: { id: made.id } });
  ok('3 → 4 players: still 2 carts', bk.cartFeeTotal === 6000 && bk.cartRiders === 4 && bk.totalAmount === 20000 + 6000, bk);
  await changePartySize(made.id, 2, { by: 'staff', courseId: per.id, actor: STAFF });
  bk = await prisma.booking.findUniqueOrThrow({ where: { id: made.id } });
  ok('4 → 2 players: 1 cart', bk.cartFeeTotal === 3000 && bk.cartRiders === 2 && bk.totalAmount === 10000 + 3000, bk);

  // ── a move at the new time's price: the new cart price, per cart ──
  await changePartySize(made.id, 3, { by: 'staff', courseId: per.id, actor: STAFF });
  const mv = await moveBooking({ bookingId: made.id, newTeeTimeId: b2.id, courseId: per.id, pricing: 'new_slot', actor: STAFF });
  bk = await prisma.booking.findUniqueOrThrow({ where: { id: made.id } });
  ok('moved at the new time\'s price: 2 carts at its cart price', mv.ok && bk.cartFeeTotal === 7200 && bk.cartUnitCents === 3600 && bk.cartRiders === 3, { mv, bk });

  // ── a split: who leaves takes their riders and the cart price; the totals add up ──
  const before = bk.totalAmount;
  const sp = await splitBooking(per.id, made.id, 1, { actor: STAFF });
  ok('split made', sp.ok, sp);
  if (sp.ok) {
    const keep = await prisma.booking.findUniqueOrThrow({ where: { id: made.id } });
    const off = await prisma.booking.findUniqueOrThrow({ where: { id: sp.newBookingId } });
    ok('the parts add up to the one booking', keep.totalAmount + off.totalAmount === before && keep.cartFeeTotal + off.cartFeeTotal === 7200, { keep, off });
    ok('the riders split with the players, both keep the cart price', keep.cartRiders === 2 && off.cartRiders === 1 && off.cartUnitCents === 3600, { keep, off });
  }

  // ── "Add a cart today?" at self check-in: a walking group of 3 on a per-cart course = 2 carts ──
  const walk = await createCounterBooking(per.id, { teeTimeId: b2.id, golferName: 'Walkers', players: 1, cartSelected: false }, STAFF);
  if (walk.ok) {
    const w = await prisma.booking.update({ where: { id: walk.id }, data: { players: 3 }, include: { teeTime: { select: { date: true, cartFeeCents: true } } } });
    ok('the check-in cart add-on counts carts per two riders', (await cartAddOnCentsFor(w)) === 7200, await cartAddOnCentsFor(w));
  } else ok('walking booking made', false, walk);

  // ── a per-player course: exactly as before ──
  const p = await createCounterBooking(pp.id, { teeTimeId: p1.id, golferName: 'Per Player', players: 3, cartSelected: true }, STAFF);
  const pb = p.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: p.id } }) : null;
  ok('per player: every rider pays, nothing copied', !!pb && pb.cartFeeTotal === 6000 && pb.cartUnitCents === null && pb.cartRiders === null, pb);
  if (pb) {
    await changePartySize(pb.id, 2, { by: 'staff', courseId: pp.id, actor: STAFF });
    const pb2 = await prisma.booking.findUniqueOrThrow({ where: { id: pb.id } });
    ok('…and a party change prices it per player as always', pb2.cartFeeTotal === 4000 && pb2.cartRiders === null, pb2);
  }

  // ── switching a course to per cart never reaches a booking already made ──
  await prisma.course.update({ where: { id: pp.id }, data: { cartPricing: 'per_cart' } });
  if (pb) {
    await changePartySize(pb.id, 3, { by: 'staff', courseId: pp.id, actor: STAFF });
    const pb3 = await prisma.booking.findUniqueOrThrow({ where: { id: pb.id } });
    ok('a booking made per player stays per player after the switch', pb3.cartFeeTotal === 6000 && pb3.cartUnitCents === null, pb3);
  }

  await cleanup();
  console.log(failed === 0 ? '\ncart-pricing-db: all passed' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
