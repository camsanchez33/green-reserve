import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { computeAnalytics, headline, previousRange, type Range } from '@/lib/analytics';
import { ledgerHeadline, unfilledWithoutMoney } from '@/lib/analytics-page';

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
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; } // SP-A

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
  // AN-3: the page opens on the last 7 days (`days=7`) before it knows the course's date.
  const days = Math.min(MAX_DAYS, Math.max(1, Number(sp.get('days')) || 30));
  const range: Range = DATE.test(from) && DATE.test(to) ? { from, to } : { from: addDaysStr(today, -(days - 1)), to: today };
  if (range.from > range.to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return NextResponse.json({ error: `Pick a range of ${MAX_DAYS} days or fewer.` }, { status: 400 });

  // Analytics page (Cam 2026-11-17): the Revenue tile and chart read `ledger` — the Revenue page's own figure
  // (lib/revenue-extras allSegments), so the two pages can't disagree. revenue.* (tee-date) stays for older readers.
  const [current, ledger] = await Promise.all([computeAnalytics(session.courseId, range), ledgerHeadline(session.courseId, range)]);
  // DENSE-1: the previous period's series too, for the dashed line under the chart.
  const before = sp.get('compare') === '1' ? await computeAnalytics(session.courseId, previousRange(range)) : null;
  const compare = before ? { range: before.range, headline: headline(before), series: before.revenue.series } : null;
  // SEG-1 review: golfers' email and phone (and the record link, whose key IS one) only with
  // "See golfer email and phone" — the same rule as the sheet, bookings and search.
  const customers = can(session, 'sheet.golfer_contact') ? current.customers : {
    ...current.customers,
    goneQuiet: current.customers.goneQuiet.map(r => ({ ...r, email: '', phone: '' })),
    segments: { ...current.customers.segments, rows: current.customers.segments.rows.map(r => ({ ...r, key: '', email: '', phone: '' })) },
  };
  // Analytics page (Cam 2026-11-17, through Build): money only with money.payments (the Revenue page's gate) — the
  // ledger block and the value of unsold spots are left out for a login without it. The page hides; this is the control.
  const money = can(session, 'money.payments');
  const head = headline(current);
  const out = money ? { ...current, customers, headline: head, compare, ledger }
    : { ...current, customers, unfilled: unfilledWithoutMoney(current.unfilled), headline: (({ lostCents: _l, ...h }) => h)(head), compare };
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
