import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import { sendMessageNotificationEmail } from '@/lib/email';

const ADMIN_EMAIL = 'hello@greenreserve.app';
const ONE_HOUR_MS = 60 * 60 * 1000;

// GET /api/admin/messages — thread list (no courseId param)
// GET /api/admin/messages?courseId=xxx — full thread for that course
// GET /api/admin/messages?unreadCount=1 — total unread count (for sidebar badge)
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const courseId = searchParams.get('courseId');
  const unreadOnly = searchParams.get('unreadCount') === '1';

  if (unreadOnly) {
    const count = await prisma.message.count({
      where: { senderType: 'operator', readAt: null, isBroadcast: false },
    });
    return NextResponse.json({ count });
  }

  if (courseId) {
    const thread = await prisma.messageThread.findUnique({
      where: { courseId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        course: { select: { name: true, slug: true } },
      },
    });
    if (!thread) return NextResponse.json(null);
    return NextResponse.json(thread);
  }

  // Thread list
  const threads = await prisma.messageThread.findMany({
    include: {
      course: { select: { id: true, name: true, slug: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const threadIds = threads.map(t => t.id);
  const unreadCounts = threadIds.length
    ? await prisma.message.groupBy({
        by: ['threadId'],
        where: { threadId: { in: threadIds }, senderType: 'operator', readAt: null, isBroadcast: false },
        _count: { id: true },
      })
    : [];
  const unreadMap = new Map(unreadCounts.map(u => [u.threadId, u._count.id]));

  const result = threads.map(t => ({
    id: t.id,
    courseId: t.course.id,
    courseName: t.course.name,
    courseSlug: t.course.slug,
    lastMessage: t.messages[0] ?? null,
    unreadCount: unreadMap.get(t.id) ?? 0,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json(result);
}

// POST /api/admin/messages — send message to a course
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId, body } = await req.json();
  if (!courseId || !body?.trim()) return NextResponse.json({ error: 'Missing courseId or body' }, { status: 400 });

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, operator: { select: { email: true, name: true } } },
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // Upsert thread
  const thread = await prisma.messageThread.upsert({
    where: { courseId },
    create: { courseId },
    update: {},
  });

  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      senderType: 'admin',
      senderId: session.adminId,
      senderName: session.name,
      body: body.trim(),
    },
  });

  // Touch thread updatedAt
  await prisma.messageThread.update({ where: { id: thread.id }, data: {} });

  // Mark all operator messages in thread as read (admin is viewing)
  await prisma.message.updateMany({
    where: { threadId: thread.id, senderType: 'operator', readAt: null },
    data: { readAt: new Date() },
  });

  // Email operator if not already notified recently
  const freshThread = await prisma.messageThread.findUnique({ where: { id: thread.id } });
  const shouldEmail = course.operator &&
    (!freshThread?.operatorLastEmailAt || Date.now() - freshThread.operatorLastEmailAt.getTime() > ONE_HOUR_MS);

  if (shouldEmail && course.operator) {
    try {
      await sendMessageNotificationEmail({
        recipientEmail: course.operator.email,
        recipientName: course.operator.name,
        senderName: session.name,
        courseName: course.name,
        messageBody: body.trim(),
        replyUrl: `${process.env.NEXT_PUBLIC_URL}/dashboard/messages`,
      });
      await prisma.messageThread.update({
        where: { id: thread.id },
        data: { operatorLastEmailAt: new Date() },
      });
    } catch (e) {
      console.error('Message notification email failed:', e);
    }
  }

  return NextResponse.json({ message, threadId: thread.id });
}

// PATCH /api/admin/messages — mark operator messages as read
export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const thread = await prisma.messageThread.findUnique({ where: { courseId } });
  if (!thread) return NextResponse.json({ success: true });

  await prisma.message.updateMany({
    where: { threadId: thread.id, senderType: 'operator', readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
