import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { computeAnalytics } from '@/lib/analytics';

// DENSE-4b (Cam 2026-10-27, "yes to all four numbers"): the money half of the
// tee sheet's day strip — Paid and Not paid yet for one day, from computeAnalytics
// (collected course share). Not paid yet is EVERY live group on the day not yet paid —
// outstanding (time passed, no-shows included) + upcoming — because on a sheet staff
// read it as "still to collect" (Cam 2026-10-27: "if 0 of 3 have checked in then how
// have none of them not paid"); lateGroups is the outstanding part. Players and
// checked in come from the sheet's own bookings. Money needs money.payments, as
// on Home; the page only asks when the login has it.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!DATE.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  const a = await computeAnalytics(session.courseId, { from: date, to: date });
  return NextResponse.json({
    date,
    paidCents: a.revenue.collectedCents, paidGroups: a.revenue.beyond.rounds,
    outstandingCents: a.revenue.outstandingCents + a.revenue.upcomingCents,
    outstandingGroups: a.revenue.outstandingBookings + a.revenue.pipeline.upcomingBookings,
    lateGroups: a.revenue.outstandingBookings,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
