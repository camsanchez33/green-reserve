// CART-3 (Cam 2026-11-09: "still cant add or take off a cart on the checkout"; "range balls need to be done now";
// picked "Riding − N +" and "Buckets − N + at checkout"). At checkout staff set how many ride and the range-ball
// buckets before the round is paid. Per-player riders carry through: the part that checks in, pays separately or
// stays after a party-size change pays for the riders it holds (the booker's side first) — never for walkers.
// Needs a database. Run: npx tsx scripts/checkout-extras-db-test.ts
import { prisma } from '../src/lib/prisma';
import { setCheckoutExtras } from '../src/lib/checkout-extras';
import { ballCounts, ballField, ballWords } from '../src/lib/range-balls';
import { partyFees } from '../src/lib/member-rates';
import { splitShares } from '../src/lib/split-booking';
import { splitBooking } from '../src/lib/split-booking-db';
import { changePartySize } from '../src/lib/change-party';
import { moveBooking } from '../src/lib/move-booking';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'cart3test';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const actor = { type: 'staff' as const, id: 'test' };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

(async () => {
  await cleanup();
  // pure
  ok('buckets read and write: "small:2,large:1"; a bare size is one bucket', ballField(ballCounts('small:2,large:1')) === 'small:2,large:1' && ballCounts('medium').medium === 1 && ballWords(ballCounts('small:2')) === '2 small');
  const pp = { players: 4, greenFeeTotal: 20000, cartFeeTotal: 4000, residentPlayers: 0, residentRateCents: null, memberRateCents: null, memberCartCents: null, cartRiders: 2, cartUnitCents: null };
  ok('2 of 4 riding ($20 each): 1 showing pays one rider, 3 showing pay both, 4 pay both', partyFees(pp, 1, { greenFeeCents: 0, cartFeeCents: 0 }).cartFeeTotal === 2000 && partyFees(pp, 3, { greenFeeCents: 0, cartFeeCents: 0 }).cartFeeTotal === 4000 && partyFees(pp, 4, { greenFeeCents: 0, cartFeeCents: 0 }).cartFeeTotal === 4000);
  const sh = splitShares({ ...pp, rangeBallsTotal: 0, accessFeeTotal: 0, totalAmount: 24000 }, 2, { greenFeeCents: 5000, cartFeeCents: 2000 });
  ok('paying separately: the 2 who leave walk (the booker keeps the riders); totals add up', !!sh && sh.leave.cartFeeTotal === 0 && sh.keep.cartFeeTotal === 4000 && sh.keep.totalAmount + sh.leave.totalAmount === 24000, sh);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string, o: Record<string, unknown> = {}) => prisma.course.create({ data: { name: n, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC', cancellationHours: 24, hasDrivingRange: true, rangeBallsFree: false, rangeBallsSmallPriceCents: 800, rangeBallsLargePriceCents: 1400, ...o } });
  const c = await mk('a'), cart = await mk('b', { cartPricing: 'per_cart' }), other = await mk('c');
  const date = addDaysStr(todayIn('UTC'), 3);
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8, playersBooked: 4, status: 'available' } });
  const tt2 = await prisma.teeTime.create({ data: { courseId: cart.id, date, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 3000, playersAvailable: 8, playersBooked: 3, status: 'available' } });
  const book = (o: Record<string, unknown>) => prisma.booking.create({ data: { golferName: 'Pat', golferEmail: `${TAG}@t.local`, status: 'confirmed', paymentStatus: 'card_on_file', stripePaymentMethodId: 'pm_test', ...o } as never });
  const bk = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

  // per player: all 4 ride at $20 → 2 ride
  const g = await book({ teeTimeId: tt.id, courseId: c.id, players: 4, greenFeeTotal: 20000, cartFeeTotal: 8000, cartSelected: true, accessFeeTotal: 600, totalAmount: 28600 });
  const r1 = await setCheckoutExtras(c.id, g.id, { riders: 2 }, actor);
  const g1 = await bk(g.id);
  ok('per player: 4 riding → 2 riding takes $40 off; the total follows', r1.ok && g1.cartFeeTotal === 4000 && g1.cartRiders === 2 && g1.totalAmount === 24600 && g1.cartSelected, { r1, g1 });
  await setCheckoutExtras(c.id, g.id, { riders: 0 }, actor);
  const g0 = await bk(g.id);
  ok('…0 riding: no cart at all', g0.cartFeeTotal === 0 && !g0.cartSelected && g0.cartRiders === null && g0.totalAmount === 20600);
  await setCheckoutExtras(c.id, g.id, { riders: 3 }, actor);
  ok('…taking a cart from walking: 3 riders at the tee time\'s $20', (await bk(g.id)).cartFeeTotal === 6000);
  const balls = await setCheckoutExtras(c.id, g.id, { balls: { small: 2, large: 1 } }, actor);
  const gb = await bk(g.id);
  ok('range balls: 2 small ($8) + 1 large ($14) = $30, added to the total', balls.ok && gb.rangeBallsTotal === 3000 && gb.rangeBallsSize === 'small:2,large:1' && gb.totalAmount === 20600 + 6000 + 3000, { balls, gb });
  ok('…a size with no price is refused', !(await setCheckoutExtras(c.id, g.id, { balls: { medium: 1 } }, actor)).ok);
  ok('…more riders than players is refused', !(await setCheckoutExtras(c.id, g.id, { riders: 5 }, actor)).ok);
  ok('…another course can\'t touch it', !(await setCheckoutExtras(other.id, g.id, { riders: 1 }, actor)).ok);

  // party size: 3 riders of 4 → 2 players: 2 riders
  const ps = await changePartySize(g.id, 2, { by: 'staff', courseId: c.id, actor });
  const g2 = await bk(g.id);
  ok('party size 4 → 2: riders follow the players (2), the cart is 2 riders', !!ps && g2.cartRiders === 2 && g2.cartFeeTotal === 4000, g2);

  // split: 2 riding of 4, 2 leave → they walk
  const s0 = await book({ teeTimeId: tt.id, courseId: c.id, players: 4, greenFeeTotal: 20000, cartFeeTotal: 8000, cartSelected: true, accessFeeTotal: 0, totalAmount: 28000 });
  await setCheckoutExtras(c.id, s0.id, { riders: 2 }, actor);
  const sp = await splitBooking(c.id, s0.id, 2, { name: 'Mike', actor });
  const keep = await bk(s0.id), leave = sp.ok ? await bk(sp.newBookingId) : null;
  ok('pay separately on a 2-of-4 cart: the booker keeps both riders and the cart; who leaves walks; nothing lost', sp.ok && keep.cartFeeTotal === 4000 && keep.cartRiders === 2 && leave?.cartFeeTotal === 0 && keep.totalAmount + (leave?.totalAmount ?? 0) === 24000, { sp, keep, leave });

  // per cart: 3 riders = 2 carts at $30 → 2 riders = 1 cart
  const pc = await book({ teeTimeId: tt2.id, courseId: cart.id, players: 3, greenFeeTotal: 15000, cartFeeTotal: 6000, cartSelected: true, cartUnitCents: 3000, cartRiders: 3, accessFeeTotal: 0, totalAmount: 21000 });
  await setCheckoutExtras(cart.id, pc.id, { riders: 2 }, actor);
  const pc1 = await bk(pc.id);
  ok('per cart: 3 riders (2 carts) → 2 riders (1 cart at $30)', pc1.cartFeeTotal === 3000 && pc1.cartRiders === 2 && pc1.totalAmount === 18000, pc1);

  // members (review): a member booked walking takes a cart → the member rides at their cart rate, the guest at the public
  const mem = await book({ teeTimeId: tt.id, courseId: c.id, players: 2, greenFeeTotal: 3000 + 5000, cartFeeTotal: 0, cartSelected: false, accessFeeTotal: 0, totalAmount: 8000, appliedRate: 'Gold', memberRateCents: 3000, memberCartCents: 1000 });
  await setCheckoutExtras(c.id, mem.id, { riders: 2 }, actor);
  const m1 = await bk(mem.id);
  ok('member booked walking, both ride: member $10 + guest $20 = $30, the member cart rate kept', m1.cartFeeTotal === 3000 && m1.memberCartCents === 1000 && m1.totalAmount === 11000, m1);
  await setCheckoutExtras(c.id, mem.id, { riders: 1 }, actor);
  const m2 = await bk(mem.id);
  ok('…1 rides: the member, at $10', m2.cartFeeTotal === 1000 && m2.memberCartCents === 1000, m2);
  ok('…1 of 2 showing pays the member\'s $10; the other walked', partyFees({ ...m2, residentRateCents: null }, 1, { greenFeeCents: 5000, cartFeeCents: 2000 }).cartFeeTotal === 1000);

  // a move re-priced at the new time: 4 players, member + 3 guests, 2 riding → member $10 + one guest $20
  await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Gold', greenFeeWeekdayCents: 3000, greenFeeWeekendCents: 3000, cartFeeWeekdayCents: 1000, cartFeeWeekendCents: 1000, active: true } as never });
  await prisma.course.update({ where: { id: c.id }, data: { hasMemberPricing: true } });
  const ttM = await prisma.teeTime.create({ data: { courseId: c.id, date, time: '11:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 4, playersBooked: 0, status: 'available' } });
  const mg = await book({ teeTimeId: tt.id, courseId: c.id, players: 4, greenFeeTotal: 3000 + 3 * 5000, cartFeeTotal: 1000 + 2000, cartSelected: true, cartRiders: 2, accessFeeTotal: 0, totalAmount: 18000 + 3000, appliedRate: 'Gold', memberRateCents: 3000, memberCartCents: 1000 });
  const mv = await moveBooking({ bookingId: mg.id, newTeeTimeId: ttM.id, courseId: c.id, pricing: 'new_slot', actor });
  const mg1 = await bk(mg.id);
  ok('move (new price) of a member group with 2 of 4 riding: cart $10 + $20 = $30, still 2 riders', mv.ok && mg1.cartFeeTotal === 3000 && mg1.cartRiders === 2, { mv, mg1 });

  // review: everyone riding, then the group grows — the new player rides too, and "+" doesn't overcharge
  const ttG = await prisma.teeTime.create({ data: { courseId: c.id, date, time: '12:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 8, playersBooked: 3, status: 'available' } });
  const gr = await book({ teeTimeId: ttG.id, courseId: c.id, players: 3, greenFeeTotal: 15000, cartFeeTotal: 0, cartSelected: false, accessFeeTotal: 0, totalAmount: 15000 });
  await setCheckoutExtras(c.id, gr.id, { riders: 3 }, actor);
  ok('3 of 3 riding is stored as everyone (null)', (await bk(gr.id)).cartRiders === null);
  await changePartySize(gr.id, 4, { by: 'staff', courseId: c.id, actor });
  const gr1 = await bk(gr.id);
  ok('…grows to 4: all 4 ride at $80', gr1.cartFeeTotal === 8000 && (gr1.cartRiders === null || gr1.cartRiders === 4), gr1);
  const gr2r = await setCheckoutExtras(c.id, gr.id, { riders: 4 }, actor);
  ok('…riders 4 is a no-op at $80', gr2r.ok && (await bk(gr.id)).cartFeeTotal === 8000, gr2r);

  // locked once paid
  const paid = await book({ teeTimeId: tt.id, courseId: c.id, players: 2, greenFeeTotal: 10000, cartFeeTotal: 4000, cartSelected: true, accessFeeTotal: 0, totalAmount: 14000, paymentStatus: 'paid', roundPaymentIntentId: 'pi_x' });
  ok('paid: refused, nothing changes', !(await setCheckoutExtras(c.id, paid.id, { riders: 0 }, actor)).ok && (await bk(paid.id)).cartFeeTotal === 4000);
  const noWalk = await prisma.teeTime.create({ data: { courseId: c.id, date, time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 4, playersBooked: 2, status: 'available', walkingAllowed: false } });
  const nw = await book({ teeTimeId: noWalk.id, courseId: c.id, players: 2, greenFeeTotal: 10000, cartFeeTotal: 4000, cartSelected: true, accessFeeTotal: 0, totalAmount: 14000 });
  ok('a time that can\'t be walked: everyone rides', !(await setCheckoutExtras(c.id, nw.id, { riders: 1 }, actor)).ok);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('checkout-extras-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
