import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [courses, bookingAggs, memberAggs] = await Promise.all([
    prisma.course.findMany({
      include: { operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.groupBy({
      by: ['courseId'],
      where: { status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _sum: { accessFeeTotal: true },
    }),
    prisma.courseMembership.groupBy({
      by: ['courseId'],
      where: { status: 'active' },
      _count: { id: true },
    }),
  ]);

  const bookingMap = new Map(bookingAggs.map(b => [b.courseId, { count: b._count.id, revenue: (b._sum.accessFeeTotal ?? 0) / 100 }]));
  const memberMap = new Map(memberAggs.map(m => [m.courseId, m._count.id]));

  const result = courses.map(c => ({
    ...c,
    bookings30d: bookingMap.get(c.id)?.count ?? 0,
    revenue30d: bookingMap.get(c.id)?.revenue ?? 0,
    activeMemberCount: memberMap.get(c.id) ?? 0,
  }));

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id }, select: { operatorId: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { courseId: id } }),
    prisma.waitlist.deleteMany({ where: { courseId: id } }),
    prisma.courseMembership.deleteMany({ where: { courseId: id } }),
    prisma.membershipTier.deleteMany({ where: { courseId: id } }),
    prisma.teeTime.deleteMany({ where: { courseId: id } }),
    prisma.teeTimeSchedule.deleteMany({ where: { courseId: id } }),
    prisma.blackout.deleteMany({ where: { courseId: id } }),
    prisma.courseStaff.deleteMany({ where: { courseId: id } }),
    prisma.courseInquiry.updateMany({ where: { builtCourseId: id }, data: { builtCourseId: null } }),
    prisma.course.delete({ where: { id } }),
    ...(course.operatorId ? [prisma.courseOperator.delete({ where: { id: course.operatorId } })] : []),
  ]);
  return NextResponse.json({ success: true });
}
