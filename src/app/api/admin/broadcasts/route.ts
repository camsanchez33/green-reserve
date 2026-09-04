import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, OWNER_ONLY, SUPPORT_PLUS, ownerGateError } from '@/lib/admin-session';
import { sendAnnouncementEmail } from '@/lib/email';

// MP-7a: ONE recipient filter. Thread-insert, email and the preview count
// each used a different one (active courses; operators with SOME active
// course; the client counting active rows from /api/admin/courses — which
// included archived ones). An announcement goes to every course that is live
// and not archived, and to the operator of each. Same list, three uses.
async function recipients() {
  const courses = await prisma.course.findMany({
    where: { active: true, archivedAt: null },
    select: { id: true, name: true, operator: { select: { id: true, email: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  // One operator can run several courses — email them once.
  const operators = new Map<string, { email: string; name: string }>();
  for (const c of courses) if (c.operator) operators.set(c.operator.id, { email: c.operator.email, name: c.operator.name });
  return { courses, operators: [...operators.values()] };
}

// GET /api/admin/broadcasts            — history
// GET /api/admin/broadcasts?recipients=1 — who a send would reach, from the same filter the send uses
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2b: POST was tightened by MP-2 and GET was not — announcement bodies
  // and senders were readable by any session.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (req.nextUrl.searchParams.get('recipients') === '1') {
    const r = await recipients();
    return NextResponse.json({ courses: r.courses.length, operators: r.operators.length });
  }

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { dismissals: true } } },
  });

  // Look up sender names in one query
  const adminIds = [...new Set(announcements.map(a => a.sentById))];
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
    : [];
  const adminMap = new Map(admins.map(a => [a.id, a.name]));

  const result = announcements.map(a => ({
    id: a.id,
    title: a.title,
    body: a.body,
    emailSent: a.emailSent,
    sentByName: adminMap.get(a.sentById) ?? 'Admin',
    createdAt: a.createdAt,
    dismissalCount: a._count.dismissals,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2 fix-now #8: a raw role check skips requireOwner()'s mfa assertion,
  // so a password-only owner session could send mass email. Mass email and
  // admin-account creation were the only two owner powers still bypassing the
  // invariant b07c6d0 built for exactly this.
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });

  const { title, body, sendEmail } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: { title: title.trim(), body: body.trim(), sentById: session.adminId },
  });

  const { courses, operators } = await recipients();

  // Insert the announcement into every recipient course's thread. (7b stores
  // it once with per-course read state; until then this is N copies.)
  let threadInserts = 0;
  const threadFailures: string[] = [];
  for (const course of courses) {
    try {
      const thread = await prisma.messageThread.upsert({
        where: { courseId: course.id },
        create: { courseId: course.id },
        update: {},
      });
      await prisma.message.create({
        data: {
          threadId: thread.id,
          senderType: 'admin',
          senderId: session.adminId,
          senderName: session.name,
          body: `[Announcement] ${title.trim()}\n\n${body.trim()}`,
          isBroadcast: true,
        },
      });
      threadInserts++;
    } catch (e) {
      console.error('Broadcast message insert failed for course', course.id, e);
      threadFailures.push(course.name);
    }
  }

  // MP-7a: delivery truth. The sends used to fire AFTER the response returned
  // (a serverless function can be frozen mid-flight) and "N emails delivered"
  // was the recipient count, not a result. Now every send is awaited, counted
  // by outcome, and the failures are named — and emailSent on the record is
  // only true when at least one email actually went.
  let emailsSent = 0;
  const emailFailures: string[] = [];
  if (sendEmail) {
    const results = await Promise.allSettled(
      operators.map(op => sendAnnouncementEmail({ operatorName: op.name, operatorEmail: op.email, title: title.trim(), body: body.trim() })),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') emailsSent++;
      else {
        console.error('Announcement email failed for', operators[i].email, r.reason);
        emailFailures.push(operators[i].email);
      }
    });
    if (emailsSent > 0) {
      await prisma.announcement.update({ where: { id: announcement.id }, data: { emailSent: true } });
    }
  }

  return NextResponse.json({
    id: announcement.id,
    threadInserts,
    threadFailures,
    emailRequested: !!sendEmail,
    emailRecipients: sendEmail ? operators.length : 0,
    emailsSent,
    emailFailures,
  });
}
