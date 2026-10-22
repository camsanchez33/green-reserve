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
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.blackout.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'A', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'W28', slug: `${TAG}-1`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
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
  await bk(t8.id, { status: 'completed', paymentStatus: 'paid', checkedInAt: new Date('2030-11-06T08:00:00Z'), checkedInPlayers: 4, residentPlayers: 2, residentRateCents: 3000, greenFeeTotal: 16000, totalAmount: 16000 });
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
  check('earned per spot at 8: $160 collected ÷ 4 spots = $40', wedRow.cells[hourIdx(8)] === 4000, JSON.stringify(wedRow));
  check('earned per spot at 10 (a no-show, nothing collected): $0', wedRow.cells[hourIdx(10)] === 0);
  check('sold out: the four full times', a.utilization.soldOutTimes === 4, String(a.utilization.soldOutTimes));
  check('a golfer waiting for a time (2 players)', a.utilization.alerts.count === 1 && a.utilization.alerts.players === 2 && a.utilization.alerts.notified === 0);
  check('closed day listed with its reason', a.utilization.closedDays.length === 1 && a.utilization.closedDays[0].reason === 'Aeration');
  check('short-show: one group, one player missing', a.noShows.shortShows.groups === 1 && a.noShows.shortShows.missingPlayers === 1, JSON.stringify(a.noShows.shortShows));
  check('no-shows split by fee policy: 50% with a fee, 50% without', a.noShows.byFeePolicy.withFee.noShowPct === 50 && a.noShows.byFeePolicy.withoutFee.noShowPct === 50, JSON.stringify(a.noShows.byFeePolicy));
  check('players missing with a fee: 1 of 8', a.noShows.byFeePolicy.withFee.shortPlayersPct === 12.5, JSON.stringify(a.noShows.byFeePolicy.withFee));
  check('the weather call-off is not a cancellation', a.cancellations.count === 1 && a.cancellations.calledOff.bookings === 1 && a.cancellations.calledOff.weather === 1, JSON.stringify(a.cancellations.calledOff));
  check('cancellation rate leaves it out: 1 of 5', a.cancellations.ratePct === 20, String(a.cancellations.ratePct));
  const res = a.customers.residents.rows;
  check('residents: 2 resident players paying $60, 5 others paying $250', res.reduce((n, r) => n + r.resPlayers, 0) === 2 && res.reduce((n, r) => n + r.resCents, 0) === 6000 && res.reduce((n, r) => n + r.otherPlayers, 0) === 5 && res.reduce((n, r) => n + r.otherCents, 0) === 25000, JSON.stringify(res));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
