import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalCourses,
    activeCourses,
    pendingInquiries,
    totalBookings,
    recentBookings,
    totalGolfers,
    recentRevenue,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.course.count({ where: { active: true } }),
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    prisma.booking.count({ where: { status: 'confirmed' } }),
    prisma.booking.count({ where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } } }),
    prisma.golferAccount.count(),
    prisma.booking.aggregate({ where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, _sum: { accessFeeTotal: true } }),
  ]);

  // Revenue by day (last 30)
  const bookings = await prisma.booking.findMany({
    where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, accessFeeTotal: true, greenFeeTotal: true, totalAmount: true },
    orderBy: { createdAt: 'asc' },
  });

  const revenueByDay: Record<string, { platform: number; gross: number }> = {};
  for (const b of bookings) {
    const d = b.createdAt.toISOString().split('T')[0];
    if (!revenueByDay[d]) revenueByDay[d] = { platform: 0, gross: 0 };
    revenueByDay[d].platform += Number(b.accessFeeTotal) / 100;
    revenueByDay[d].gross += Number(b.totalAmount) / 100;
  }

  return NextResponse.json({
    totalCourses,
    activeCourses,
    pendingInquiries,
    totalBookings,
    recentBookings,
    totalGolfers,
    platformRevenue30d: (recentRevenue._sum.accessFeeTotal ?? 0) / 100,
    revenueByDay: Object.entries(revenueByDay).map(([date, v]) => ({ date, ...v })),
  });
}
