import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const periodParam = searchParams.get('period') ?? '30d';
  const customFrom = searchParams.get('from');
  const customTo = searchParams.get('to');

  const now = new Date();

  // Period window for the per-course table
  let periodFrom: Date;
  let periodLabel: string;
  if (customFrom && customTo) {
    periodFrom = new Date(customFrom + 'T00:00:00Z');
    const periodTo = new Date(customTo + 'T23:59:59Z');
    periodLabel = `${customFrom} – ${customTo}`;
    return buildResponse(session, now, periodFrom, periodTo, periodLabel);
  }
  if (periodParam === '7d') {
    periodFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 7 days';
  } else if (periodParam === '90d') {
    periodFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 90 days';
  } else {
    periodFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 30 days';
  }

  return buildResponse(session, now, periodFrom, now, periodLabel);
}

async function buildResponse(
  _session: Awaited<ReturnType<typeof resolveAdminSession>>,
  now: Date,
  periodFrom: Date,
  periodTo: Date,
  periodLabel: string,
) {
  const todayStart = startOfDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = startOfMonth(now);

  const completedStatuses = ['confirmed', 'completed'];

  const [
    feesToday,
    fees7d,
    feesMonth,
    bookingsToday,
    bookings7d,
    bookingsMonth,
    failedCheckIns,
    periodBookingsRaw,
    allCourses,
  ] = await Promise.all([
    prisma.booking.aggregate({
      where: { status: { in: completedStatuses }, createdAt: { gte: todayStart } },
      _sum: { accessFeeTotal: true },
    }),
    prisma.booking.aggregate({
      where: { status: { in: completedStatuses }, createdAt: { gte: sevenDaysAgo } },
      _sum: { accessFeeTotal: true },
    }),
    prisma.booking.aggregate({
      where: { status: { in: completedStatuses }, createdAt: { gte: monthStart } },
      _sum: { accessFeeTotal: true },
    }),
    prisma.booking.count({
      where: { status: { in: completedStatuses }, createdAt: { gte: todayStart } },
    }),
    prisma.booking.count({
      where: { status: { in: completedStatuses }, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.booking.count({
      where: { status: { in: completedStatuses }, createdAt: { gte: monthStart } },
    }),
    // Failed check-in charges: checkInFailReason set AND no successful checkin yet
    prisma.booking.findMany({
      where: { checkInFailReason: { not: '' }, checkedInAt: null },
      select: {
        id: true,
        golferName: true,
        golferEmail: true,
        checkInFailReason: true,
        totalAmount: true,
        accessFeeTotal: true,
        course: { select: { id: true, name: true } },
        teeTime: { select: { date: true, time: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Bookings within selected period, grouped by course
    prisma.booking.groupBy({
      by: ['courseId'],
      where: {
        status: { in: completedStatuses },
        createdAt: { gte: periodFrom, lte: periodTo },
      },
      _count: { id: true },
      _sum: { accessFeeTotal: true, greenFeeTotal: true },
    }),
    // All active/live courses with Stripe status
    prisma.course.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, stripeAccountActive: true, active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  // Failed charges per course in period (for table column)
  const failedInPeriod = await prisma.booking.groupBy({
    by: ['courseId'],
    where: {
      checkInFailReason: { not: '' },
      checkedInAt: null,
      createdAt: { gte: periodFrom, lte: periodTo },
    },
    _count: { id: true },
  });
  const failedByCoursePeriod = Object.fromEntries(failedInPeriod.map(r => [r.courseId, r._count.id]));

  // Map period booking data by courseId
  const bookingsByCourse = Object.fromEntries(
    periodBookingsRaw.map(r => [
      r.courseId,
      {
        bookings: r._count.id,
        serviceFees: Number(r._sum.accessFeeTotal ?? 0) / 100,
        greenFeeVolume: Number(r._sum.greenFeeTotal ?? 0) / 100,
      },
    ]),
  );

  const byCourse = allCourses.map(c => ({
    courseId: c.id,
    name: c.name,
    active: c.active,
    stripeActive: c.stripeAccountActive,
    bookings: bookingsByCourse[c.id]?.bookings ?? 0,
    serviceFees: bookingsByCourse[c.id]?.serviceFees ?? 0,
    greenFeeVolume: bookingsByCourse[c.id]?.greenFeeVolume ?? 0,
    failedCharges: failedByCoursePeriod[c.id] ?? 0,
  }));

  const failedChargesCount = failedCheckIns.length;

  return NextResponse.json({
    stats: {
      feesToday: Number(feesToday._sum.accessFeeTotal ?? 0) / 100,
      fees7d: Number(fees7d._sum.accessFeeTotal ?? 0) / 100,
      feesMonth: Number(feesMonth._sum.accessFeeTotal ?? 0) / 100,
      bookingsToday,
      bookings7d,
      bookingsMonth,
      failedChargesCount,
    },
    byCourse,
    problems: {
      failedCheckIn: failedCheckIns.map(b => ({
        bookingId: b.id,
        courseId: b.course.id,
        courseName: b.course.name,
        golferName: b.golferName,
        golferEmail: b.golferEmail,
        failReason: b.checkInFailReason,
        teeDate: b.teeTime.date,
        teeTime: b.teeTime.time,
        amount: Number(b.totalAmount) / 100,
      })),
    },
    period: {
      from: periodFrom.toISOString().split('T')[0],
      to: periodTo.toISOString().split('T')[0],
      label: periodLabel,
    },
  });
}
