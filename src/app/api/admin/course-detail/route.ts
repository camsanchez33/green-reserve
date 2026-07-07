import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [course, recentBookings, totalBookings, revenue, staff] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, include: { operator: true, schedules: true } }),
    prisma.booking.findMany({ where: { courseId, status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, select: { id: true, golferName: true, golferEmail: true, players: true, totalAmount: true, createdAt: true, teeTime: { select: { date: true, time: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.booking.count({ where: { courseId, status: 'confirmed' } }),
    prisma.booking.aggregate({ where: { courseId, status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, _sum: { greenFeeTotal: true, accessFeeTotal: true, totalAmount: true } }),
    prisma.courseStaff.findMany({ where: { courseId }, select: { id: true, name: true, email: true, role: true, active: true } }),
  ]);

  return NextResponse.json({
    course,
    staff,
    recentBookings,
    totalBookings,
    revenue30d: {
      gross: (revenue._sum.totalAmount ?? 0) / 100,
      platform: (revenue._sum.accessFeeTotal ?? 0) / 100,
      greenFees: (revenue._sum.greenFeeTotal ?? 0) / 100,
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId, active, featured } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (active !== undefined) data.active = active;
  if (featured !== undefined) data.featured = featured;
  const updated = await prisma.course.update({ where: { id: courseId }, data });

  // Auto-advance linked inquiry from building → live when course is activated
  if (active === true) {
    const linked = await prisma.courseInquiry.findFirst({
      where: { builtCourseId: courseId, status: 'building' },
    });
    if (linked) {
      await prisma.courseInquiry.update({
        where: { id: linked.id },
        data: { status: 'live', wentLiveAt: new Date() },
      });
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linked.id, fromStatus: 'building', toStatus: 'live',
          trigger: 'system', actorName: 'Course activated',
        },
      });
    }
  }

  return NextResponse.json(updated);
}
