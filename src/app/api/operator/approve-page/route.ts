import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { sendCourseApprovedNotification } from '@/lib/email';
import { latestPageDecision } from '@/lib/change-requests';

// Approval is advisory, not automatic — going live stays an admin action.
export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { id: session.courseId },
    select: { id: true, name: true, active: true, liveStatus: true },
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // Going live SUPERSEDES the pre-live review loop entirely — there's
  // nothing to approve anymore. Friendly no-op, not an error, and never
  // writes an event (an already-live course has nothing to record here).
  if (course.active && course.liveStatus === 'live') {
    return NextResponse.json({ ok: true, alreadyLive: true, message: 'You’re already live — nothing to approve.' });
  }

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: course.id } });
  // No-silent-failures: approval status is DERIVED entirely from this event
  // (GET /api/operator/courses reads it back to survive reload). A course
  // with no linked inquiry (e.g. built via the manual in-person wizard, not
  // the pipeline) has nowhere durable to record this — say so instead of
  // returning { ok: true } while quietly doing nothing, which used to make
  // the checklist step flip to done and then silently revert on reload.
  if (!inquiry) {
    return NextResponse.json({ error: 'This course has no linked inquiry — approval can’t be recorded. Contact GreenReserve support.' }, { status: 409 });
  }

  // Idempotent: a second (or sixth) click while already approved must not
  // stack duplicate events or re-send the admin email — just confirm.
  const existingEvents = await prisma.inquiryStatusEvent.findMany({
    where: { inquiryId: inquiry.id },
    select: { actorName: true, createdAt: true },
  });
  if (latestPageDecision(existingEvents) === 'approved') {
    return NextResponse.json({ ok: true });
  }

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: inquiry.id,
      fromStatus: inquiry.status,
      toStatus: inquiry.status,
      trigger: 'course',
      actorName: 'Course approved their page',
    },
  });

  // Fire-and-forget (A6 item 2 pattern) — an awaited email send in the
  // request path is what made "Send Sheet"/"Reset pwd" freeze for 30s-2min;
  // never repeat that here. The approval is already durably recorded above.
  sendCourseApprovedNotification({ courseName: course.name, contactName: inquiry.contactName || course.name })
    .catch(err => console.error('Course-approved notification email failed:', err));

  return NextResponse.json({ ok: true });
}
