import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// GET                — the newest announcement this operator has not dismissed (the banner)
// GET ?all=1         — MP-7b: every announcement, newest first, with read = dismissed
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only operators (not staff) have dismissals tracked
  if (!session.operatorId) return NextResponse.json(req.nextUrl.searchParams.get('all') === '1' ? [] : null);

  if (req.nextUrl.searchParams.get('all') === '1') {
    const all = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, body: true, createdAt: true, dismissals: { where: { operatorId: session.operatorId }, select: { id: true } } },
    });
    return NextResponse.json(all.map(({ dismissals, ...a }) => ({ ...a, read: dismissals.length > 0 })));
  }

  const announcement = await prisma.announcement.findFirst({
    orderBy: { createdAt: 'desc' },
    where: { dismissals: { none: { operatorId: session.operatorId } } },
    select: { id: true, title: true, body: true, createdAt: true },
  });

  return NextResponse.json(announcement ?? null);
}
