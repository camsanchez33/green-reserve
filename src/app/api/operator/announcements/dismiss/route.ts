import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { announcementsSince } from '@/lib/announcement-audience';

// Pressing X (or opening one on Messages) marks it seen — and every older
// announcement this course could see, so nothing queued behind it pops up next
// (Cam 2026-10-05: "should stay gone after seen").
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.operatorId) return NextResponse.json({ error: 'Staff cannot dismiss announcements' }, { status: 403 });

  const { announcementId } = await req.json().catch(() => ({}));
  if (typeof announcementId !== 'string' || !announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });
  const target = await prisma.announcement.findUnique({ where: { id: announcementId }, select: { createdAt: true } });
  if (!target) return NextResponse.json({ error: 'That announcement no longer exists.' }, { status: 404 });

  const since = await announcementsSince(session.courseId);
  const older = await prisma.announcement.findMany({
    where: { createdAt: { lte: target.createdAt, ...(since ? { gte: since } : {}) } },
    select: { id: true },
  });
  const ids = [...new Set([announcementId, ...older.map(a => a.id)])];
  await prisma.announcementDismissal.createMany({
    data: ids.map(id => ({ announcementId: id, operatorId: session.operatorId! })),
    skipDuplicates: true,
  });
  return NextResponse.json({ success: true, dismissed: ids.length });
}
