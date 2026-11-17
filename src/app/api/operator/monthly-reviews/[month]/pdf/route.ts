import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { monthLabel, previousMonth, type ReviewBody, type AreaRow } from '@/lib/monthly-review';
import { renderMonthlyReportPdf } from '@/lib/monthly-report-pdf';

// Analytics → Reviews (Cam 2026-11-17): one monthly written report as a PDF download. Same gate as the
// list (analytics.view: a report talks about revenue); the session's course only; a failed draft is never served.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; }
  const { month } = await params;
  if (!MONTH.test(month)) return NextResponse.json({ error: 'Pick a month.' }, { status: 400 });

  const row = await prisma.monthlyReview.findFirst({
    where: { courseId: session.courseId, month, status: { in: ['written', 'thin'] } },
    select: { body: true, metrics: true, course: { select: { name: true, slug: true } } },
  });
  if (!row?.body) return NextResponse.json({ error: 'No report for that month.' }, { status: 404 });
  let review: ReviewBody;
  try { review = JSON.parse(row.body) as ReviewBody; } catch { return NextResponse.json({ error: 'No report for that month.' }, { status: 404 }); }
  const byArea = (row.metrics as { byArea?: AreaRow[] } | null)?.byArea ?? null;
  const pdf = await renderMonthlyReportPdf({
    courseName: row.course.name, monthLabel: monthLabel(month), lastMonthLabel: monthLabel(previousMonth(`${month}-01`)), review, byArea,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.course.slug}-report-${month}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
