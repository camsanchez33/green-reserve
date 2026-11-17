// Analytics page data (Cam 2026-11-17) against a real database: Analytics' money is the Revenue page's money
// for the same dates (the ledger, lib/revenue-extras allSegments — never lib/analytics.ts sums); no-show and
// late-cancel fees are ledger money for those bookings only; stock value; nothing crosses
// courses. Needs a database. Run: npx tsx scripts/analytics-page-db-test.ts
import { prisma } from '../src/lib/prisma';
import { recordMove } from '../src/lib/money-ledger';
import { dayStart } from '../src/lib/ledger-view';
import { allSegments } from '../src/lib/revenue-extras';
import { computeAnalytics, previousRange } from '../src/lib/analytics';
import { shopReport } from '../src/lib/shop-report';
import { ledgerHeadline, noShowReport, stockValue, shopLedgerCents } from '../src/lib/analytics-page';

const TAG = 'anpagedbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingShopItem.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.blackout.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const tz = 'America/New_York';
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `AnP ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: tz, cancellationHours: 24 } });
  const c = await mk('a'), other = await mk('b');
  const range = { from: '2031-05-01', to: '2031-05-30' };
  const now = new Date('2031-05-31T16:00:00Z');
  const at = (d: string, hhmm: string) => new Date(dayStart(tz, d).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000);
  const tt = (courseId: string, date: string, time = '08:00') => prisma.teeTime.create({ data: { courseId, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const bk = (courseId: string, teeTimeId: string, o: Record<string, unknown>) => prisma.booking.create({ data: {
    teeTimeId, courseId, golferName: 'G', golferEmail: `${TAG}+${Math.random()}@noemail.greenreserve.app`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'confirmed', ...o,
  } });

  // A round on May 10, paid ahead on Apr 28 (before the range): analytics.ts (tee date) counts it, the ledger doesn't.
  const t10 = await tt(c.id, '2031-05-10');
  const paidAhead = await bk(c.id, t10.id, { status: 'completed', paymentStatus: 'paid', checkedInAt: at('2031-05-10', '08:00') });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 10300, platformFeeCents: 300, stripeId: `pi_${TAG}_ahead`, bookingId: paidAhead.id, at: at('2031-04-28', '10:00') });
  // A round on May 12 paid at the counter that day, and part refunded on May 13.
  const t12 = await tt(c.id, '2031-05-12');
  const counter = await bk(c.id, t12.id, { status: 'completed', paymentStatus: 'paid_offline', source: 'walk_in', checkedInAt: at('2031-05-12', '08:00') });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 10000, bookingId: counter.id, at: at('2031-05-12', '08:05') });
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'cash', account: 'course', amountCents: 2000, bookingId: counter.id, at: at('2031-05-13', '09:00') });
  // Dues and a register sale in the range (Revenue counts both).
  await recordMove({ courseId: c.id, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: 50000, stripeId: `pi_${TAG}_dues`, at: at('2031-05-05', '12:00') });
  const item = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Rain jacket', category: 'Apparel', priceCents: 8000, costCents: 4000, stockCount: 3, createdAt: new Date('2031-01-01T00:00:00Z') } });
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Balls', category: 'Balls', priceCents: 500, stockCount: 10, createdAt: new Date('2031-01-01T00:00:00Z') } });
  // Hidden (deleted after a sale), a dropped option, an option under a hidden parent: none is on the shelf.
  await prisma.shopItem.create({ data: { courseId: c.id, name: 'Deleted polo', priceCents: 6000, stockCount: 10, active: false } });
  const parent = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Hat', priceCents: 3000 } });
  await prisma.shopItem.create({ data: { courseId: c.id, name: 'Hat — Red', parentId: parent.id, optionLabel: 'Red', priceCents: 3000, stockCount: 4, active: false } });
  const hidden = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Old cap', priceCents: 2000, active: false } });
  await prisma.shopItem.create({ data: { courseId: c.id, name: 'Old cap — Blue', parentId: hidden.id, optionLabel: 'Blue', priceCents: 2000, stockCount: 7 } });
  const sale = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_card', totalCents: 1000, paidAt: at('2031-05-20', '11:00'), lines: { create: [{ shopItemId: balls.id, name: 'Balls', unitPriceCents: 500, quantity: 2 }] } } });
  const oldSale = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_card', totalCents: 8000, paidAt: new Date('2031-02-01T15:00:00Z'), lines: { create: [{ shopItemId: item.id, name: 'Rain jacket', unitPriceCents: 8000, quantity: 1 }] } } });
  void oldSale;
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'card', account: 'course', amountCents: 1000, stripeId: `pi_${TAG}_shop`, saleId: sale.id, at: at('2031-05-20', '11:00') });
  // A platform-account row (GreenReserve's fee) is never the course's money.
  await recordMove({ courseId: c.id, what: 'booking_fee', direction: 'in', method: 'card', account: 'platform', amountCents: 300, stripeId: `pi_${TAG}_plat`, at: at('2031-05-14', '10:00') });

  // No-shows: an online booking with a card and a no-show fee (charged), and a phone booking with no card.
  const t15 = await tt(c.id, '2031-05-15');
  const ns1 = await bk(c.id, t15.id, { stripePaymentMethodId: 'pm_x', stripeCustomerId: 'cus_x', noShowFeeTotal: 2500 });
  await recordMove({ courseId: c.id, what: 'no_show_fee', direction: 'in', method: 'card', account: 'course', amountCents: 2500, stripeId: `pi_${TAG}_ns`, bookingId: ns1.id, at: at('2031-05-16', '00:05') });
  // A hold-policy booking as bookings/route.ts and cutoff-hold.ts leave it: late fee stamped, no no-show fee, the hold
  // charged at the cutoff and kept (cancellationFeeApplies stays false on a live booking).
  const t14 = await tt(c.id, '2031-05-14');
  const hold = await bk(c.id, t14.id, { stripePaymentMethodId: 'pm_h', stripeCustomerId: 'cus_h', lateFeeTimingAtBooking: 'hold_at_cutoff', cancellationFeeTotal: 2000, noShowFeeTotal: 0 });
  await recordMove({ courseId: c.id, what: 'hold', direction: 'in', method: 'card', account: 'course', amountCents: 2000, stripeId: `pi_${TAG}_hold`, bookingId: hold.id, at: at('2031-05-13', '08:00') });
  // A twilight time, a Gold member's round on it (2 of 4 spots sold), played May 21.
  const tw = await prisma.teeTime.create({ data: { courseId: c.id, date: '2031-05-21', time: '17:00', holes: 18, greenFeeCents: 3000, cartFeeCents: 0, playersAvailable: 4, tierName: 'Twilight' } });
  await prisma.booking.create({ data: { teeTimeId: tw.id, courseId: c.id, golferName: 'Gold G', golferEmail: `${TAG}+gold@test.local`, players: 2, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'completed', paymentStatus: 'paid_offline', checkedInAt: at('2031-05-21', '17:00'), appliedRate: 'Gold' } });
  const t16 = await tt(c.id, '2031-05-16');
  await bk(c.id, t16.id, { source: 'phone', greenFeeTotal: 6000 });
  // A late cancel (10 h out) with a late fee, filled again by a 1-player booking that paid $50.
  const t18 = await tt(c.id, '2031-05-18', '10:00');
  const late = await bk(c.id, t18.id, { status: 'cancelled', cancelledAt: at('2031-05-18', '00:00'), createdAt: at('2031-05-01', '09:00'), cancellationFeeTotal: 1000, paymentStatus: 'cancellation_fee_charged' });
  await prisma.bookingEvent.create({ data: { bookingId: late.id, courseId: c.id, type: 'booking_cancelled', actorType: 'golfer' } });
  await recordMove({ courseId: c.id, what: 'late_fee', direction: 'in', method: 'card', account: 'course', amountCents: 1000, stripeId: `pi_${TAG}_late`, bookingId: late.id, at: at('2031-05-18', '00:00') });
  const refill = await bk(c.id, t18.id, { players: 1, greenFeeTotal: 5000, status: 'completed', paymentStatus: 'paid', checkedInAt: at('2031-05-18', '10:00'), createdAt: at('2031-05-18', '02:00') });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 5150, platformFeeCents: 150, stripeId: `pi_${TAG}_refill`, bookingId: refill.id, at: at('2031-05-18', '10:00') });
  // A cancel 10 days out, never filled.
  const t25 = await tt(c.id, '2031-05-25');
  await bk(c.id, t25.id, { status: 'cancelled', cancelledAt: at('2031-05-15', '08:00') });

  // The other course: same days, same kinds, and a fee row pointing at THIS course's booking (never ours).
  const ot = await tt(other.id, '2031-05-15');
  const ob = await bk(other.id, ot.id, {});
  await recordMove({ courseId: other.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 99900, stripeId: `pi_${TAG}_other`, bookingId: ob.id, at: at('2031-05-15', '10:00') });
  await recordMove({ courseId: other.id, what: 'no_show_fee', direction: 'in', method: 'card', account: 'course', amountCents: 7700, stripeId: `pi_${TAG}_otherns`, bookingId: ns1.id, at: at('2031-05-16', '00:05') });
  await prisma.shopItem.create({ data: { courseId: other.id, name: 'Not ours', priceCents: 100000, stockCount: 50 } });

  // ── Analytics money = Revenue's money ──
  const head = await ledgerHeadline(c.id, range, now);
  const revenueAll = await allSegments(c.id, tz, range, previousRange(range), now); // exactly as /api/operator/money/sales builds `all`
  const handGross = 10000 + 50000 + 1000 + 2000 + 2500 + 1000 + 5000; // course part of every course-account row in, May 1–30
  ok('Analytics Revenue equals the Revenue page\'s for the same dates', !!head && head.grossCents === revenueAll.grossCents && head.netCents === revenueAll.netCents && head.refundsCents === revenueAll.refundsCents, { head, revenueAll: { g: revenueAll.grossCents, n: revenueAll.netCents } });
  ok('…and its chart is the Revenue chart', !!head && JSON.stringify(head.series) === JSON.stringify(revenueAll.series));
  ok('…and it is the ledger: course money in by payment day, GreenReserve\'s fee and platform rows out, the other course out', head?.grossCents === handGross && head?.refundsCents === 2000, head);
  const tee = await computeAnalytics(c.id, range, now);
  ok('…and not lib/analytics.ts (tee-date money differs here: the May 10 round was paid in April)', tee.revenue.collectedCents !== head?.grossCents, { tee: tee.revenue.collectedCents, ledger: head?.grossCents });
  ok('the period before is Revenue\'s "before" figure', head?.before.grossCents === revenueAll.beforeGrossCents && head?.before.grossCents === 10000, head?.before);

  // ── Fields the Dashboard lane asked for (lib/analytics.ts, shop-report) ──
  ok('bookings per chart bucket add up to the bookings made', tee.revenue.series.reduce((n, x) => n + x.bookings, 0) === tee.behavior.bookings, tee.revenue.series.map(x => x.bookings));
  ok('twilight spots sold: 2 of 4', tee.behavior.spotsSold.twilightPct === 50 && tee.behavior.spotsSold.standardPct != null, tee.behavior.spotsSold);
  const gold = tee.customers.byMembership.find(m => m.name === 'Gold'), pub = tee.customers.byMembership.find(m => m.kind === 'public');
  ok('by membership: Gold 1 golfer 2 rounds, then Public last', gold?.kind === 'membership' && gold.golfers === 1 && gold.rounds === 2 && tee.customers.byMembership[tee.customers.byMembership.length - 1] === pub, tee.customers.byMembership);
  ok('shares add up to about 100', Math.abs(tee.customers.byMembership.reduce((n, m) => n + (m.sharePct ?? 0), 0) - 100) < 1, tee.customers.byMembership);
  const goldTop = tee.customers.topByRounds.find(r => r.name === 'Gold G');
  ok('top golfers carry membership and last played', goldTop?.membership === 'Gold' && goldTop.lastPlayed === '2031-05-21', tee.customers.topByRounds);

  // ── No-shows ──
  const r = (await noShowReport(c.id, range, now))!;
  ok('three no-shows (the no-show fee one, the hold one, the phone one)', r.totals.noShows === 3, r.totals);
  ok('the no-show rate is the same number Analytics shows', r.totals.ratePct === tee.noShows.ratePct, { ours: r.totals.ratePct, analytics: tee.noShows.ratePct });
  ok('recovered = this course\'s ledger fees: the no-show fee and the kept hold (the other course\'s row on the same booking id is not ours)', r.totals.recoveredCents === 2500 + 2000, r.totals);
  ok('lost value = the bookings\' price', r.totals.lostValueCents === 10000 + 10000 + 6000, r.totals);
  const how = (k: string) => r.byHow.find(x => x.key === k);
  ok('a hold-policy booking is in the card + fee row, with its hold', how('online_card_fee')?.noShows === 2 && how('online_card_fee')?.recoveredCents === 4500 && !how('online_card_no_fee'), r.byHow);
  ok('by how they booked', how('online_card_fee')?.noShows === 2 && how('counter_no_card')?.noShows === 1 && how('counter_no_card')?.recoveredCents === 0, r.byHow);
  const u24 = r.refill.buckets.find(b => b.key === 'under_24h')!, d7 = r.refill.buckets.find(b => b.key === '7d_plus')!;
  ok('refill: the late cancel\'s 2 spots, 1 filled again; the 10-day cancel, 0 of 2', u24.cancelledSpots === 2 && u24.refilledSpots === 1 && d7.cancelledSpots === 2 && d7.refilledSpots === 0, r.refill);
  ok('late cancels: the fee and the refill round are ledger money (course part)', r.lateCancels.feesCents === 1000 && r.lateCancels.refilledCents === 5000 && r.lateCancels.lostValueCents === 10000 && r.lateCancels.netCents === -4000, r.lateCancels);

  // ── Volume: more bookings than Postgres takes bound values in one statement ──
  const big = await tt(c.id, '2031-05-29', '12:00');
  const N = 33_000;
  for (let i = 0; i < N; i += 5000) {
    await prisma.booking.createMany({ data: Array.from({ length: Math.min(5000, N - i) }, () => ({ teeTimeId: big.id, courseId: c.id, golferName: 'V', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 1, greenFeeTotal: 100, accessFeeTotal: 0, totalAmount: 100, status: 'cancelled', cancelledAt: at('2031-05-20', '08:00') })) });
  }
  let vol: Awaited<ReturnType<typeof noShowReport>> = null, volErr = '';
  try { vol = await noShowReport(c.id, range, now); } catch (e) { volErr = String(e); }
  ok(`a busy course over a long range (${N} bookings) still answers`, !!vol && vol.refill.buckets.find(b => b.key === '7d_plus')!.cancelledSpots === 2 + N, volErr.slice(0, 200));
  await prisma.booking.deleteMany({ where: { teeTimeId: big.id } });

  // ── Shop ──
  const sr = await shopReport(c.id, range, { cost: false });
  ok('shop transactions: the paid register sale in the range (February\'s is not)', sr?.totals.transactions === 1, sr?.totals);
  const s = await stockValue(c.id, { cost: true }, now);
  ok('stock value: this course\'s shelf only', s.retailValueCents === 3 * 8000 + 10 * 500 && s.units === 13, s);
  ok('cost where known', s.costValueCents === 3 * 4000 && s.costUnknownItems === 1, s);
  ok('not selling: the jacket last sold in February; balls sold in May', s.notSelling.length === 1 && s.notSelling[0].name === 'Rain jacket' && s.notSelling[0].lastSoldAt === new Date('2031-02-01T15:00:00Z').toISOString(), s.notSelling);
  ok('shop revenue is the ledger\'s shop + food & beverage (Revenue\'s split)', (await shopLedgerCents(c.id, range, now)) === revenueAll.segments.shopCents + revenueAll.segments.fnbCents && revenueAll.segments.shopCents + revenueAll.segments.fnbCents === 1000);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
