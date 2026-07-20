import { prisma } from '@/lib/prisma';
import { sendMessageNotificationEmail } from '@/lib/email';
import { CATEGORY_LABEL, encodeChangesRequested, type ChangeItem } from '@/lib/change-requests';

const ADMIN_EMAIL = 'hello@greenreserve.app';
const ONE_HOUR_MS = 60 * 60 * 1000;

export function cleanChangeItems(items: unknown): ChangeItem[] {
  return Array.isArray(items)
    ? items
        .filter((it: unknown): it is ChangeItem => !!it && typeof (it as ChangeItem).category === 'string')
        .map((it: ChangeItem) => ({ category: it.category, detail: String(it.detail || '').trim() }))
    : [];
}

// Shared by both request-changes entry points (token-gated preview page AND
// the logged-in operator dashboard) so they can never drift: same message
// mirror format, same structured event encoding, same fire-and-forget email.
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

  const thread = await prisma.messageThread.upsert({
    where: { courseId },
    create: { courseId },
    update: {},
  });

  await prisma.message.create({
    data: {
      threadId: thread.id,
      senderType: 'operator',
      senderId: course.operatorId || courseId,
      senderName,
      body: message.trim(),
    },
  });

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

  const freshThread = await prisma.messageThread.findUnique({ where: { id: thread.id } });
  const shouldEmail = !freshThread?.adminLastEmailAt || Date.now() - freshThread.adminLastEmailAt.getTime() > ONE_HOUR_MS;
  if (shouldEmail) {
    // Fire-and-forget (A6 item 2 pattern) — message + activity event are
    // already durably recorded above; don't block the response on Resend.
    sendMessageNotificationEmail({
      recipientEmail: ADMIN_EMAIL,
      recipientName: 'GreenReserve Team',
      senderName,
      courseName: course.name,
      messageBody: message.trim(),
      replyUrl: `${process.env.NEXT_PUBLIC_URL}/admin/messages?courseId=${courseId}`,
    })
      .then(() => prisma.messageThread.update({ where: { id: thread.id }, data: { adminLastEmailAt: new Date() } }))
      .catch(e => console.error('Message notification email failed:', e));
  }

  return { ok: true as const };
}
