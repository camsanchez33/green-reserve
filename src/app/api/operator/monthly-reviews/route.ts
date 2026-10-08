import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { monthLabel, type ReviewBody } from '@/lib/monthly-review';

// BI-1: the course's monthly AI reviews, newest first, for Analytics →
// Monthly reviews. Same gate as the Analytics tab (owner / analytics.view):
// a review talks about revenue. Failed drafts are never returned — a failed
// review is the system's problem (Admin → System), not the owner's.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; }

  const rows = await prisma.monthlyReview.findMany({
    where: { courseId: session.courseId, status: { in: ['written', 'thin'] } },
    orderBy: { month: 'desc' },
    take: 24,
    select: { month: true, isBaseline: true, status: true, body: true, createdAt: true },
  });
  const reviews = rows.flatMap(r => {
    if (!r.body) return [];
    try {
      return [{ month: r.month, label: monthLabel(r.month), isBaseline: r.isBaseline, thin: r.status === 'thin', writtenAt: r.createdAt.toISOString(), review: JSON.parse(r.body) as ReviewBody }];
    } catch { return []; }
  });
  return NextResponse.json({ reviews }, { headers: { 'Cache-Control': 'no-store' } });
}
