import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { computeAnalytics } from '@/lib/analytics';

// Money rework (Cam 2026-10-19, OPERATOR_REWORK_SPEC): the line at the top of
// Money — this week's paid and not-yet-paid, the same definitions as Analytics
// (lib/analytics.ts), so the two pages never disagree. The last 7 days to
// today, course time (a Monday-start week reads $0 every Monday). Gated like the Payments tab it sits over.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, stripeAccountActive: true, stripeAccountId: true } });
  const today = todayIn(course?.timezone);
  const from = addDaysStr(today, -6);
  const a = await computeAnalytics(session.courseId, { from, to: today });
  return NextResponse.json({
    week: { from, to: today },
    paidCents: a.revenue.collectedCents,
    notPaidCents: a.revenue.outstandingCents,
    notPaidGroups: a.revenue.outstandingBookings,
    stripeConnected: !!(course?.stripeAccountActive && course.stripeAccountId),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
