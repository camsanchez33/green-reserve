import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    // Write InquiryStatusEvent on linked inquiry
    const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
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

  // ── Restore ────────────────────────────────────────────────────────
  if (action === 'restore') {
    await prisma.course.update({
      where: { id: courseId },
      data: { archivedAt: null, archivedBy: null },
    });
    return NextResponse.json({ success: true });
  }

  // ── Hard delete (only for already-archived courses) ─────────────────
  if (action === 'hard_delete') {
    if (!course.archivedAt) {
      return NextResponse.json({ error: 'Course must be archived before permanent deletion' }, { status: 400 });
    }
    if (!confirmName || confirmName.trim() !== course.name.trim()) {
      return NextResponse.json({ error: 'Course name does not match' }, { status: 400 });
    }

    // Log event and revert linked inquiry before deleting
    const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
    if (linked) {
      await prisma.inquiryStatusEvent.create({
        data: {
          inquiryId: linked.id,
          fromStatus: linked.status,
          toStatus: 'details_submitted',
          trigger: 'system',
          actorName: 'Course permanently deleted by ' + session.name,
        },
      });
      await prisma.courseInquiry.update({
        where: { id: linked.id },
        data: { builtCourseId: null, status: 'details_submitted' },
      });
    }

    // Delete in FK-safe order (TeeSet was the missing model in the old cascade)
    await prisma.$transaction([
      prisma.booking.deleteMany({ where: { courseId } }),
      prisma.teeTime.deleteMany({ where: { courseId } }),
      prisma.teeSet.deleteMany({ where: { courseId } }),
      prisma.teeTimeSchedule.deleteMany({ where: { courseId } }),
      prisma.blackout.deleteMany({ where: { courseId } }),
      prisma.waitlist.deleteMany({ where: { courseId } }),
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
