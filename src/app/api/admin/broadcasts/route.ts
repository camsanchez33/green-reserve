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

  const { title, body, sendEmail, test } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  // MP-7b: send-test-to-self. Emails ONLY the signed-in admin, records
  // nothing, reaches no operator — so the email can be read before it goes out.
  if (test === true) {
    try {
      await sendAnnouncementEmail({ operatorName: session.name, operatorEmail: session.email, title: title.trim(), body: body.trim() });
    } catch (e) {
      return NextResponse.json({ error: `The test email did not send: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
    return NextResponse.json({ test: true, sentTo: session.email });
  }

  const announcement = await prisma.announcement.create({
    data: { title: title.trim(), body: body.trim(), sentById: session.adminId },
  });

  const { courses, operators } = await recipients();

  // MP-7b: stored ONCE. This used to copy the announcement into every course's
  // message thread — N rows that reordered the whole admin inbox and replaced
  // every thread preview with "[Announcement]…". Operators now read it from
  // the Announcement row: the dashboard banner until dismissed, and the
  // Announcements list on their Messages page (read state = their dismissal).
  // Copies posted before this change stay in the threads as history.

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
    courses: courses.length,
    emailRequested: !!sendEmail,
    emailRecipients: sendEmail ? operators.length : 0,
    emailsSent,
    emailFailures,
  });
}
