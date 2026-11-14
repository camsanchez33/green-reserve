import { recordCoursePageDecision } from '@/lib/approval-state';
import { prisma } from '@/lib/prisma';
import { startCourseChat } from '@/lib/support-chats';
import { CATEGORY_LABEL, CHANGE_CATEGORIES, encodeChangesRequested, type ChangeItem } from '@/lib/change-requests';

const VALID_CATEGORIES = new Set<string>(CHANGE_CATEGORIES.map(c => c.key));
const MAX_ITEMS = 6;
const MAX_DETAIL = 2000;

export function cleanChangeItems(items: unknown): ChangeItem[] {
  // SD-8 review: `category` used to be accepted as arbitrary free text and
  // `detail` had no server-side length at all — the client's maxLength was the
  // only cap, and both strings end up on the admin activity ledger.
  return Array.isArray(items)
    ? items
        .filter((it: unknown): it is ChangeItem => !!it && VALID_CATEGORIES.has((it as ChangeItem)?.category))
        .map((it: ChangeItem) => ({ category: it.category, detail: String(it.detail || '').trim().slice(0, MAX_DETAIL) }))
        .slice(0, MAX_ITEMS)
    : [];
}

// Shared by both request-changes entry points (token-gated preview page AND
// the logged-in operator dashboard) so they can never drift: same message
// format, same structured event encoding, same chat in Support and email.
export async function submitChangeRequest(courseId: string, cleanItems: ChangeItem[]) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, operatorId: true } });
  if (!course) return { error: 'Course not found', status: 404 as const };

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  const senderName = inquiry?.contactName || course.name;

  const categoryLabels = cleanItems.map(it => CATEGORY_LABEL[it.category] || it.category).join(', ');
  const message = [
    `Requested changes: ${categoryLabels}`,
    ...cleanItems.filter(it => it.detail).map(it => `${CATEGORY_LABEL[it.category] || it.category}: ${it.detail}`),
  ].join('\n');

  // SUPPORT: the request is its own chat in Support (subject "Requested changes: …"), never a message in the
  // course's earlier-messages chat. startCourseChat reopens the thread and emails GreenReserve (awaited, at most
  // once an hour per course, linking to that chat; it never throws).
  const chat = await startCourseChat(courseId, { id: course.operatorId || courseId, name: senderName }, message.trim());
  if (!chat) return { error: 'Course not found', status: 404 as const };

  // Built without an inquiry: the decision lives on the course (lib/approval-state).
  if (!inquiry) await recordCoursePageDecision(courseId, 'changes_requested');
  if (inquiry) {
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: inquiry.id,
        fromStatus: inquiry.status,
        toStatus: inquiry.status,
        trigger: 'course',
        actorName: encodeChangesRequested(cleanItems),
      },
    });
  }

  return { ok: true as const };
}
