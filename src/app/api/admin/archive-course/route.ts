import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, OWNER_ONLY } from '@/lib/admin-session';

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, action, confirmName } = await req.json();
  if (!courseId || !action) return NextResponse.json({ error: 'Missing courseId or action' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, operatorId: true, archivedAt: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // ── Archive (soft delete) ──────────────────────────────────────────
  if (action === 'archive') {
    const now = new Date();
    await prisma.course.update({
      where: { id: courseId },
      data: { archivedAt: now, archivedBy: session.name, active: false, liveStatus: 'draft' },
    });
    // Move linked inquiry to 'archived' if it's in the working pipeline
    const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
    if (linked) {
      const pipelineStatuses = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'live'];
      if (pipelineStatuses.includes(linked.status)) {
        await prisma.inquiryStatusEvent.create({
          data: {
            inquiryId: linked.id,
            fromStatus: linked.status,
            toStatus: 'archived',
            trigger: 'system',
            actorName: 'Course archived by ' + session.name,
          },
        });
        await prisma.courseInquiry.update({ where: { id: linked.id }, data: { status: 'archived' } });
      }
    }
    return NextResponse.json({ success: true });
  }

  // ── Restore ────────────────────────────────────────────────────────
  if (action === 'restore') {
    await prisma.course.update({
      where: { id: courseId },
      data: { archivedAt: null, archivedBy: null },
    });
    // Move linked inquiry back to 'live' if it was archived due to course archival
    const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
    if (linked && linked.status === 'archived') {
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linked.id,
          fromStatus: 'archived',
          toStatus: 'live',
          trigger: 'system',
          actorName: 'Course restored by ' + session.name,
        },
      });
      await prisma.courseInquiry.update({ where: { id: linked.id }, data: { status: 'live' } });
    }
    return NextResponse.json({ success: true });
  }

  // ── Hard delete (only for already-archived courses) ─────────────────
  if (action === 'hard_delete') {
    if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 });
    if (!course.archivedAt) {
      return NextResponse.json({ error: 'Course must be archived before permanent deletion' }, { status: 400 });
    }
    if (!confirmName || confirmName.trim() !== course.name.trim()) {
      return NextResponse.json({ error: 'Course name does not match' }, { status: 400 });
    }

    // Block hard delete if course has any payment history
    const [bookingCount, paidMemberCount] = await Promise.all([
      prisma.booking.count({ where: { courseId } }),
      prisma.courseMembership.count({ where: { courseId, paymentStatus: { in: ['paid', 'paid_offline'] } } }),
    ]);
    if (bookingCount > 0 || paidMemberCount > 0) {
      return NextResponse.json({
        error: 'This course has payment history and can only be archived, not permanently deleted.',
        hasHistory: true,
      }, { status: 400 });
    }

    // Move linked inquiry to 'archived' (not back to pipeline)
    const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
    if (linked) {
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linked.id,
          fromStatus: linked.status,
          toStatus: 'archived',
          trigger: 'system',
          actorName: 'Course permanently deleted by ' + session.name,
        },
      });
      await prisma.courseInquiry.update({
        where: { id: linked.id },
        data: { builtCourseId: null, status: 'archived' },
      });
    }

    // Delete in FK-safe order
    await prisma.$transaction([
      prisma.booking.deleteMany({ where: { courseId } }),
      prisma.teeTime.deleteMany({ where: { courseId } }),
      prisma.teeSet.deleteMany({ where: { courseId } }),
      prisma.teeTimeSchedule.deleteMany({ where: { courseId } }),
      prisma.blackout.deleteMany({ where: { courseId } }),
      prisma.teeTimeAlert.deleteMany({ where: { courseId } }),
      prisma.courseMembership.deleteMany({ where: { courseId } }),
      prisma.membershipTier.deleteMany({ where: { courseId } }),
      prisma.courseStaff.deleteMany({ where: { courseId } }),
      prisma.course.delete({ where: { id: courseId } }),
      ...(course.operatorId ? [prisma.courseOperator.delete({ where: { id: course.operatorId } })] : []),
    ]);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
