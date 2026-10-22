// W2-8 (first slice): the Analytics additions against a real database —
// earned per spot, demand turned away, short-shows and the fee-policy split,
// rounds the course called off kept out of the cancellation rate, and
// residents vs everyone else. Needs a database. Run: npx tsx scripts/analytics-w28-db-test.ts
import { PrismaClient } from '@prisma/client';
import { computeAnalytics } from '../src/lib/analytics';

const prisma = new PrismaClient();
const TAG = 'w28analyticstest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.bookingEvent.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTimeAlert.deleteMany({ where: { courseId } });
  await prisma.shopSale.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.blackout.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'A', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'W28', slug: `${TAG}-1`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  // A paid round before resident rates were recorded (RES-1) — never in the residents table.
  const old = await prisma.teeTime.create({ data: { courseId: course.id, date: '2026-10-10', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'available' } });
  await prisma.booking.create({ data: { teeTimeId: old.id, courseId: course.id, golferName: 'Old', golferEmail: `${TAG}+old@test.local`, players: 4, greenFeeTotal: 20000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 20000, status: 'completed', paymentStatus: 'paid', checkedInAt: new Date('2026-10-10T08:00:00Z'), checkedInPlayers: 4 } });
  const before = await computeAnalytics(course.id, { from: '2026-10-01', to: '2026-10-18' }, new Date('2026-10-20T12:00:00Z'));
  check('rounds before Oct 19 2026 are not in the residents table', before.customers.residents.rows.length === 0, JSON.stringify(before.customers.residents.rows));

  // Wednesday Nov 6 2030 (UTC course), now = Nov 10.
  const date = '2030-11-06';
  const now = new Date('2030-11-10T12:00:00Z');
  const tt = (time: string, booked = 0) => prisma.teeTime.create({ data: { courseId: course.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: booked, status: 'available' } });
  const bk = (teeTimeId: string, o: Record<string, unknown>) => prisma.booking.create({ data: {
    teeTimeId, courseId: course.id, golferName: 'G', golferEmail: `${TAG}+${Math.random()}@test.local`, players: 4,
    greenFeeTotal: 20000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 20000, status: 'confirmed', ...o,
  } });

  // 8:00 — sold out, paid, 2 residents at $30, all 4 checked in.
  const t8 = await tt('08:00', 4);
  await bk(t8.id, { status: 'completed', paymentStatus: 'paid', checkedInAt: new Date('2030-11-06T08:00:00Z'), checkedInPlayers: 4, residentPlayers: 2, residentRateCents: 3000, greenFeeTotal: 16000, totalAmount: 16000, cartFeeTotal: 4000, shopTotalCents: 1500 });
  // A walk-up shop sale that day ($10 + $1 tax), and one never paid.
  await prisma.shopSale.create({ data: { courseId: course.id, status: 'paid_cash', totalCents: 1100, taxCents: 100, paidAt: new Date('2030-11-06T10:00:00Z') } });
  await prisma.shopSale.create({ data: { courseId: course.id, status: 'open', totalCents: 5000 } });
  // A regular who played every week in September, then stopped.
  for (const day of ['2030-09-01', '2030-09-08', '2030-09-15']) {
    const t = await prisma.teeTime.create({ data: { courseId: course.id, date: day, time: '07:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 1, status: 'available' } });
    await prisma.booking.create({ data: { teeTimeId: t.id, courseId: course.id, golferName: 'Quiet Pat', golferEmail: `${TAG}+pat@test.local`, golferPhone: '201-555-0199', players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000, status: 'completed', paymentStatus: 'paid', checkedInAt: new Date(day + 'T07:00:00Z'), checkedInPlayers: 1 } });
  }
  // 9:00 — booked 4, turned up 3 (short-show), fee policy on, paid at the counter.
  const t9 = await tt('09:00', 4);
  await bk(t9.id, { status: 'completed', paymentStatus: 'paid_offline', checkedInAt: new Date('2030-11-06T09:00:00Z'), checkedInPlayers: 3, cancellationFeeApplies: true, greenFeeTotal: 15000, totalAmount: 15000 });
  // 10:00 — a no-show WITH a fee policy; 11:00 — a no-show without one.
  const t10 = await tt('10:00', 4); await bk(t10.id, { cancellationFeeApplies: true });
  const t11 = await tt('11:00', 4); await bk(t11.id, {});
  // 12:00 — called off for weather; 13:00 — the golfer cancelled.
  const t12 = await tt('12:00', 0);
  const wx = await bk(t12.id, { status: 'cancelled', cancelledAt: new Date('2030-11-06T06:00:00Z') });
  await prisma.bookingEvent.create({ data: { bookingId: wx.id, courseId: course.id, type: 'booking_cancelled', actorType: 'staff', metadata: { courseCalledOff: 'weather', reason: 'Lightning' } } });
  const t13 = await tt('13:00', 0);
  const gc = await bk(t13.id, { status: 'cancelled', cancelledAt: new Date('2030-11-05T06:00:00Z') });
  await prisma.bookingEvent.create({ data: { bookingId: gc.id, courseId: course.id, type: 'booking_cancelled', actorType: 'golfer' } });
  // A golfer waiting on the full 8:00, and a closed day in range.
  await prisma.teeTimeAlert.create({ data: { courseId: course.id, email: 'w@x.test', date, players: 2, teeTimeId: t8.id } });
  await prisma.blackout.create({ data: { courseId: course.id, date: '2030-11-08', reason: 'Aeration' } });

  const a = await computeAnalytics(course.id, { from: '2030-11-04', to: '2030-11-10' }, now);
  const wedRow = a.utilization.earnedPerSpot.rows.find(r => r.dow === 'Wed')!;
  const hourIdx = (h: number) => a.utilization.earnedPerSpot.hours.indexOf(h);
  check('earned per spot at 8: ($160 green + $40 cart) ÷ 4 spots = $50', wedRow.cells[hourIdx(8)] === 5000, JSON.stringify(wedRow));
  check('earned per spot at 10 (a no-show, nothing collected): $0', wedRow.cells[hourIdx(10)] === 0);
  check('sold out: the four full times', a.utilization.soldOutTimes === 4, String(a.utilization.soldOutTimes));
  check('a golfer waiting for a time (2 players)', a.utilization.alerts.count === 1 && a.utilization.alerts.players === 2 && a.utilization.alerts.notified === 0);
  check('closed day listed with its reason', a.utilization.closedDays.length === 1 && a.utilization.closedDays[0].reason === 'Aeration');
  check('short-show: one group, one player missing', a.noShows.shortShows.groups === 1 && a.noShows.shortShows.missingPlayers === 1, JSON.stringify(a.noShows.shortShows));
  check('no-shows split by fee policy: 50% with a fee, 50% without', a.noShows.byFeePolicy.withFee.noShowPct === 50 && a.noShows.byFeePolicy.withoutFee.noShowPct === 50, JSON.stringify(a.noShows.byFeePolicy));
  check('booked players who didn’t play, with a fee: 5 of 8 (a no-show group of 4 + 1 short)', a.noShows.byFeePolicy.withFee.didntPlayPct === 62.5, JSON.stringify(a.noShows.byFeePolicy.withFee));
  check('the weather call-off is not a cancellation', a.cancellations.count === 1 && a.cancellations.calledOff.bookings === 1 && a.cancellations.calledOff.weather === 1, JSON.stringify(a.cancellations.calledOff));
  check('cancellation rate leaves it out: 1 of 5', a.cancellations.ratePct === 20, String(a.cancellations.ratePct));
  const by = a.revenue.beyond;
  check('rounds with a cart: 1 of 2 paid bookings', by.cartRounds === 1 && by.rounds === 2 && by.cartPct === 50, JSON.stringify(by));
  check('shop items on rounds: $15', by.shopOnRoundsCents === 1500);
  check('walk-up shop sales: 1 paid, $10 before tax (the open one left out)', by.walkUpSales === 1 && by.walkUpCents === 1000);
  check('shop money is not in revenue', a.revenue.collectedCents === 16000 + 4000 + 15000, String(a.revenue.collectedCents));
  const quiet = a.customers.goneQuiet;
  check('a weekly regular who stopped is on the gone-quiet list, with email and phone', quiet.length === 1 && quiet[0].name === 'Quiet Pat' && quiet[0].email === `${TAG}+pat@test.local` && quiet[0].phone === '201-555-0199' && quiet[0].usualGapDays === 7, JSON.stringify(quiet));
  // Once Pat books again (Nov 20), Pat isn't quiet any more.
  const nt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-11-20', time: '07:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 1, status: 'available' } });
  await prisma.booking.create({ data: { teeTimeId: nt.id, courseId: course.id, golferName: 'Quiet Pat', golferEmail: `${TAG}+pat@test.local`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000, status: 'confirmed' } });
  const again = await computeAnalytics(course.id, { from: '2030-11-04', to: '2030-11-10' }, now);
  check('…but not once they have booked their next round', again.customers.goneQuiet.length === 0, JSON.stringify(again.customers.goneQuiet));
  const res = a.customers.residents.rows;
  check('residents: 2 resident players paying $60, 5 others paying $250', res.reduce((n, r) => n + r.resPlayers, 0) === 2 && res.reduce((n, r) => n + r.resCents, 0) === 6000 && res.reduce((n, r) => n + r.otherPlayers, 0) === 5 && res.reduce((n, r) => n + r.otherCents, 0) === 25000, JSON.stringify(res));

  // W2-8 (2): rate paid vs posted. A Gold member pair at 14:00 paying $30 each on a $50 time.
  const t14 = await tt('14:00', 2);
  await bk(t14.id, { players: 2, status: 'completed', paymentStatus: 'paid', checkedInAt: new Date('2030-11-06T14:00:00Z'), checkedInPlayers: 2, appliedRate: 'Gold', greenFeeTotal: 6000, totalAmount: 6000 });
  // W2-8 (5): pace. Tue Nov 12 (two days out) has 2 players booked; the Tuesday before had 6 booked two days out.
  const nov12 = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-11-12', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  await bk(nov12.id, { players: 2, createdAt: new Date('2030-11-09T10:00:00Z') });
  const nov05 = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-11-05', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 8, playersBooked: 6, status: 'available' } });
  await bk(nov05.id, { players: 4, createdAt: new Date('2030-11-02T10:00:00Z') });                                                          // made by then: counts
  await bk(nov05.id, { players: 2, createdAt: new Date('2030-11-04T10:00:00Z') });                                                          // made after: doesn't
  await bk(nov05.id, { players: 2, createdAt: new Date('2030-11-01T10:00:00Z'), status: 'cancelled', cancelledAt: new Date('2030-11-02T10:00:00Z') }); // gone by then
  await bk(nov05.id, { players: 2, createdAt: new Date('2030-11-01T10:00:00Z'), status: 'cancelled', cancelledAt: new Date('2030-11-04T10:00:00Z') }); // still on then: counts
  const c = await computeAnalytics(course.id, { from: '2030-11-04', to: '2030-11-10' }, now);
  const rate = (name: string) => c.revenue.rates.rows.find(r => r.rate === name);
  check('rate vs posted: standard players paid the posted price', rate('Standard')?.players === 5 && rate('Standard')?.paidCents === 25000 && rate('Standard')?.postedCents === 25000, JSON.stringify(c.revenue.rates.rows));
  check('…residents paid $60 against $100 posted (60%)', rate('Residents')?.players === 2 && rate('Residents')?.paidCents === 6000 && rate('Residents')?.ofPostedPct === 60);
  check('…a member tier is its own row', rate('Gold')?.kind === 'member' && rate('Gold')?.paidCents === 6000 && rate('Gold')?.postedCents === 10000);
  check('…$80 below posted in all', c.revenue.rates.belowPostedCents === 8000, String(c.revenue.rates.belowPostedCents));
  const tue = c.utilization.pace.find(p => p.date === '2030-11-12');
  check('pace covers 14 days from today', c.utilization.pace.length === 14 && c.utilization.pace[0].date === '2030-11-10');
  check('pace: 2 booked for Tue Nov 12, usually 6 by now (from the one Tuesday with times)', tue?.booked === 2 && tue?.usual === 6 && tue?.weeks === 1 && tue?.offered === 4, JSON.stringify(tue));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
