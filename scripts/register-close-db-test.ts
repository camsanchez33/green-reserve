// POS-3 R4 (Cam 2026-10-24): the end-of-day close-out — the day's cash from
// the records, the drawer counted, over or short — against a real database.
// Run: npx tsx scripts/register-close-db-test.ts (needs DATABASE_URL)
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { daySummary, closeDay, recentCloses } from '../src/lib/register-close';
import { createSale, refundSale } from '../src/lib/shop-sales';
import { ringUpCash } from '../src/lib/register';
import { settleAtCounter } from '../src/lib/counter-pay';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { PERMISSIONS, PRESETS } from '../src/lib/staff-permissions';
const TAG = 'pos3close';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.registerClose.deleteMany({ where: { courseId: { in: ids } } });
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
  const mk = (n: string) => prisma.course.create({ data: { name: `Close ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');
  const today = todayIn('UTC');
  const hat = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Hat', priceCents: 2500 } });
  const otherHat = await prisma.shopItem.create({ data: { courseId: other.id, name: 'Hat', priceCents: 9900 } });
  let n = 0;
  const book = async (courseId: string, o: { access?: number; players?: number } = {}) => {
    const players = o.players ?? 2, access = o.access ?? 0;
    const t = await prisma.teeTime.create({ data: { courseId, date: today, time: `23:${String(n++).padStart(2, '0')}`, holes: 18, greenFeeCents: 5000, playersAvailable: 4, playersBooked: players } });
    return prisma.booking.create({ data: { teeTimeId: t.id, courseId, golferName: 'G', golferEmail: `${TAG}+${n}@t.local`, players,
      greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: access, totalAmount: 5000 * players + access, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  };

  // Cash at the register: two hats ($50), and a sale with a hat and a group's round ($25 + $100).
  const s1 = await createSale({ courseId: c.id, lines: [{ shopItemId: hat.id, quantity: 2 }], pay: 'cash', soldBy: 't' });
  const reg = await book(c.id, { access: 300 });
  const s2 = await ringUpCash(c.id, { lines: [{ shopItemId: hat.id, quantity: 1 }], bookingIds: [reg.id], walkIns: [], soldBy: 't', actor: STAFF });
  // Paid at the counter on the tee sheet: a full twosome ($100, the fee not taken) and a twosome where one showed ($50).
  const full = await book(c.id, { access: 300 });
  const half = await book(c.id, { access: 300 });
  await settleAtCounter(c.id, full.id, { actor: STAFF, actorName: 't' });
  await settleAtCounter(c.id, half.id, { actor: STAFF, actorName: 't', checkedInPlayers: 1 });
  // A cash refund of one hat ($25) from the first sale.
  const rf = s1.ok ? await refundSale(c.id, s1.value.id, { amountCents: 2500, reason: 'wrong size' }, 't') : null;
  // Card, for reference: a walk-up sale paid by card and a round paid by card.
  await prisma.shopSale.create({ data: { courseId: c.id, totalCents: 4000, status: 'paid_card', paidAt: new Date(), lines: { create: [{ name: 'Glove', unitPriceCents: 4000, quantity: 1 }] } } });
  const card = await book(c.id, { access: 300 });
  await prisma.booking.update({ where: { id: card.id }, data: { paymentStatus: 'paid', roundPaymentIntentId: 'pi_x', roundChargedCents: 10300, paidAt: new Date(), status: 'completed' } });
  // Not today's, not this course's.
  await prisma.shopSale.create({ data: { courseId: c.id, totalCents: 7777, status: 'paid_cash', paidAt: new Date(Date.now() - 2 * 86400000), lines: { create: [{ name: 'Old', unitPriceCents: 7777, quantity: 1 }] } } });
  await createSale({ courseId: other.id, lines: [{ shopItemId: otherHat.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  ok('the day was set up', s1.ok && s2.ok && !!rf?.ok, { s1: s1.ok, s2: s2.ok, rf });

  const sum = await daySummary(c.id);
  const v = sum.ok ? sum.value : null!;
  ok('cash sales at the register: both sales, items and green fees split', sum.ok && v.cashSales.count === 2 && v.cashSales.cents === 5000 + 2500 + 10000 && v.cashSales.roundsCents === 10000 && v.cashSales.itemsCents === 7500, v?.cashSales);
  ok('paid at the counter on the tee sheet: the two groups, less the booking fee, a partial party for who showed — not the round the register already rang up', v.counterRounds.count === 2 && v.counterRounds.cents === 10000 + 5000, v.counterRounds);
  ok('cash refunds come off', v.cashRefunds.count === 1 && v.cashRefunds.cents === 2500);
  ok('cash taken = sales + counter − refunds', v.cashTakenCents === 17500 + 15000 - 2500, v.cashTakenCents);
  ok('card is reference only: the card sale and the round by card', v.card.shopCents === 4000 && v.card.roundsCents === 10300 && v.card.cents === 14300, v.card);
  ok('another day and another course are left out', !(v.cashSales.cents % 7777 === 0 && v.cashSales.cents > 0) && v.cashSales.count === 2);

  // Count the drawer.
  ok('the counted cash is required', !(await closeDay(c.id, { openingFloatCents: 10000 }, 't')).ok);
  ok('amounts must be whole cents, not negative', !(await closeDay(c.id, { openingFloatCents: -1, countedCashCents: 0 }, 't')).ok && !(await closeDay(c.id, { openingFloatCents: 0, countedCashCents: 1.5 }, 't')).ok);
  ok('only today or yesterday', !(await closeDay(c.id, { day: addDaysStr(today, -2), openingFloatCents: 0, countedCashCents: 0 }, 't')).ok && (await daySummary(c.id, addDaysStr(today, -1))).ok);
  const first = await closeDay(c.id, { openingFloatCents: 10000, countedCashCents: 10000 + 30000 - 500, note: 'gave $5 too much change' }, 'desk@t.local');
  ok('closed: expected = float + cash taken; $5 short', first.ok && first.value.expectedCashCents === 40000 && first.value.differenceCents === -500 && first.value.day === today && first.value.closedBy === 'desk@t.local', first);
  const again = await closeDay(c.id, { openingFloatCents: 10000, countedCashCents: 40000 }, 'manager@t.local');
  const recent = await recentCloses(c.id);
  ok('a recount adds a count — the latest first, the first kept', again.ok && again.value.differenceCents === 0 && recent.length === 2 && recent[0].id === (again.ok ? again.value.id : '') && recent[1].differenceCents === -500);
  ok('another course sees none of these counts', (await recentCloses(other.id)).length === 0);

  // Permissions and the route.
  const key = PERMISSIONS.find(p => p.key === 'shop.close');
  ok('closing out is its own permission, needing shop.sell — Front desk and Manager have it', !!key && key.requires?.includes('shop.sell') === true
    && PRESETS.find(p => p.key === 'front_desk')!.keys.includes('shop.close') && PRESETS.find(p => p.key === 'manager')!.keys.includes('shop.close') && !PRESETS.find(p => p.key === 'starter')!.keys.includes('shop.close'));
  const route = readFileSync('src/app/api/operator/register-close/route.ts', 'utf8');
  ok('the route checks shop.close and uses the session’s course', route.includes("requirePermission(session, 'shop.close')") && route.includes('g.session.courseId') && !/body\.courseId/.test(route));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('register-close-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
