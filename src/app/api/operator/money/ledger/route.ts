import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { ledgerDays, ledgerRows, ledgerRowsRange, ledgerCsv, LEDGER_MAX_DAYS, LEDGER_ROWS_MAX_DAYS, TooManyRows } from '@/lib/ledger-view';
import { stripeDayDetail } from '@/lib/revenue-extras';

// LEDGER-2 (Cam 2026-10-30): the course's money ledger, read-only, its own course only,
// money.payments (as Money → Payments).
//  ?from&to          the days, newest first, with the Stripe match (default: the last 14)
//  ?day=YYYY-MM-DD   every movement of that day
//  ?format=csv       every movement from..to, for the bookkeeper
//  ?day=…            also `mismatch`: when that day's card money differs from Stripe, each payment that makes the
//                    difference and why (Revenue page, Cam 2026-11-15; lib/revenue-extras). Null when it matches.
//  ?from&to&rows=1   every movement from..to (up to 92 days) — Revenue → Payments lists every payment type
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try { return await read(req); } catch (err) {
    if (err instanceof TooManyRows) return NextResponse.json({ error: 'Too many payments in that range — pick a shorter one.' }, { status: 400 });
    throw err;
  }
}

async function read(req: NextRequest) {
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
    const [rows, mismatch] = await Promise.all([ledgerRows(session.courseId, day), stripeDayDetail(session.courseId, day)]);
    return NextResponse.json({ day, rows: rows ?? [], mismatch }, { headers: noStore });
  }

  const today = todayIn(course.timezone);
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -13), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  const max = sp.get('format') === 'csv' ? 400 : LEDGER_MAX_DAYS;
  if (!Number.isFinite(span) || span > max) return NextResponse.json({ error: `Pick a range of ${max} days or fewer.` }, { status: 400 });

  if (sp.get('rows') === '1') {
    if (span > LEDGER_ROWS_MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${LEDGER_ROWS_MAX_DAYS} days or fewer.` }, { status: 400 });
    const rows = await ledgerRowsRange(session.courseId, range.from, range.to);
    return NextResponse.json({ range, rows: rows ?? [] }, { headers: noStore });
  }
  if (sp.get('format') === 'csv') {
    const csv = await ledgerCsv(session.courseId, range.from, range.to);
    return new NextResponse(csv ?? '', { headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${course.slug}-ledger-${range.from}-to-${range.to}.csv"` } });
  }
  // EARNED-1: what reached the bank only with the Payouts permission (as Money → Payouts).
  const r = await ledgerDays(session.courseId, range.from, range.to, { withPayouts: can(session, 'money.payouts') });
  return NextResponse.json({ range, today, ...(r ?? { days: [], stripeRead: false, stripeConnected: false, earned: null, paidOut: null }) }, { headers: noStore });
}
