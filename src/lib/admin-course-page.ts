// AW-7 (Cam 2026-10-21): the numbers behind an admin course page's Bookings
// and Money tabs. Fees use paidWindow() and the counter rule
// counterFeesUncollected() — the same definitions as Today, Goals and
// Revenue — so the course page never disagrees with them. The route gates it
// (support+); nothing here checks who is asking.
import { prisma } from './prisma';
import { COMPLETED_BOOKING_STATUSES } from './course-metrics';
import { todayIn, addDaysStr } from './course-time';
import { startOfPlatformMonth, startOfPlatformMonthsAgo } from './admin-day';
import { paidWindow } from './admin-today';
import { counterFeesUncollected } from './access-fee';
import { FAILED_CHARGE_WHERE } from './money-problems';
import { bucketWeeks, weekStart, COURSE_WEEKS, type WeekRow } from './admin-course-tabs';
import { roundChargeCents } from './shop';

export async function courseWeeks(courseId: string, timezone: string | null, now = new Date()): Promise<WeekRow[]> {
  const today = todayIn(timezone, now);
  const from = addDaysStr(weekStart(today), -7 * (COURSE_WEEKS - 1));
  const rows = await prisma.booking.findMany({
    where: { courseId, status: { in: COMPLETED_BOOKING_STATUSES }, teeTime: { date: { gte: from, lte: today } } },
    select: { source: true, players: true, teeTime: { select: { date: true } } },
  });
  return bucketWeeks(rows.map(r => ({ date: r.teeTime.date, source: r.source, players: r.players })), today);
}

export type FailedChargeRow = { bookingId: string; golferName: string; golferEmail: string; amount: number; teeDate: string; teeTime: string; reason: string };

export async function courseMoney(courseId: string, now = new Date()) {
  const start = startOfPlatformMonth(now);
  const priorStart = startOfPlatformMonthsAgo(now, 1);
  // "Same point last month", as on Today.
  const priorEnd = new Date(Math.min(priorStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  const [cur, prior, counterMonth, counterAll, failed] = await Promise.all([
    paidWindow(start, now, courseId),
    paidWindow(priorStart, priorEnd, courseId),
    counterFeesUncollected({ gte: start, lt: now }, courseId),
    counterFeesUncollected({ gte: new Date(0), lt: now }, courseId),
    prisma.booking.findMany({
      where: { ...FAILED_CHARGE_WHERE, courseId },
      select: { id: true, golferName: true, golferEmail: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, checkInFailReason: true, teeTime: { select: { date: true, time: true } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    }),
  ]);
  return {
    feesThisMonth: cur.feesCents / 100,
    roundsThisMonth: cur.rounds,
    feesSamePointLastMonth: prior.feesCents / 100,
    counterThisMonth: { rounds: counterMonth.rounds, fees: counterMonth.cents / 100 },
    counterAllTime: { rounds: counterAll.rounds, fees: counterAll.cents / 100 },
    failedCharges: failed.map((b): FailedChargeRow => ({
      // What the card is asked for — the round plus any shop items (POS-1a), as on Revenue.
      bookingId: b.id, golferName: b.golferName, golferEmail: b.golferEmail, amount: roundChargeCents(b) / 100,
      teeDate: b.teeTime.date, teeTime: b.teeTime.time, reason: b.checkInFailReason,
    })),
  };
}
