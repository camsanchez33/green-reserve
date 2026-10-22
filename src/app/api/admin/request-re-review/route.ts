import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { encodeRequestReReview } from '@/lib/change-requests';
import { withAudit } from '@/lib/admin-audit';

// Admin-initiated reopen of the review loop (RUN_QUEUE "approval propagates
// + gates previews", item 2b) — for when admin made edits after approval
// and wants the course to look again, without waiting on the course to
// request changes themselves. Reuses the same InquiryStatusEvent ledger;
// latestPageDecision/isSendPreviewGated (change-requests.ts) already treat
// this marker as reopening the gate.
async function requestReReview(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  if (!inquiry) return NextResponse.json({ error: 'No linked inquiry for this course' }, { status: 409 });

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
