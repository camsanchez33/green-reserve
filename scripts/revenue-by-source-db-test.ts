// Revenue by source (Cam 2026-11-16). Course side: the Revenue page's breakdown and totals show membership dues,
// season passes and the pro shop as their own lines. GreenReserve side: our fees by source — the $1.50 booking fee,
// the 1% shop service fee, the 1% on dues and passes. Every total comes from the ledger (MoneyMove), so every number
// agrees. Against a real database. Run: npx tsx scripts/revenue-by-source-db-test.ts
import { prisma } from '../src/lib/prisma';
import { feesBySourceByMonth, sourcesTotal } from '../src/lib/platform-revenue';
import { roundShopShareCents, revenueSource, REVENUE_SOURCES } from '../src/lib/finance-period';
import { allSegments } from '../src/lib/revenue-extras';
import { ledgerDays } from '../src/lib/ledger-view';
import { soldRows, soldTotal, paidRows, ledgerTotals } from '../src/components/dashboard/money/revenue/totals';
import type { Sales } from '../src/components/dashboard/money/revenue/data';
import { SOURCES } from '../src/app/admin/finance/logic';
const TAG = 'revsrc';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // ── Pure ──
  ok('the shop part of a round fee: all of it on the charge, pro rata on a refund, never more than the row', roundShopShareCents(630, 30, 630) === 30 && roundShopShareCents(315, 30, 630) === 15 && roundShopShareCents(10, 30, 20) === 10 && roundShopShareCents(630, 0, 630) === 0 && roundShopShareCents(315, 30, 0) === 0);
  ok('each fee has its own source', revenueSource('booking_fee') === 'serviceFees' && revenueSource('shop') === 'shopFees' && revenueSource('dues') === 'membershipDues' && revenueSource('pass') === 'membershipDues' && revenueSource('event') === 'other');
  ok('the admin page lists every source the route sends', REVENUE_SOURCES.every(s => (SOURCES as readonly string[]).includes(s)) && SOURCES.length === REVENUE_SOURCES.length);

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mkCourse = (n: string, isTest: boolean) => prisma.course.create({ data: { name: `Rev ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'America/New_York', isTest } });
  const c = await mkCourse('real', false), t = await mkCourse('test', true);
  // A month nothing else in the database touches.
  const at = (d: number, h = 15) => new Date(Date.UTC(2001, 2, d, h));
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2001-03-10', time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'available' } });
  // 4 players × $50 green, $6.00 booking fees, $30 of shop items with GreenReserve's 1% (30¢) — one card charge.
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Pat', golferEmail: `${TAG}@t.local`, players: 4, greenFeeTotal: 20000, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 20600, shopTotalCents: 3000, shopFeeCents: 30, status: 'completed', paymentStatus: 'paid' } });
  const mv = (courseId: string, what: string, direction: 'in' | 'out', method: string, amountCents: number, platformFeeCents: number, day: number, extra: object = {}) =>
    prisma.moneyMove.create({ data: { courseId, what, direction, method, account: 'course', amountCents, platformFeeCents, at: at(day), ...extra } });
  await mv(c.id, 'round', 'in', 'card', 20000 + 600 + 3000 + 30, 630, 10, { bookingId: b.id, stripeId: `${TAG}-pi-1` });
  await mv(c.id, 'round', 'out', 'card', 10315, 315, 12, { bookingId: b.id, stripeId: `${TAG}-re-1` }); // half refunded, half the fee back
  await prisma.moneyMove.create({ data: { courseId: c.id, what: 'booking_fee', direction: 'in', method: 'card', account: 'platform', amountCents: 150, platformFeeCents: 150, at: at(11), stripeId: `${TAG}-bf-1` } });
  await mv(c.id, 'shop', 'in', 'card_present', 5050, 50, 11, { stripeId: `${TAG}-shop-1` });
  await mv(c.id, 'shop', 'in', 'cash', 2000, 0, 11);
  await mv(c.id, 'dues', 'in', 'card', 121200, 1200, 13, { stripeId: `${TAG}-dues-1` });
  await mv(c.id, 'dues', 'in', 'cash', 50000, 0, 13);
  await mv(c.id, 'pass', 'in', 'card', 60600, 600, 14, { stripeId: `${TAG}-pass-1` });
  await mv(c.id, 'pass', 'in', 'cash', 40000, 0, 14);
  // A test course never counts in GreenReserve's numbers.
  await mv(t.id, 'dues', 'in', 'card', 101000, 1000, 13, { stripeId: `${TAG}-test-dues` });
  await mv(t.id, 'shop', 'in', 'card', 10100, 100, 13, { stripeId: `${TAG}-test-shop` });

  // ── GreenReserve side ──
  const fees = (await feesBySourceByMonth(new Date(Date.UTC(2001, 2, 1)), new Date(Date.UTC(2001, 3, 1)))).get('2001-03');
  ok('our fees by source: $1.50 booking fees alone, the 1% shop fee (with the shop on a round), the 1% on dues and passes', !!fees
    && fees.serviceFees === (630 - 30) - (315 - 15) + 150 && fees.shopFees === 30 - 15 + 50 && fees.membershipDues === 1200 + 600 && fees.noShowLateFees === 0 && fees.other === 0, fees);
  const allFees = await prisma.moneyMove.findMany({ where: { courseId: c.id }, select: { direction: true, platformFeeCents: true } });
  ok('…and they add up to every fee on the ledger (nothing double-counted or dropped), test course out', !!fees && sourcesTotal(fees) === allFees.reduce((n, m) => n + (m.direction === 'out' ? -1 : 1) * m.platformFeeCents, 0), fees);

  // ── Course side ──
  const range = { from: '2001-03-01', to: '2001-03-31' };
  const all = await allSegments(c.id, c.timezone, range, { from: '2001-02-01', to: '2001-02-28' }, new Date(Date.UTC(2001, 3, 2)));
  const s = all.segments;
  ok('the breakdown has dues, season passes and the pro shop as their own lines, what the course keeps', s.duesCents === 120000 + 50000 && s.passesCents === 60000 + 40000 && s.shopCents + s.fnbCents === 5000 + 2000, s);
  const segSum = Object.values(s).reduce((n, v) => n + v, 0);
  ok('…the lines add up to the total (money in, GreenReserve\'s fees out)', segSum === all.grossCents, { segSum, gross: all.grossCents });
  const sales = { all } as unknown as Sales;
  const rows = soldRows(sales);
  ok('the page shows Memberships, Season passes and Pro shop rows, and its total is the same number', rows.some(r => r.key === 'dues' && r.cents === 170000) && rows.some(r => r.key === 'passes' && r.cents === 100000) && rows.some(r => r.key === 'shop') && soldTotal(sales) === all.grossCents && rows.reduce((n, r) => n + r.cents, 0) === all.grossCents);
  ok('How it was paid is the same total', paidRows(sales).total === all.grossCents && paidRows(sales).rows.reduce((n, r) => n + r.cents, 0) === all.grossCents);
  const led = await ledgerDays(c.id, range.from, range.to);
  ok('the Ledger reads the range', !!led);
  const L = ledgerTotals(led?.days ?? []);
  ok('the Ledger\'s Revenue and Net agree with the breakdown', L.revenue === all.grossCents && L.net === all.netCents, { ledger: L, gross: all.grossCents, net: all.netCents });

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `revenue-by-source: ${failed} failed` : 'revenue-by-source: all passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
