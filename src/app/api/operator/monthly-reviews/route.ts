import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { monthLabel, type ReviewBody, type AreaRow } from '@/lib/monthly-review';

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
    select: { month: true, isBaseline: true, status: true, body: true, metrics: true, createdAt: true },
  });
  const money = can(session, 'money.payments');
  const reviews = rows.flatMap(r => {
    if (!r.body) return [];
    try {
      // Analytics page (Cam 2026-11-17): "By area" (this month against the one before, money from the ledger),
      // stored with reports from 2026-11-17 on; null on older ones. The PDF is /api/operator/monthly-reviews/<month>/pdf.
      // Its money rows (Revenue, Pro shop sales) only with money.payments; blank otherwise. The written words are the
      // review's own and are shown as they are (a report has always gone to analytics.view).
      const stored = (r.metrics as { byArea?: AreaRow[] } | null)?.byArea ?? null;
      const byArea = stored && !money ? stored.map(a => (a.unit === 'cents' ? { ...a, thisMonth: null, lastMonth: null } : a)) : stored;
      return [{ month: r.month, label: monthLabel(r.month), isBaseline: r.isBaseline, thin: r.status === 'thin', writtenAt: r.createdAt.toISOString(), review: JSON.parse(r.body) as ReviewBody, byArea, pdfUrl: `/api/operator/monthly-reviews/${r.month}/pdf` }];
    } catch { return []; }
  });
  return NextResponse.json({ reviews }, { headers: { 'Cache-Control': 'no-store' } });
}
