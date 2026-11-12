import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { prorateExpenseCents, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';
import { REAL_COURSE, ON_REAL_COURSE } from '@/lib/real-courses';
import { PLATFORM_TZ } from '@/lib/admin-day';
import { parseFinancePeriod, resolveFinancePeriod, revenueSource, type RevenueSource } from '@/lib/finance-period';

// ADMIN-REDO Financial analytics (Cam 2026-11-12). OWNER only, like /api/admin/expenses (the
// company's private books), so no area gate. Read-only; every figure is counted, none estimated.
//
//   revenue   GreenReserve's side of the money ledger (MoneyMove.platformFeeCents, taken minus given
//             back), by month and by source (lib/finance-period revenueSource): a booking fee on a
//             no-show or cancelled booking is noShowLateFees. TEST-2: real courses only.
//   bookings  Revenue's definition: confirmed or completed bookings made in the month, real courses.
//   expenses  prorateExpenseCents per month (one-time costs in their month); the running month to now.
//   liveCourses  only for the running month (nothing records when a course was switched off and on);
//             newLiveCourses = real courses whose first go-live fell in the month.

type MonthRow = { month: string; what: string; cents: bigint };
type CourseMonthRow = { month: string; courseId: string; cents: bigint };
type BookingMonthRow = { month: string; courseId: string; n: bigint };

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });

  const now = new Date();
  const p = resolveFinancePeriod(parseFinancePeriod(req.nextUrl.searchParams.get('period')), now);
  // Monthly reads start at the month before the period (the prior window is summed by instant below).
  const from = p.monthBefore.start;

  const [moneyBySource, moneyByCourse, bookingRows, expenses, courses, liveNow] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char((m."at" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM') AS month,
             CASE WHEN m."what" = 'booking_fee' AND (b."noShowAt" IS NOT NULL OR b."status" = 'cancelled') THEN 'booking_fee_no_show_late' ELSE m."what" END AS what,
             SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId" LEFT JOIN "Booking" b ON b."id" = m."bookingId"
      WHERE c."isTest" = false AND m."platformFeeCents" > 0 AND m."at" >= ${from} AND m."at" < ${now}
      GROUP BY 1, 2`,
    prisma.$queryRaw<CourseMonthRow[]>`
      SELECT to_char((m."at" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM') AS month, m."courseId",
             SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId"
      WHERE c."isTest" = false AND m."platformFeeCents" > 0 AND m."at" >= ${p.current.start} AND m."at" < ${now}
      GROUP BY 1, 2`,
    prisma.$queryRaw<BookingMonthRow[]>`
      SELECT to_char((b."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM') AS month, b."courseId", COUNT(*)::bigint AS n
      FROM "Booking" b JOIN "Course" c ON c."id" = b."courseId"
      WHERE c."isTest" = false AND b."status" IN ('confirmed', 'completed') AND b."createdAt" >= ${p.current.start} AND b."createdAt" < ${now}
      GROUP BY 1, 2`,
    prisma.expense.findMany(),
    prisma.course.findMany({ where: REAL_COURSE, select: { id: true, name: true, firstWentLiveAt: true } }),
    prisma.course.count({ where: { active: true, archivedAt: null, ...REAL_COURSE } }),
  ]);

  const emptySources = (): Record<RevenueSource, number> => ({ serviceFees: 0, noShowLateFees: 0, membershipDues: 0, other: 0 });
  const revByMonth = new Map<string, Record<RevenueSource, number>>();
  for (const r of moneyBySource) {
    const s = revByMonth.get(r.month) ?? emptySources();
    s[revenueSource(r.what)] += Number(r.cents);
    revByMonth.set(r.month, s);
  }
  const bookingsByMonth = new Map<string, number>();
  const bookingsByCourseMonth = new Map<string, number>();
  for (const r of bookingRows) {
    bookingsByMonth.set(r.month, (bookingsByMonth.get(r.month) ?? 0) + Number(r.n));
    bookingsByCourseMonth.set(`${r.month}|${r.courseId}`, Number(r.n));
  }
  const revByCourseMonth = new Map(moneyByCourse.map(r => [`${r.month}|${r.courseId}`, Number(r.cents)]));
  const realIds = new Set(courses.map(c => c.id));
  const nameOf = new Map(courses.map(c => [c.id, c.name]));

  const expensesIn = (start: Date, end: Date) => {
    const byCategory: Record<ExpenseCategory, number> = { infra: 0, tools: 0, legal: 0, other: 0 };
    for (const e of expenses) {
      const c = prorateExpenseCents(e, start, end);
      if (!c) continue;
      byCategory[isExpenseCategory(e.category) ? e.category : 'other'] += c;
    }
    return { cents: Object.values(byCategory).reduce((a, b) => a + b, 0), byCategory };
  };
  const total = (s: Record<RevenueSource, number> | undefined) => (s ? s.serviceFees + s.noShowLateFees + s.membershipDues + s.other : 0);

  const months = p.months.map(m => {
    const src = revByMonth.get(m.month) ?? emptySources();
    const byCourseIds = new Set<string>();
    for (const k of [...revByCourseMonth.keys(), ...bookingsByCourseMonth.keys()]) if (k.startsWith(`${m.month}|`)) byCourseIds.add(k.slice(8));
    const byCourse = [...byCourseIds].filter(id => realIds.has(id)).map(id => ({
      courseId: id, name: nameOf.get(id) ?? '',
      bookings: bookingsByCourseMonth.get(`${m.month}|${id}`) ?? 0,
      revenueCents: revByCourseMonth.get(`${m.month}|${id}`) ?? 0,
    })).sort((a, b) => b.revenueCents - a.revenueCents || b.bookings - a.bookings || a.name.localeCompare(b.name));
    return {
      month: m.month, partial: m.partial,
      bookings: bookingsByMonth.get(m.month) ?? 0,
      revenue: { cents: total(src), bySource: src },
      expenses: expensesIn(m.start, m.end),
      liveCourses: m.partial ? liveNow : null,
      newLiveCourses: courses.filter(c => c.firstWentLiveAt && c.firstWentLiveAt >= m.start && c.firstWentLiveAt < m.end).length,
      byCourse,
    };
  });

  // The prior window can end mid-month, so its revenue and bookings are summed from rows by instant,
  // not by month. One more small query each, on the same rules.
  const [priorRev, priorBookings] = await Promise.all([
    prisma.$queryRaw<{ cents: bigint | null }[]>`
      SELECT SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId"
      WHERE c."isTest" = false AND m."platformFeeCents" > 0 AND m."at" >= ${p.prior.start} AND m."at" < ${p.prior.end}`,
    prisma.booking.count({ where: { status: { in: ['confirmed', 'completed'] }, createdAt: { gte: p.prior.start, lt: p.prior.end }, ...ON_REAL_COURSE } }),
  ]);
  const before = revByMonth.get(p.monthBefore.month);

  return NextResponse.json({
    period: { kind: p.kind, from: p.from, to: p.to, priorFrom: p.priorFrom, priorTo: p.priorTo },
    months,
    monthBefore: { revenue: total(before), expenses: expensesIn(p.monthBefore.start, p.monthBefore.end).cents },
    prior: { revenueCents: Number(priorRev[0]?.cents ?? 0), expensesCents: expensesIn(p.prior.start, p.prior.end).cents, bookings: priorBookings },
  });
}
