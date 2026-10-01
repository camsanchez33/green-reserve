import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { computeAnalytics, headline, previousRange, type Range } from '@/lib/analytics';

// AN-1: the operator Analytics tab. GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
// (course-local, inclusive; default the last 30 days) &compare=1 for the
// previous equal-length period's headline numbers. Every figure is computed in
// lib/analytics.ts from the course's own rows. Owner-only: revenue and customer
// spend are not for staff logins (the Money tab draws the same line).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: 'Analytics is available to the course owner’s login.' }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range: Range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -29), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });

  const current = await computeAnalytics(session.courseId, range);
  const compare = sp.get('compare') === '1'
    ? { range: previousRange(range), headline: headline(await computeAnalytics(session.courseId, previousRange(range))) }
    : null;
  return NextResponse.json({ ...current, headline: headline(current), compare }, { headers: { 'Cache-Control': 'no-store' } });
}
