// ADMIN-C (Cam 2026-10-22, mockup C "Clean hub"): the numbers behind the admin
// Home — today's online bookings hour by hour against the same weekday last
// week, the last 7 days against the 7 before, and each course's week. Every
// figure is counted here from the database; nothing is estimated and no
// industry benchmark is printed. The route gates who sees it.
import { prisma } from './prisma';
import { REAL_COURSE, ON_REAL_COURSE } from './real-courses';
import { startOfPlatformDay, startOfPlatformDaysAgo, platformHour, dayKey } from './admin-day';
import { paidWindow } from './admin-today';
import { counterFeesUncollected } from './access-fee';
import { addDaysStr } from './course-time';

const DAY = 86_400_000;
// TEST-2: a test course's bookings never count toward the platform's numbers.
const LIVE = { status: { not: 'cancelled' }, ...ON_REAL_COURSE } as const;

/** Online bookings made between two instants: per platform hour (0–23), and when each was made. */
async function onlineByHour(from: Date, to: Date): Promise<{ hours: number[]; at: Date[] }> {
  const rows = await prisma.booking.findMany({ where: { ...LIVE, source: 'online', createdAt: { gte: from, lt: to } }, select: { createdAt: true } });
  const hours = Array(24).fill(0) as number[];
  for (const r of rows) hours[platformHour(r.createdAt)] += 1;
  return { hours, at: rows.map(r => r.createdAt) };
}

/**
 * Today so far against the same weekday a week ago. `lastWeek` covers that
 * whole day (the chart draws it to midnight); `lastWeekSoFar` stops at the
 * same clock time as now, so the two headline numbers compare like with like.
 */
export async function homeToday(now: Date) {
  const start = startOfPlatformDay(now);
  const lwStart = startOfPlatformDaysAgo(now, 7);
  const lwEnd = startOfPlatformDaysAgo(now, 6);
  const lwNow = new Date(Math.min(lwStart.getTime() + (now.getTime() - start.getTime()), lwEnd.getTime()));
  const [today, lastWeek, fees, lwFees] = await Promise.all([
    onlineByHour(start, now), onlineByHour(lwStart, lwEnd), paidWindow(start, now), paidWindow(lwStart, lwNow),
  ]);
  const hourNow = platformHour(now);
  return {
    hours: today.hours, lastWeekHours: lastWeek.hours, hourNow,
    bookings: today.at.length,
    // To the minute, like today's count and the fees — not the whole current hour.
    lastWeekSoFar: lastWeek.at.filter(d => d < lwNow).length,
    feesCents: fees.feesCents, lastWeekFeesCents: lwFees.feesCents,
  };
}

/**
 * One rolling 7-day window's numbers: bookings, online share, fees, cash fees.
 * No-shows go by the round's date over 7 whole platform days (firstDay..lastDay),
 * ending yesterday — today's rounds haven't all been played.
 */
async function week(from: Date, to: Date, firstDay: string, lastDay: string) {
  const [online, all, money, played, noShows, counter] = await Promise.all([
    prisma.booking.count({ where: { ...LIVE, source: 'online', createdAt: { gte: from, lt: to } } }),
    prisma.booking.count({ where: { ...LIVE, createdAt: { gte: from, lt: to } } }),
    paidWindow(from, to),
    prisma.booking.count({ where: { ...LIVE, teeTime: { date: { gte: firstDay, lte: lastDay } } } }),
    prisma.booking.count({ where: { ...LIVE, noShowAt: { not: null }, teeTime: { date: { gte: firstDay, lte: lastDay } } } }),
    counterFeesUncollected({ gte: from, lt: to }),
  ]);
  return {
    onlineBookings: online, allBookings: all,
    onlineSharePct: all ? Math.round((online / all) * 100) : null,
    feesCents: money.feesCents,
    noShowPct: played ? Math.round((noShows / played) * 1000) / 10 : null,
    rounds: played, noShows,
    uncollectedCents: counter.cents, uncollectedRounds: counter.rounds,
  };
}

