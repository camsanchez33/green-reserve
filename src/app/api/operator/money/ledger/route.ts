import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { ledgerDays, ledgerRows, ledgerCsv, LEDGER_MAX_DAYS } from '@/lib/ledger-view';

// LEDGER-2 (Cam 2026-10-30): the course's money ledger, read-only, its own course only,
// money.payments (as Money → Payments).
//  ?from&to          the days, newest first, with the Stripe match (default: the last 14)
//  ?day=YYYY-MM-DD   every movement of that day
//  ?format=csv       every movement from..to, for the bookkeeper
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, slug: true } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const noStore = { 'Cache-Control': 'no-store' };

  const day = sp.get('day');
  if (day !== null) {
    if (!DATE.test(day)) return NextResponse.json({ error: 'Pick a day.' }, { status: 400 });
    const rows = await ledgerRows(session.courseId, day);
    return NextResponse.json({ day, rows: rows ?? [] }, { headers: noStore });
  }

  const today = todayIn(course.timezone);
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -13), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  const max = sp.get('format') === 'csv' ? 400 : LEDGER_MAX_DAYS;
  if (!Number.isFinite(span) || span > max) return NextResponse.json({ error: `Pick a range of ${max} days or fewer.` }, { status: 400 });

  if (sp.get('format') === 'csv') {
    const csv = await ledgerCsv(session.courseId, range.from, range.to);
    return new NextResponse(csv ?? '', { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${course.slug}-ledger-${range.from}-to-${range.to}.csv"` } });
  }
  const r = await ledgerDays(session.courseId, range.from, range.to);
  return NextResponse.json({ range, today, ...(r ?? { days: [], stripeRead: false, stripeConnected: false }) }, { headers: noStore });
}
