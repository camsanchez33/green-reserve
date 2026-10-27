import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { encodeRequestReReview } from '@/lib/change-requests';
import { withAudit } from '@/lib/admin-audit';
import { recordCoursePageDecision } from '@/lib/approval-state';

// Admin-initiated reopen of the review loop (RUN_QUEUE "approval propagates
// + gates previews", item 2b) — for when admin made edits after approval
// and wants the course to look again, without waiting on the course to
// request changes themselves. Reuses the same InquiryStatusEvent ledger;
// latestPageDecision/isSendPreviewGated (change-requests.ts) already treat
// this marker as reopening the gate.
async function requestReReview(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  if (!inquiry) {
    // Built without an inquiry: the decision lives on the course (lib/approval-state).
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    await recordCoursePageDecision(courseId, null);
    return NextResponse.json({ ok: true });
  }

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: inquiry.id,
      fromStatus: inquiry.status,
      toStatus: inquiry.status,
      trigger: 'admin',
      actorName: encodeRequestReReview(),
    },
  });

  return NextResponse.json({ ok: true });
}

// BRAIN-1a: recorded on the course.
export const POST = withAudit(requestReReview, body => ({ action: 'request_re_review', targetType: 'course', targetId: String(body.courseId ?? ''), courseId: String(body.courseId ?? '') || null }));
