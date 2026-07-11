import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPreviewToken } from '@/lib/preview-token';
import { sendMessageNotificationEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const ADMIN_EMAIL = 'hello@greenreserve.app';
const ONE_HOUR_MS = 60 * 60 * 1000;

// Feeds into the EXISTING admin<->course messages thread (creates one if
// none) rather than a separate inbox — same thread the dashboard uses.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const { message } = await req.json().catch(() => ({ message: '' }));

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  const courseAllowed = await rateLimit(`preview-changes:${courseId}`, 10, 3600);
  const ipAllowed = await rateLimit(`preview-changes-ip:${clientIp(req)}`, 30, 3600);
  if (!courseAllowed || !ipAllowed) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, operatorId: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  const senderName = inquiry?.contactName || course.name;

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
        actorName: 'Course requested changes to their page',
      },
    });
  }

  const freshThread = await prisma.messageThread.findUnique({ where: { id: thread.id } });
  const shouldEmail = !freshThread?.adminLastEmailAt || Date.now() - freshThread.adminLastEmailAt.getTime() > ONE_HOUR_MS;
  if (shouldEmail) {
    try {
      await sendMessageNotificationEmail({
        recipientEmail: ADMIN_EMAIL,
        recipientName: 'GreenReserve Team',
        senderName,
        courseName: course.name,
        messageBody: message.trim(),
        replyUrl: `${process.env.NEXT_PUBLIC_URL}/admin/messages?courseId=${courseId}`,
      });
      await prisma.messageThread.update({ where: { id: thread.id }, data: { adminLastEmailAt: new Date() } });
    } catch (e) {
      console.error('Message notification email failed:', e);
    }
  }

  return NextResponse.json({ ok: true });
}
