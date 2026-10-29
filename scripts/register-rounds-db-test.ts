// POS-3 R2 (Cam 2026-10-24): green fees at the register — today's groups and
// walk-ins paid in cash with shop items, as one sale — against a real database.
// Run: npx tsx scripts/register-rounds-db-test.ts (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { ringUpCash, registerRounds } from '../src/lib/register';
import { settleAtCounter, counterDueCents } from '../src/lib/counter-pay';
import { walkUpNet } from '../src/lib/analytics';
import { todayIn } from '../src/lib/course-time';
const TAG = 'pos3rounds';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Rounds ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');
  const today = todayIn('UTC');
  const tt = (courseId: string, time: string, o: { walk?: boolean } = {}) => prisma.teeTime.create({ data: { courseId, date: today, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, walkingAllowed: o.walk ?? true, playersAvailable: 4 } });
  // 23:45 and later: never 20 minutes gone on their own day, whenever the test runs (the late-add cut-off).
  const t1 = await tt(c.id, '23:45'), t2 = await tt(c.id, '23:55', { walk: false }), tOther = await tt(other.id, '23:45');
  const book = async (courseId: string, teeTimeId: string, players: number, o: { access?: number; cart?: number } = {}) => {
    await prisma.teeTime.update({ where: { id: teeTimeId }, data: { playersBooked: { increment: players } } });
    const green = 5000 * players, cart = o.cart ?? 0, access = o.access ?? 0;
    return prisma.booking.create({ data: { teeTimeId, courseId, golferName: 'Group Pay', golferEmail: `${TAG}+${players}@t.local`, players,
      greenFeeTotal: green, cartFeeTotal: cart, accessFeeTotal: access, totalAmount: green + cart + access, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  };
  // An online booking carries GreenReserve's fee; at the counter they pay the round without it.
  const g = await book(c.id, t1.id, 2, { access: 300 });
  const foreign = await book(other.id, tOther.id, 2);
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Balls', priceCents: 1200, stockCount: 5 } });

  ok('a group owes the round less GreenReserve’s fee at the counter', counterDueCents(g) === 10000);
  const list = await registerRounds(c.id, today, '00:00');
  ok('the register lists today’s groups that still owe, with what they owe', list.owing.length === 1 && list.owing[0].bookingId === g.id && list.owing[0].dueCents === 10000, list.owing);
  ok('…and the open tee times for a walk-in, with cart-only marked', list.open.some(t => t.teeTimeId === t2.id && t.walkingAllowed === false && t.spots === 4) && !list.open.some(t => t.teeTimeId === tOther.id));

  const refused = await ringUpCash(c.id, { lines: [], bookingIds: [foreign.id], walkIns: [], soldBy: 't', actor: STAFF });
  ok('another course’s group can’t be rung up', !refused.ok && (await prisma.booking.findUniqueOrThrow({ where: { id: foreign.id } })).status === 'confirmed');

  const sale = await ringUpCash(c.id, {
    lines: [{ shopItemId: balls.id, quantity: 1 }], bookingIds: [g.id],
    walkIns: [{ teeTimeId: t2.id, golferName: 'Walk In', players: 1 }],
    cashTenderedCents: 20000, soldBy: 'desk@t.local', actor: STAFF,
  });
  ok('one cash sale settles a group, books and settles a walk-in, and sells an item', sale.ok && sale.value.skipped.length === 0, sale);
  const v = sale.ok ? sale.value.sale : null!;
  ok('…the total is the round, the walk-in (cart required on that time) and the item', v.totalCents === 10000 + 7000 + 1200, v.totalCents);
  ok('…the rounds are lines on the receipt', v.lines.filter(l => /round/.test(l.name)).length === 2, v.lines);
  const row = await prisma.shopSale.findUniqueOrThrow({ where: { id: v.id }, include: { lines: true } });
  ok('…marked as green fees, linked to their bookings, and the cash handed over kept', row.roundsCents === 17000 && row.lines.filter(l => l.bookingId).length === 2 && row.cashTenderedCents === 20000);
  const gAfter = await prisma.booking.findUniqueOrThrow({ where: { id: g.id } });
  ok('the group is checked in and paid at the counter, no GreenReserve fee kept', gAfter.status === 'completed' && gAfter.paymentStatus === 'paid_offline' && gAfter.paidOffline);
  const walk = await prisma.booking.findFirst({ where: { teeTimeId: t2.id } });
  ok('the walk-in is on the tee sheet, checked in and paid, with the cart', walk?.status === 'completed' && walk.paymentStatus === 'paid_offline' && walk.cartSelected && walk.source === 'walk_in');
  ok('…with a checked_in event, like any counter payment', (await prisma.bookingEvent.count({ where: { bookingId: walk!.id, type: 'checked_in' } })) === 1);
  ok('the item left the shelf', (await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } })).stockCount === 4);
  ok('analytics counts only the item as a shop sale', walkUpNet([{ totalCents: row.totalCents, taxCents: row.taxCents, refundedCents: 0, roundsCents: row.roundsCents }]).cents === 1200);
  ok('a sale of only rounds isn’t a shop sale at all', walkUpNet([{ totalCents: 10000, taxCents: 0, roundsCents: 10000 }]).sales === 0);

  // Green fees in a register sale are refunded from the booking, never from the register.
  const { refundSale } = await import('../src/lib/shop-sales');
  const tooMuch = await refundSale(c.id, v.id, { amountCents: 1201 }, 't');
  ok('a register refund can’t reach the green fees in the sale', !tooMuch.ok && /tee sheet booking/.test(tooMuch.ok ? '' : tooMuch.error), tooMuch);
  const hat = await refundSale(c.id, v.id, { restock: true }, 't');
  ok('…the items can be refunded in full, and go back on the shelf', hat.ok && hat.value.sale.refundedCents === 1200 && (await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } })).stockCount === 5, hat);
  ok('…after which the sale has nothing left to refund', !(await refundSale(c.id, v.id, {}, 't')).ok);
  ok('analytics: an item refunded in full leaves only rounds — not a shop sale', walkUpNet([{ totalCents: 18200, taxCents: 0, refundedCents: 1200, roundsCents: 17000 }]).sales === 0);
  ok('analytics: half the items refunded counts half of them', walkUpNet([{ totalCents: 18200, taxCents: 0, refundedCents: 600, roundsCents: 17000 }]).cents === 600);

  const again = await ringUpCash(c.id, { lines: [], bookingIds: [g.id], walkIns: [], soldBy: 't', actor: STAFF });
  ok('a group already paid can’t be rung up again', !again.ok, again);
  const twice = await settleAtCounter(c.id, g.id, { actor: STAFF, actorName: 't' });
  ok('…nor settled twice from the tee sheet', !twice.ok);
  ok('the register no longer lists it', (await registerRounds(c.id, today, '00:00')).owing.length === 0);
  const route = (await import('fs')).readFileSync('src/app/api/operator/shop-sales/route.ts', 'utf8');
  ok('rounds can’t go on a pay link, and walk-ins need the walk-in permission', route.includes("if (pay !== 'cash') return NextResponse.json({ error: 'Rounds are paid in cash") && route.includes("requirePermission(g.session, 'sheet.walkin')"));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('register-rounds-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
