import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { sendCourseLiveOrientationEmail } from '@/lib/email';
import { getApprovalState } from '@/lib/approval-state';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [course, recentBookings, totalBookings, revenue, staff, lastBookingAgg, priorBookingsCount, approval] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, include: { operator: { select: { id: true, name: true, email: true, emailVerified: true, onboardingStep: true, phone: true } }, schedules: true } }),
    prisma.booking.findMany({ where: { courseId, status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, select: { id: true, golferName: true, golferEmail: true, players: true, totalAmount: true, createdAt: true, teeTime: { select: { date: true, time: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.booking.count({ where: { courseId, status: 'confirmed' } }),
    prisma.booking.aggregate({ where: { courseId, status: 'confirmed', createdAt: { gte: thirtyDaysAgo } }, _sum: { greenFeeTotal: true, accessFeeTotal: true, totalAmount: true }, _count: { id: true } }),
    prisma.courseStaff.findMany({ where: { courseId }, select: { id: true, name: true, email: true, role: true, active: true } }),
    prisma.booking.aggregate({ where: { courseId }, _max: { createdAt: true } }),
    prisma.booking.count({ where: { courseId, status: 'confirmed', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    getApprovalState(courseId),
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
    bookings30d: revenue._count.id,
    lastBookingAt: lastBookingAgg._max.createdAt?.toISOString() ?? null,
    bookingsPrior30d: priorBookingsCount,
    // Approval is course-level truth, not inquiry trivia (RUN_QUEUE
    // "approval propagates + gates previews", item 1).
    approval: { status: approval.status, approvedAt: approval.approvedAt?.toISOString() ?? null },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { courseId, active, featured } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (active !== undefined) {
    data.active = active;
    data.liveStatus = active ? 'live' : 'draft';
  }
  if (featured !== undefined) data.featured = featured;
  const updated = await prisma.course.update({ where: { id: courseId }, data, include: { operator: { select: { name: true, email: true } } } });

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
    // Send welcome email once only — guard via welcomeEmailSentAt
    if (!updated.welcomeEmailSentAt && updated.operator) {
      try {
        await sendCourseLiveOrientationEmail({
          operatorName: updated.operator.name,
          operatorEmail: updated.operator.email,
          courseName: updated.name,
          courseSlug: updated.slug,
        });
        await prisma.course.update({ where: { id: courseId }, data: { welcomeEmailSentAt: new Date() } });
      } catch (e) {
        console.error('Go-live orientation email (course-detail activate) failed:', e);
      }
    }
  }

  return NextResponse.json(updated);
}
