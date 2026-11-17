import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { noShowReport, noShowWithoutMoney } from '@/lib/analytics-page';

// Analytics → No-shows (Cam 2026-11-17, lanes/dashboard.md item 5): no-shows by how they booked, spots filled
// again by how far ahead the golfer cancelled, and late cancels (lib/analytics-page). ?from&to course-local,
// inclusive, default the last 30 days. Gated like the rest of Analytics; the session's course only.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -29), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });
  const r = await noShowReport(session.courseId, range);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Money (value lost, fees, refills, net) only with money.payments, the Revenue page's gate; counts and rates for everyone.
  return NextResponse.json(can(session, 'money.payments') ? r : noShowWithoutMoney(r), { headers: { 'Cache-Control': 'no-store' } });
}
