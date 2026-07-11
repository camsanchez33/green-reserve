import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { sendCourseApprovedNotification } from '@/lib/email';

// Approval is advisory, not automatic — going live stays an admin action.
export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { id: true, name: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: course.id } });
  if (inquiry) {
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: inquiry.id,
        fromStatus: inquiry.status,
        toStatus: inquiry.status,
        trigger: 'course',
        actorName: 'Course approved their page',
      },
    });
  }

  try {
    await sendCourseApprovedNotification({ courseName: course.name, contactName: inquiry?.contactName || course.name });
  } catch (err) {
    console.error('Course-approved notification email failed:', err);
  }

  return NextResponse.json({ ok: true });
}