export async function homeOverview(now: Date) {
  const mid = new Date(now.getTime() - 7 * DAY);
  const today = dayKey(now);
  const [cur, prev, live, goal] = await Promise.all([
    week(mid, now, addDaysStr(today, -7), addDaysStr(today, -1)),
    week(new Date(now.getTime() - 14 * DAY), mid, addDaysStr(today, -14), addDaysStr(today, -8)),
    prisma.course.count({ where: { active: true, archivedAt: null, ...REAL_COURSE } }),
    // The live-courses goal due soonest that hasn't passed: the one Home measures against.
    prisma.adminGoal.findFirst({ where: { metric: 'courses_live', dueAt: { gt: now } }, orderBy: { dueAt: 'asc' }, select: { target: true, dueAt: true } }),
  ]);
  return { current: cur, previous: prev, liveCourses: live, liveGoal: goal ? { target: goal.target, dueAt: goal.dueAt.toISOString() } : null };
}

export type HomeCourseStats = {
  bookings7d: number; bookingsPrev7d: number; onlineSharePct: number | null; fees7d: number;
  /** No open tee times from a week ago to two weeks ahead: closed for now, not slipping. */
  closed: boolean;
};

/** Each course's last 7 days against the 7 before, keyed by course id. */
export async function homeCourseStats(now: Date, ids: string[]): Promise<Map<string, HomeCourseStats>> {
  const out = new Map<string, HomeCourseStats>();
  if (ids.length === 0) return out;
  const mid = new Date(now.getTime() - 7 * DAY);
  const prevStart = new Date(now.getTime() - 14 * DAY);
  const today = dayKey(now);
  const course = { courseId: { in: ids } };
  const [cur, curOnline, prev, fees, feeEvents, sheet] = await Promise.all([
    prisma.booking.groupBy({ by: ['courseId'], where: { ...LIVE, ...course, createdAt: { gte: mid, lt: now } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...LIVE, ...course, source: 'online', createdAt: { gte: mid, lt: now } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...LIVE, ...course, createdAt: { gte: prevStart, lt: mid } }, _count: { id: true } }),
    prisma.booking.groupBy({ by: ['courseId'], where: { ...course, paymentStatus: 'paid', roundPaymentIntentId: { not: '' }, paidAt: { gte: mid, lt: now } }, _sum: { accessFeeTotal: true } }),
    prisma.paymentEvent.findMany({
      where: { kind: { in: ['fee_charged', 'fee_refunded'] }, createdAt: { gte: mid, lt: now }, booking: course },
      select: { kind: true, amountCents: true, booking: { select: { courseId: true } } },
    }),
    prisma.teeTime.groupBy({ by: ['courseId'], where: { ...course, date: { gte: addDaysStr(today, -7), lte: addDaysStr(today, 14) }, status: { not: 'blocked' } } }),
  ]);
  const n = (rows: { courseId: string; _count: { id: number } }[]) => new Map(rows.map(r => [r.courseId, r._count.id]));
  const curN = n(cur), onlineN = n(curOnline), prevN = n(prev);
  // Same rule as paidWindow: round fees plus booking fees charged on their own, less refunds.
  const feeCents = new Map(fees.map(f => [f.courseId, f._sum.accessFeeTotal ?? 0]));
  for (const e of feeEvents) {
    const id = e.booking.courseId;
    feeCents.set(id, (feeCents.get(id) ?? 0) + (e.kind === 'fee_charged' ? e.amountCents : -e.amountCents));
  }
  const open = new Set(sheet.map(s => s.courseId));
  for (const id of ids) {
    const b = curN.get(id) ?? 0;
    out.set(id, {
      bookings7d: b, bookingsPrev7d: prevN.get(id) ?? 0,
      onlineSharePct: b ? Math.round(((onlineN.get(id) ?? 0) / b) * 100) : null,
      fees7d: (feeCents.get(id) ?? 0) / 100,
      closed: !open.has(id),
    });
  }
  return out;
}
