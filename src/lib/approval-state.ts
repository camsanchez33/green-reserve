import { prisma } from '@/lib/prisma';
import { latestPageDecision, isSendPreviewGated, APPROVED_MARKER } from '@/lib/change-requests';

export interface ApprovalState {
  status: 'none' | 'approved' | 'changes_requested';
  // Most recent approval EVER, regardless of round — "approval is
  // course-level truth, not inquiry trivia" (RUN_QUEUE item 4.1). Used for
  // historical display on the courses tab/list.
  approvedAt: Date | null;
  // True while "Send Preview" should be replaced by "Approved ✓ {date}" —
  // scoped to the current round via change-requests.ts's single anchor.
  sendPreviewGated: boolean;
  inquiryId: string | null;
}

// DB-backed counterpart to the pure functions in change-requests.ts — for
// callers that only have a courseId (courses list/detail, external routes).
// Callers that already have an inquiry's events loaded (the inquiry detail
// page) should call the pure functions directly instead of round-tripping
// through this — same brain either way, just avoiding a redundant query.
export async function getApprovalState(courseId: string): Promise<ApprovalState> {
  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true } });
  if (!inquiry) {
    // Built with Admin → Create course: the decision lives on the course (Cam 2026-10-27).
    const c = await prisma.course.findUnique({ where: { id: courseId }, select: { pageDecision: true, pageDecidedAt: true } });
    const status = coursePageDecision(c?.pageDecision);
    return { status, approvedAt: status === 'approved' ? c?.pageDecidedAt ?? null : null, sendPreviewGated: status === 'approved', inquiryId: null };
  }

  const events = await prisma.inquiryStatusEvent.findMany({
    where: { inquiryId: inquiry.id },
    select: { actorName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const status = latestPageDecision(events) ?? 'none';
  const mostRecentApproval = [...events].reverse().find(e => e.actorName === APPROVED_MARKER);

  return {
    status,
    approvedAt: mostRecentApproval ? new Date(mostRecentApproval.createdAt) : null,
    sendPreviewGated: isSendPreviewGated(events),
    inquiryId: inquiry.id,
  };
}

/** A course column value as a decision; anything else is 'none'. */
export function coursePageDecision(v: string | null | undefined): ApprovalState['status'] {
  return v === 'approved' || v === 'changes_requested' ? v : 'none';
}

/**
 * Records the owner's decision for a course with NO inquiry (Cam 2026-10-27:
 * "do the column and fix it" — approval used to fail with "no linked inquiry"
 * for courses built with Admin → Create course). Null reopens the review.
 * Pipeline courses keep recording it as an inquiry event; never call this for one.
 */
export async function recordCoursePageDecision(courseId: string, decision: 'approved' | 'changes_requested' | null) {
  await prisma.course.update({ where: { id: courseId }, data: { pageDecision: decision, pageDecidedAt: decision ? new Date() : null } });
}
