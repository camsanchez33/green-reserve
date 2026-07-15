import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isSupportPlus = requireRole(session, SUPPORT_PLUS);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);

  const [
    totalCourses,
    archivedCourses,
    activeCourses,
    pendingInquiries,
    totalBookings,
    recentBookings,
    totalGolfers,
    recentRevenue,
    prevRevenue,
    prevBookings,
    newGolfers30d,
    newGolfersPrev30d,
    newCourses30d,
    newCoursesPrev30d,
    staleInquiries,
    noStripe,
    stuckOperators,
    recentInquiries,
  ] = await Promise.all([
    prisma.course.count({ where: { archivedAt: null } }),
    prisma.course.count({ where: { archivedAt: { not: null } } }),
    prisma.course.count({ where: { active: true } }),
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    prisma.booking.count({ where: { status: 'confirmed' } }),
    prisma.booking.count({ where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } } }),
    prisma.golferAccount.count(),
    prisma.booking.aggregate({ where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, _sum: { accessFeeTotal: true } }),
    prisma.booking.aggregate({ where: { status: 'confirmed', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { accessFeeTotal: true } }),
    prisma.booking.count({ where: { status: 'confirmed', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.golferAccount.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.golferAccount.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.course.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.course.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.courseInquiry.findMany({
      where: { status: { in: ['pending','in_review','details_requested','details_submitted'] }, createdAt: { lt: sevenDaysAgo } },
      select: { id: true, courseName: true, status: true, createdAt: true },
      take: 20,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.course.findMany({
      where: { active: true, stripeAccountActive: false, archivedAt: null },
      select: { id: true, name: true, slug: true },
      take: 20,
    }),
    prisma.courseOperator.findMany({
      where: { onboardingStep: { lt: 3 }, createdAt: { lt: sevenDaysAgo } },
      select: { id: true, email: true, name: true, onboardingStep: true, createdAt: true, course: { select: { id: true } } },
      take: 20,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.courseInquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, courseName: true, contactName: true, status: true, createdAt: true },
    }),
  ]);

  // "Needs you" extra data — parallel
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [yourMoveInquiries, draftCourses, failedChargesCount, unreadMessages] = await Promise.all([
    // Your Move = details_submitted (awaiting build) or building (you're building it)
    prisma.courseInquiry.findMany({
      where: { status: { in: ['details_submitted', 'building'] } },
      select: { id: true, courseName: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 5,
    }),
    // Draft = not archived, not live
    prisma.course.findMany({
      where: { active: false, archivedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    // Failed check-in charges (last 48h for "since yesterday" framing)
    isSupportPlus
      ? prisma.booking.count({ where: { checkInFailReason: { not: '' }, checkedInAt: null, createdAt: { gte: yesterday } } })
      : Promise.resolve(null),
    // Unread operator→admin messages
    prisma.message.count({ where: { readAt: null, senderType: 'operator' } }).catch(() => 0),
  ]);

  // Revenue + bookings by day (last 30) — fill all days so chart axis is correct
  const bookings30d = await prisma.booking.findMany({
    where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, accessFeeTotal: true, totalAmount: true },
    orderBy: { createdAt: 'asc' },
  });

  const revenueByDayMap: Record<string, { platform: number; gross: number; bookings: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    revenueByDayMap[d.toISOString().split('T')[0]] = { platform: 0, gross: 0, bookings: 0 };
  }
  for (const b of bookings30d) {
    const key = b.createdAt.toISOString().split('T')[0];
    if (revenueByDayMap[key]) {
      revenueByDayMap[key].platform += Number(b.accessFeeTotal) / 100;
      revenueByDayMap[key].gross += Number(b.totalAmount) / 100;
      revenueByDayMap[key].bookings += 1;
    }
  }
  const revenueByDay = Object.entries(revenueByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // Top 5 courses by bookings last 30d
  const topCoursesRaw = await prisma.booking.groupBy({
    by: ['courseId'],
    where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
    _sum: { accessFeeTotal: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const topCourseIds = topCoursesRaw.map(r => r.courseId);
  const topCourseDetails = topCourseIds.length > 0
    ? await prisma.course.findMany({ where: { id: { in: topCourseIds } }, select: { id: true, name: true, slug: true } })
    : [];
  const courseMap = Object.fromEntries(topCourseDetails.map(c => [c.id, c]));

  const topCourses = topCoursesRaw.map(r => ({
    id: r.courseId,
    name: courseMap[r.courseId]?.name ?? 'Unknown',
    slug: courseMap[r.courseId]?.slug ?? '',
    bookings: r._count.id,
    revenue: Number(r._sum.accessFeeTotal ?? 0) / 100,
  }));

  // Recent activity bookings
  const recentBookingsActivity = await prisma.booking.findMany({
    where: { status: 'confirmed' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      course: { select: { id: true, name: true } },
      teeTime: { select: { date: true, time: true } },
    },
  });

  return NextResponse.json({
    totalCourses,
    archivedCourses,
    activeCourses,
    pendingInquiries,
    totalBookings,
    recentBookings,
    recentBookingsPrev30d: prevBookings,
    totalGolfers,
    newGolfers30d,
    newGolfersPrev30d,
    platformRevenue30d: Number(recentRevenue._sum.accessFeeTotal ?? 0) / 100,
    platformRevenuePrev30d: Number(prevRevenue._sum.accessFeeTotal ?? 0) / 100,
    newCourses30d,
    newCoursesPrev30d,
    revenueByDay,
    topCourses,
    attentionItems: {
      staleInquiries: staleInquiries.map(i => ({ ...i, createdAt: i.createdAt.toISOString() })),
      noStripe,
      stuckOperators: stuckOperators.map(({ course, createdAt, ...rest }) => ({ ...rest, courseId: course?.[0]?.id ?? null, createdAt: createdAt.toISOString() })),
    },
    recentActivity: {
      bookings: recentBookingsActivity.map(b => ({
        id: b.id,
        courseId: b.course.id,
        courseName: b.course.name,
        golferName: b.golferName,
        players: b.players,
        totalAmount: b.totalAmount,
        teeDate: b.teeTime.date,
        teeTime: b.teeTime.time,
        createdAt: b.createdAt.toISOString(),
      })),
      inquiries: recentInquiries.map(i => ({ ...i, createdAt: i.createdAt.toISOString() })),
    },
    needsYou: {
      yourMoveInquiries: yourMoveInquiries.map(i => ({
        id: i.id,
        courseName: i.courseName,
        status: i.status,
        updatedAt: i.updatedAt.toISOString(),
      })),
      draftCourses: draftCourses.map(c => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt.toISOString(),
      })),
      failedChargesCount: failedChargesCount ?? null,
      unreadMessages,
    },
  });
}
