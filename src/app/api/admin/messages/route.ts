import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { sendMessageNotificationEmail } from '@/lib/email';
import { threadSignal } from '@/lib/thread-signal';

const ONE_HOUR_MS = 60 * 60 * 1000;

// GET /api/admin/messages — thread list (no courseId param)
// GET /api/admin/messages?courseId=xxx — full thread for that course
// GET /api/admin/messages?unreadCount=1 — total unread count (for sidebar badge)
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2: admin<->course threads carry operator contact detail and business
  // discussion. Support-plus, not any session.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
        course: { select: { name: true, slug: true, active: true, archivedAt: true } },
      },
    });
    if (!thread) {
      // No thread yet — the page still needs to know whether it may start one.
      const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, slug: true, active: true, archivedAt: true } });
      if (!course) return NextResponse.json(null);
      return NextResponse.json({ id: null, courseId, messages: [], course, inquiryId: null });
    }
    // Lets the message list link change-request mirrors back to the inquiry
    // where the structured, addressable version of the ask actually lives.
    const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true } });
    return NextResponse.json({ ...thread, inquiryId: inquiry?.id ?? null });
  }

  // Thread list. MP-7a: the last few messages come along so the signal can
  // skip announcements — an admin broadcast on top of an operator's question
  // must not read as "answered".
  const threads = await prisma.messageThread.findMany({
    include: {
      course: { select: { id: true, name: true, slug: true, active: true, archivedAt: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 6,
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

  const now = new Date();
  const result = threads.map(t => ({
    id: t.id,
    courseId: t.course.id,
    courseName: t.course.name,
    courseSlug: t.course.slug,
    courseActive: t.course.active,
    courseArchived: !!t.course.archivedAt,
    lastMessage: t.messages[0] ?? null,
    unreadCount: unreadMap.get(t.id) ?? 0,
    updatedAt: t.updatedAt,
    signal: threadSignal(t.messages, now),
  }));

  return NextResponse.json(result);
}

// POST /api/admin/messages — send message to a course
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, body } = await req.json();
  if (!courseId || !body?.trim()) return NextResponse.json({ error: 'Missing courseId or body' }, { status: 400 });

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, archivedAt: true, operator: { select: { email: true, name: true } } },
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  // MP-7a: an archived course's thread stayed listed and messageable, so you
  // could email an operator who has left the platform. The UI locks the
  // composer; this is the rule behind it.
  if (course.archivedAt) {
    return NextResponse.json({ error: 'This course is archived — its operator has left the platform. Restore the course before messaging them.' }, { status: 409 });
  }

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
    sendMessageNotificationEmail({
      recipientEmail: course.operator.email,
      recipientName: course.operator.name,
      senderName: session.name,
      courseName: course.name,
      messageBody: body.trim(),
      replyUrl: `${process.env.NEXT_PUBLIC_URL}/dashboard/messages`,
    }).then(() => prisma.messageThread.update({ where: { id: thread.id }, data: { operatorLastEmailAt: new Date() } }))
      .catch(e => console.error('Message notification email failed:', e));
  }

  return NextResponse.json({ message, threadId: thread.id });
}

// PATCH /api/admin/messages — mark operator messages as read
export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
