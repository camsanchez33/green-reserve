import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { announcementsSince } from '@/lib/announcement-audience';
import { agreementStatus } from '@/lib/agreement-gate';

// GET          — the banner: the NEWEST announcement for this course, unless
//                this operator already dismissed it. Never an older one — that
//                was why the banner "kept popping up": each X revealed the next
//                oldest unseen announcement (Cam 2026-10-05).
// GET ?all=1   — MP-7b: the Messages list, newest first, read = dismissed.
// Both follow lib/announcement-audience: live courses only, and only
// announcements sent after the course went live.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const wantAll = req.nextUrl.searchParams.get('all') === '1';

  // Only operators (not staff) have dismissals tracked.
  if (!session.operatorId) return NextResponse.json(wantAll ? [] : null);
  const since = await announcementsSince(session.courseId);
  if (!since) return NextResponse.json(wantAll ? [] : null);

  if (wantAll) {
    const all = await prisma.announcement.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, body: true, createdAt: true, dismissals: { where: { operatorId: session.operatorId }, select: { id: true } } },
    });
    return NextResponse.json(all.map(({ dismissals, ...a }) => ({ ...a, read: dismissals.length > 0 })));
  }

  const newest = await prisma.announcement.findFirst({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, body: true, createdAt: true, dismissals: { where: { operatorId: session.operatorId }, select: { id: true } } },
  });
  if (!newest || newest.dismissals.length > 0) return NextResponse.json(null);
  // Cam 2026-10-19: an announcement about the agreement stayed up after the
  // course signed it. Once nothing is left to sign it has done its job.
  // Keyed on the title only, so a mention of the agreement in an unrelated
  // announcement's body never hides it (review 2026-10-19).
  if (/agreement/i.test(newest.title)) {
    const st = await agreementStatus(session.courseId);
    if (st.total > 0 && st.documents.every(d => !d.needsSigning)) return NextResponse.json(null);
  }
  const { dismissals: _seen, ...announcement } = newest;
  return NextResponse.json(announcement);
}
