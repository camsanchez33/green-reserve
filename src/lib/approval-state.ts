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
  if (!inquiry) return { status: 'none', approvedAt: null, sendPreviewGated: false, inquiryId: null };

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
