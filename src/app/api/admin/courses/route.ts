import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const showArchived = req.nextUrl.searchParams.get('showArchived') === '1';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [courses, bookingAggs, memberAggs] = await Promise.all([
    prisma.course.findMany({
      where: showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
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

// DELETE now archives (soft-delete). Hard delete lives at /api/admin/archive-course.
export async function DELETE(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  await prisma.course.update({
    where: { id },
    data: { archivedAt: new Date(), archivedBy: session.name, active: false, liveStatus: 'draft' },
  });

  const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: id } });
  if (linked) {
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: linked.id,
        fromStatus: linked.status,
        toStatus: linked.status,
        trigger: 'system',
        actorName: 'Course archived by ' + session.name,
      },
    });
  }

  return NextResponse.json({ success: true });
}
