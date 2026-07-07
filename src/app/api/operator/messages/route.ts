import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { sendMessageNotificationEmail } from '@/lib/email';

const ADMIN_EMAIL = 'hello@greenreserve.app';
const ONE_HOUR_MS = 60 * 60 * 1000;

// GET /api/operator/messages — own thread with all messages
// GET /api/operator/messages?unreadCount=1 — unread count for sidebar badge
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  if (searchParams.get('unreadCount') === '1') {
    const thread = await prisma.messageThread.findUnique({ where: { courseId: session.courseId } });
    if (!thread) return NextResponse.json({ count: 0 });
    const count = await prisma.message.count({
      where: { threadId: thread.id, senderType: 'admin', readAt: null },
    });
    return NextResponse.json({ count });
  }

  const thread = await prisma.messageThread.findUnique({
    where: { courseId: session.courseId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json(thread ?? null);
}

// POST /api/operator/messages — send a message
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: 'Missing body' }, { status: 400 });

  // Resolve sender name
  let senderName = session.email;
  if (!session.isStaff && session.operatorId) {
    const op = await prisma.courseOperator.findUnique({ where: { id: session.operatorId }, select: { name: true } });
    if (op?.name) senderName = op.name;
  } else if (session.isStaff && session.staffId) {
    const staff = await prisma.courseStaff.findUnique({ where: { id: session.staffId }, select: { name: true } });
    if (staff?.name) senderName = staff.name;
  }

  const course = await prisma.course.findUnique({
    where: { id: session.courseId },
    select: { name: true },
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // Upsert thread
  const thread = await prisma.messageThread.upsert({
    where: { courseId: session.courseId },
    create: { courseId: session.courseId },
    update: {},
  });

  const senderId = session.operatorId || session.staffId || session.email;
  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      senderType: 'operator',
      senderId,
      senderName,
      body: body.trim(),
    },
  });

  // Touch thread updatedAt
  await prisma.messageThread.update({ where: { id: thread.id }, data: {} });

  // Email admin if not already notified recently
  const freshThread = await prisma.messageThread.findUnique({ where: { id: thread.id } });
  const shouldEmail = !freshThread?.adminLastEmailAt || Date.now() - freshThread.adminLastEmailAt.getTime() > ONE_HOUR_MS;

  if (shouldEmail) {
    try {
      await sendMessageNotificationEmail({
        recipientEmail: ADMIN_EMAIL,
        recipientName: 'GreenReserve Team',
        senderName,
        courseName: course.name,
        messageBody: body.trim(),
        replyUrl: `${process.env.NEXT_PUBLIC_URL}/admin/messages?courseId=${session.courseId}`,
      });
      await prisma.messageThread.update({
        where: { id: thread.id },
        data: { adminLastEmailAt: new Date() },
      });
    } catch (e) {
      console.error('Message notification email failed:', e);
    }
  }

  return NextResponse.json({ message });
}

// PATCH /api/operator/messages — mark admin messages in own thread as read
export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // req body not needed — always marks own thread
  void req;

  const thread = await prisma.messageThread.findUnique({ where: { courseId: session.courseId } });
  if (!thread) return NextResponse.json({ success: true });

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderType: 'admin', readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
